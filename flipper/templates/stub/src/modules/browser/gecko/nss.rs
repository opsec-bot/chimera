use anyhow::{Result, anyhow};
use std::ffi::{CString, c_void};
use std::ptr;
use winapi::um::libloaderapi::{LoadLibraryA, GetProcAddress, FreeLibrary};
use winapi::um::errhandlingapi::GetLastError;
use winapi::shared::minwindef::HMODULE;

/// NSS Security Item structure - matches Go secItem exactly
#[repr(C)]
pub struct SecItem {
    pub item_type: i32,  // Back to i32 to match Go "Type int32"
    pub data: *mut u8,   // Matches Go "*byte"
    pub len: i32,        // Back to i32 to match Go "Len int32"
}

/// NSS function signatures
type NssInitFn = unsafe extern "C" fn(*const i8) -> i32;
type Pk11SdrDecryptFn = unsafe extern "C" fn(*const SecItem, *mut SecItem, *const c_void) -> i32;
type NssShutdownFn = unsafe extern "C" fn() -> i32;
type Pk11GetInternalKeySlotFn = unsafe extern "C" fn() -> *mut c_void;
type Pk11AuthenticateFn = unsafe extern "C" fn(*mut c_void, i32, *const c_void) -> i32;
type Pk11FreeSlotFn = unsafe extern "C" fn(*mut c_void);

/// NSS wrapper for Firefox/LibreWolf decryption
pub struct NssHandler {
    nss3_handle: HMODULE,
    nss_init: NssInitFn,
    pk11_sdr_decrypt: Pk11SdrDecryptFn,
    nss_shutdown: NssShutdownFn,
    pk11_get_internal_key_slot: Pk11GetInternalKeySlotFn,
    pk11_authenticate: Pk11AuthenticateFn,
    pk11_free_slot: Pk11FreeSlotFn,
    current_slot: *mut c_void,
}

impl NssHandler {
    /// Initialize NSS with the given profile path and optional nss3.dll path
    pub fn new(profile_path: &str, nss_dll_path: Option<&str>) -> Result<Self> {
        // Match Go's approach: if nssDLLPath provided, use it and add dir to PATH
        let nss3_path = if let Some(path) = nss_dll_path {
            // Add directory to PATH like Go does: os.Setenv("PATH", os.Getenv("PATH")+";"+dir)
            if let Some(dir) = std::path::Path::new(path).parent() {
                let original_path = std::env::var("PATH").unwrap_or_default();
                let new_path = format!("{};{}", dir.display(), original_path);
                unsafe {
                    std::env::set_var("PATH", &new_path);
                }
            }
            path.to_string()
        } else {
            // Match Go's fallback logic
            let mut found_path = None;
            
            // Try Firefox directories first (like Go does)
            let firefox_candidates = [
                std::env::var("PROGRAMFILES").unwrap_or_default() + "\\Mozilla Firefox",
                std::env::var("PROGRAMFILES(X86)").unwrap_or_default() + "\\Mozilla Firefox",
            ];
            
            for firefox_dir in &firefox_candidates {
                if !firefox_dir.is_empty() && std::path::Path::new(firefox_dir).exists() {
                    // Add to PATH like Go: os.Setenv("PATH", os.Getenv("PATH")+";"+d)
                    let original_path = std::env::var("PATH").unwrap_or_default();
                    let new_path = format!("{};{}", firefox_dir, original_path);
                    unsafe {
                        std::env::set_var("PATH", &new_path);
                    }
                    
                    let nss3_path = format!("{}\\nss3.dll", firefox_dir);
                    if std::path::Path::new(&nss3_path).exists() {
                        found_path = Some(nss3_path);
                        break;
                    }
                }
            }
            
            // If not found, try the specific paths like the original code
            if found_path.is_none() {
                let candidates = [
                    r"C:\Program Files\Mozilla Firefox\nss3.dll",
                    r"C:\Program Files (x86)\Mozilla Firefox\nss3.dll",
                    r"C:\Program Files\LibreWolf\nss3.dll",
                    r"C:\Program Files (x86)\LibreWolf\nss3.dll",
                ];

                for candidate in &candidates {
                    if std::path::Path::new(candidate).exists() {
                        found_path = Some(candidate.to_string());
                        break;
                    }
                }
            }
            
            found_path.ok_or_else(|| {
                let searched_paths = [
                    r"C:\Program Files\Mozilla Firefox\nss3.dll",
                    r"C:\Program Files (x86)\Mozilla Firefox\nss3.dll",
                    r"C:\Program Files\LibreWolf\nss3.dll",
                    r"C:\Program Files (x86)\LibreWolf\nss3.dll",
                ].join(", ");
                anyhow!("Could not find nss3.dll. Searched: {}", searched_paths)
            })?
        };

        // Load nss3.dll with better error handling
        let nss3_path_cstring = CString::new(nss3_path.clone())
            .map_err(|e| anyhow!("Failed to create CString from path '{}': {}", nss3_path, e))?;
        
        let nss3_handle = unsafe { LoadLibraryA(nss3_path_cstring.as_ptr()) };
        if nss3_handle.is_null() {
            let last_error = unsafe { GetLastError() };
            return Err(anyhow!("Failed to load nss3.dll from '{}'. Windows error code: {}. Make sure Firefox/LibreWolf is installed.", nss3_path, last_error));
        }

        // Get function addresses
        let nss_init = Self::get_proc_address(nss3_handle, "NSS_Init")?;
        let pk11_sdr_decrypt = Self::get_proc_address(nss3_handle, "PK11SDR_Decrypt")?;
        let nss_shutdown = Self::get_proc_address(nss3_handle, "NSS_Shutdown")?;
        let pk11_get_internal_key_slot = Self::get_proc_address(nss3_handle, "PK11_GetInternalKeySlot")?;
        let pk11_authenticate = Self::get_proc_address(nss3_handle, "PK11_Authenticate")?;
        let pk11_free_slot = Self::get_proc_address(nss3_handle, "PK11_FreeSlot")?;

        let mut handler = NssHandler {
            nss3_handle,
            nss_init,
            pk11_sdr_decrypt,
            nss_shutdown,
            pk11_get_internal_key_slot,
            pk11_authenticate,
            pk11_free_slot,
            current_slot: ptr::null_mut(),
        };

        // Initialize NSS with the profile
        handler.init_nss(profile_path)?;
        
        Ok(handler)
    }

    /// Get procedure address from DLL
    fn get_proc_address<T>(handle: HMODULE, name: &str) -> Result<T> {
        let name_cstring = CString::new(name)?;
        let proc_addr = unsafe { GetProcAddress(handle, name_cstring.as_ptr()) };
        if proc_addr.is_null() {
            return Err(anyhow!("Failed to get address for {}", name));
        }
        Ok(unsafe { std::mem::transmute_copy(&proc_addr) })
    }

    /// Initialize NSS with profile path
    fn init_nss(&mut self, profile_path: &str) -> Result<()> {
        let profile_cstring = CString::new(profile_path)?;
        let result = unsafe { (self.nss_init)(profile_cstring.as_ptr()) };
        
        if result != 0 {
            return Err(anyhow!("NSS_Init failed with code: {}", result));
        }

        // Get and authenticate internal key slot
        self.current_slot = unsafe { (self.pk11_get_internal_key_slot)() };
        if !self.current_slot.is_null() {
            let auth_result = unsafe { (self.pk11_authenticate)(self.current_slot, 1, ptr::null()) };
            if auth_result != 0 {
                eprintln!("Warning: PK11_Authenticate returned: {}", auth_result);
            }
        }

        Ok(())
    }

    /// Decrypt NSS-encrypted data
    pub fn decrypt(&self, encrypted_data: &[u8]) -> Result<String> {
        if encrypted_data.is_empty() {
            return Err(anyhow!("Empty encrypted data"));
        }

        // Match Go: encItem := secItem{Data: &encBytes[0], Len: int32(len(encBytes))}
        let enc_item = SecItem {
            item_type: 0,  // Go doesn't set Type explicitly, defaults to 0
            data: encrypted_data.as_ptr() as *mut u8,
            len: encrypted_data.len() as i32,
        };

        let mut dec_item = SecItem {
            item_type: 0,
            data: ptr::null_mut(),
            len: 0,
        };

        // Match Go: pk11SDRDecrypt.Call(uintptr(unsafe.Pointer(&encItem)), uintptr(unsafe.Pointer(&decItem)), 0)
        let result = unsafe {
            (self.pk11_sdr_decrypt)(&enc_item, &mut dec_item, ptr::null())
        };

        if result != 0 {
            return Err(anyhow!("PK11SDR_Decrypt failed with code: {}", result));
        }

        if dec_item.data.is_null() || dec_item.len <= 0 {
            return Err(anyhow!("Decryption returned empty result"));
        }

        // Match Go: decBytes := (*[1 << 30]byte)(unsafe.Pointer(decItem.Data))[:decLen:decLen]
        let decrypted_bytes = unsafe {
            std::slice::from_raw_parts(dec_item.data, dec_item.len as usize)
        };

        String::from_utf8(decrypted_bytes.to_vec())
            .map_err(|e| anyhow!("Failed to convert decrypted data to string: {}", e))
    }
}

impl Drop for NssHandler {
    fn drop(&mut self) {
        // Free slot if we have one
        if !self.current_slot.is_null() {
            unsafe { (self.pk11_free_slot)(self.current_slot) };
            self.current_slot = ptr::null_mut();
        }

        // Shutdown NSS
        unsafe { (self.nss_shutdown)() };

        // Free the DLL
        if !self.nss3_handle.is_null() {
            unsafe { FreeLibrary(self.nss3_handle) };
        }
    }
}
