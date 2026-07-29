use std::ffi::OsString;
use std::os::windows::ffi::OsStringExt;
use std::path::Path;

use winapi::shared::minwindef::{ DWORD, FALSE };
use winapi::um::handleapi::CloseHandle;
use winapi::um::tlhelp32::{
    CreateToolhelp32Snapshot,
    Process32FirstW,
    Process32NextW,
    PROCESSENTRY32W,
    TH32CS_SNAPPROCESS,
};

use goldberg::goldberg_string;

// Needed for INVALID_HANDLE_VALUE
const INVALID_HANDLE_VALUE: *mut winapi::ctypes::c_void = -1isize as *mut winapi::ctypes::c_void;

/// Returns list of known VM-related files
fn vm_files() -> Vec<String> {
    vec![
        // VMware Tools & Drivers
        goldberg_string!(r"C:\windows\system32\vmGuestLib.dll").to_string(),
        goldberg_string!(r"C:\windows\system32\vm3dgl.dll").to_string(),
        goldberg_string!(r"C:\windows\system32\vmsrvc.dll").to_string(),
        goldberg_string!(r"C:\windows\system32\drivers\vmsrvc.sys").to_string(),
        goldberg_string!(r"C:\windows\system32\drivers\vmci.sys").to_string(),
        goldberg_string!(r"C:\windows\system32\drivers\vmhgfs.sys").to_string(),
        goldberg_string!(r"C:\windows\system32\drivers\vmmouse.sys").to_string(),
        goldberg_string!(r"C:\windows\system32\drivers\vmusb.sys").to_string(),
        goldberg_string!(r"C:\windows\system32\drivers\vmx_svga.sys").to_string(),

        // VirtualBox Guest Additions & Drivers
        goldberg_string!(r"C:\windows\system32\vboxhook.dll").to_string(),
        goldberg_string!(r"C:\windows\system32\vboxmrxnp.dll").to_string(),
        goldberg_string!(r"C:\windows\system32\vboxogl.dll").to_string(),
        goldberg_string!(r"C:\windows\system32\vboxoglarrayspu.dll").to_string(),
        goldberg_string!(r"C:\windows\system32\vboxoglcrutil.dll").to_string(),
        goldberg_string!(r"C:\windows\system32\vboxoglerrorspu.dll").to_string(),
        goldberg_string!(r"C:\windows\system32\vboxoglfeedbackspu.dll").to_string(),
        goldberg_string!(r"C:\windows\system32\vboxoglpackspu.dll").to_string(),
        goldberg_string!(r"C:\windows\system32\vboxoglpassthroughspu.dll").to_string(),
        goldberg_string!(r"C:\windows\system32\drivers\vboxmouse.sys").to_string(),
        goldberg_string!(r"C:\windows\system32\drivers\vboxsf.sys").to_string(),
        goldberg_string!(r"C:\windows\system32\drivers\vboxvideo.sys").to_string(),

        // Parallels Tools & Drivers
        goldberg_string!(r"C:\windows\system32\drivers\prl_fs.sys").to_string(),
        goldberg_string!(r"C:\windows\system32\drivers\prl_tg.sys").to_string(),
        goldberg_string!(r"C:\windows\system32\drivers\prl_eth.sys").to_string(),
        goldberg_string!(r"C:\windows\system32\drivers\prl_mouse.sys").to_string(),
        goldberg_string!(r"C:\windows\system32\prl_tools.dll").to_string(),

        // Common VM files for other hypervisors
        goldberg_string!(r"C:\windows\system32\drivers\hvservice.sys").to_string(), // Hyper-V
        goldberg_string!(r"C:\windows\system32\drivers\hv_vmbus.sys").to_string() // Hyper-V
    ]
}

/// Returns list of blacklisted process names
fn blacklisted_processes() -> Vec<String> {
    vec![
        // Virtual Machine Tools & Services
        goldberg_string!("vmtoolsd").to_string(), // VMware Tools Daemon
        goldberg_string!("vmwaretray").to_string(), // VMware Tray
        goldberg_string!("vmwareuser").to_string(), // VMware User Agent
        goldberg_string!("vmsrvc").to_string(), // VMware Service
        goldberg_string!("vgauthservice").to_string(), // VMware Authentication Service
        goldberg_string!("vmacthlp").to_string(), // VMware Helper
        goldberg_string!("vboxservice").to_string(), // VirtualBox Guest Additions
        goldberg_string!("vboxtray").to_string(), // VirtualBox Tray Application
        goldberg_string!("vbox").to_string(), // VirtualBox generic
        goldberg_string!("prl_").to_string(), // Parallels tools prefix
        goldberg_string!("qemu").to_string(), // QEMU Hypervisor
        goldberg_string!("xen").to_string(), // Xen Hypervisor
        goldberg_string!("xenservice").to_string(), // Xen Service
        goldberg_string!("hyperv").to_string(), // Microsoft Hyper-V

        // Debugging Tools & Reverse Engineering
        goldberg_string!("ida").to_string(), // IDA Pro/Free
        goldberg_string!("ollydbg").to_string(), // OllyDbg
        goldberg_string!("olly").to_string(), // OllyDbg shorthand
        goldberg_string!("x64dbg").to_string(), // x64dbg
        goldberg_string!("x32dbg").to_string(), // x32dbg
        goldberg_string!("dbg").to_string(), // Generic debugger substring
        goldberg_string!("debug").to_string(), // Generic debug substring
        goldberg_string!("cheatengine").to_string(), // Cheat Engine
        goldberg_string!("pestudio").to_string(), // PE Studio malware analysis tool
        goldberg_string!("procmon").to_string(), // Process Monitor
        goldberg_string!("procexp").to_string(), // Process Explorer
        goldberg_string!("resourcehacker").to_string(), // Resource Hacker
        goldberg_string!("pe-bear").to_string(), // PE file analyzer
        goldberg_string!("scylla").to_string(), // PE dumper/unpacker
        goldberg_string!("importrec").to_string(), // Import Address Table fixer
        goldberg_string!("hiew").to_string(), // Hex editor

        // Network & HTTP Debugging Tools
        goldberg_string!("fiddler").to_string(), // Fiddler HTTP proxy
        goldberg_string!("httpdebugger").to_string(), // HTTP Debugger Pro
        goldberg_string!("httpdebuggerui").to_string(), // HTTP Debugger UI
        goldberg_string!("wireshark").to_string(), // Wireshark packet sniffer
        goldberg_string!("dumpcap").to_string(), // Wireshark capture engine
        goldberg_string!("tcpview").to_string(), // TCPView network connections viewer
        goldberg_string!("httptoolkit").to_string(), // HTTP Toolkit
        goldberg_string!("http toolkit").to_string(), // HTTP Toolkit (with space)
        goldberg_string!("http-toolkit").to_string(), // HTTP Toolkit (with hyphen)

        // Sandboxing & Malware Analysis
        goldberg_string!("joebox").to_string(), // Joe Sandbox
        goldberg_string!("joeboxcontrol").to_string(), // Joe Sandbox control
        goldberg_string!("joeboxserver").to_string(), // Joe Sandbox server
        goldberg_string!("sandbox").to_string(), // Generic sandbox substring
        goldberg_string!("fakenet").to_string(), // FakeNet-NG network simulator

        // Dumpers & Reverse Engineering Helpers
        goldberg_string!("ksdumper").to_string(), // Kernel dumper
        goldberg_string!("ksdumperclient").to_string(), // Kernel dumper client
        goldberg_string!("megadumper").to_string(), // .NET dumper
        goldberg_string!("dnspy").to_string(), // .NET reverse engineering tool
        goldberg_string!("reclass").to_string(), // Memory class analyzer

        // Miscellaneous
        goldberg_string!("df5serv").to_string(), // Unknown - likely VM or debugging related
        goldberg_string!("fakenet").to_string(), // Fake network traffic simulator
        goldberg_string!("prl_cc").to_string(), // Parallels control center
        goldberg_string!("prl_tools").to_string() // Parallels tools
    ]
}

/// Converts wide pointer string to Rust `String`
fn wide_ptr_to_string(ptr: &[u16]) -> String {
    OsString::from_wide(
        ptr
            .split(|&c| c == 0)
            .next()
            .unwrap_or(&[])
    )
        .to_string_lossy()
        .into_owned()
}

/// Detects blacklisted processes in process list (substring match, case-insensitive)
fn detect_blacklisted_processes() -> bool {
    let blacklist = blacklisted_processes();
    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };

    if snapshot == INVALID_HANDLE_VALUE {
        return false;
    }

    let mut pe32: PROCESSENTRY32W = unsafe { std::mem::zeroed() };
    pe32.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as DWORD;

    let mut found = false;
    let mut result = unsafe { Process32FirstW(snapshot, &mut pe32) };

    while result != FALSE {
        let exe_name = wide_ptr_to_string(&pe32.szExeFile).to_ascii_lowercase();
        if blacklist.iter().any(|black| exe_name.contains(&black.to_ascii_lowercase())) {
            found = true;
            break;
        }
        result = unsafe { Process32NextW(snapshot, &mut pe32) };
    }

    unsafe {
        CloseHandle(snapshot);
    }
    found
}

/// Detects if any known VM file exists on disk
fn detect_vm_files() -> bool {
    vm_files()
        .iter()
        .any(|file| Path::new(file).exists())
}

/// Will exit the program if running in a protected (monitored/virtualized) environment
pub fn block_if_protected() {
    if detect_blacklisted_processes() || detect_vm_files() {
        std::process::exit(0);
    }
}
