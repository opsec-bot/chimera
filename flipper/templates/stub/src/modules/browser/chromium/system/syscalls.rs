use std::ffi::c_void;
use winapi::shared::ntdef::HANDLE;
use winapi::shared::ntdef::NTSTATUS;
use winapi::shared::minwindef::HMODULE;

use winapi::um::libloaderapi::{GetModuleHandleA, GetProcAddress, LoadLibraryA};

// Function pointer types for the NT APIs we need
type NtAllocateVirtualMemoryFn = unsafe extern "system" fn(
    HANDLE,
    *mut *mut c_void,
    usize,
    *mut usize,
    u32,
    u32,
) -> NTSTATUS;

type NtWriteVirtualMemoryFn = unsafe extern "system" fn(
    HANDLE,
    *mut c_void,
    *const c_void,
    usize,
    *mut usize,
) -> NTSTATUS;

type NtCreateThreadExFn = unsafe extern "system" fn(
    *mut HANDLE,
    u32,
    *mut c_void,
    HANDLE,
    *const c_void,
    *const c_void,
    u32,
    usize,
    usize,
    usize,
    *mut c_void,
) -> NTSTATUS;

type NtFreeVirtualMemoryFn = unsafe extern "system" fn(
    HANDLE,
    *mut *mut c_void,
    *mut usize,
    u32,
) -> NTSTATUS;

type NtProtectVirtualMemoryFn = unsafe extern "system" fn(
    HANDLE,
    *mut *mut c_void,
    *mut usize,
    u32,
    *mut u32,
) -> NTSTATUS;

static mut NT_ALLOCATE_VIRTUAL_MEMORY: Option<NtAllocateVirtualMemoryFn> = None;
static mut NT_WRITE_VIRTUAL_MEMORY: Option<NtWriteVirtualMemoryFn> = None;
static mut NT_CREATE_THREAD_EX: Option<NtCreateThreadExFn> = None;
static mut NT_FREE_VIRTUAL_MEMORY: Option<NtFreeVirtualMemoryFn> = None;
static mut NT_PROTECT_VIRTUAL_MEMORY: Option<NtProtectVirtualMemoryFn> = None;

// Initialize by resolving symbols from ntdll (GetModuleHandle/GetProcAddress,
// fallback to LoadLibrary). This avoids parsing ntdll exports for syscall stubs.
pub fn initialize(verbose: bool) -> bool {
    unsafe {
        if verbose {
            log::debug!("Initializing NT function pointers...");
        }

        // Try to get ntdll module handle
        let mut ntdll = GetModuleHandleA(b"ntdll.dll\0".as_ptr() as *const i8);
        if ntdll.is_null() {
            // Fallback to LoadLibrary
            ntdll = LoadLibraryA(b"ntdll.dll\0".as_ptr() as *const i8);
        }

        if ntdll.is_null() {
            log::error!("Failed to get or load ntdll.dll");
            return false;
        }

        if !resolve_nt_functions(ntdll, verbose) {
            log::error!("Failed to resolve NT functions from ntdll.dll");
            return false;
        }

        if verbose {
            log::debug!("NT functions initialized successfully");
        }

        true
    }
}

fn try_get_proc_addr(module: HMODULE, name: &[u8]) -> Option<*const c_void> {
    // GetProcAddress is unsafe FFI; call inside an unsafe block but keep this helper safe
    let proc = unsafe { GetProcAddress(module, name.as_ptr() as *const i8) };
    if proc.is_null() {
        None
    } else {
        Some(proc as *const c_void)
    }
}

unsafe fn resolve_nt_functions(ntdll: HMODULE, verbose: bool) -> bool {
    // Helper that tries both Zw* and Nt* variants
    macro_rules! resolve_sym {
        ($sym:expr) => {{
            let zw = format!("Zw{}\0", $sym);
            let nt = format!("Nt{}\0", $sym);
            let zw_ptr = try_get_proc_addr(ntdll, zw.as_bytes());
            if zw_ptr.is_some() {
                zw_ptr
            } else {
                try_get_proc_addr(ntdll, nt.as_bytes())
            }
        }};
    }

    // Resolve each function
    let alloc = resolve_sym!("AllocateVirtualMemory");
    let write = resolve_sym!("WriteVirtualMemory");
    let create = resolve_sym!("CreateThreadEx");
    let free = resolve_sym!("FreeVirtualMemory");
    let protect = resolve_sym!("ProtectVirtualMemory");

    if verbose {
        log::debug!(
            "Resolved alloc={:?} write={:?} create={:?} free={:?} protect={:?}",
            alloc,
            write,
            create,
            free,
            protect
        );
    }

    if alloc.is_none() || write.is_none() || create.is_none() || free.is_none() || protect.is_none() {
        return false;
    }

    unsafe {
        NT_ALLOCATE_VIRTUAL_MEMORY = Some(std::mem::transmute(alloc.unwrap()));
        NT_WRITE_VIRTUAL_MEMORY = Some(std::mem::transmute(write.unwrap()));
        NT_CREATE_THREAD_EX = Some(std::mem::transmute(create.unwrap()));
        NT_FREE_VIRTUAL_MEMORY = Some(std::mem::transmute(free.unwrap()));
        NT_PROTECT_VIRTUAL_MEMORY = Some(std::mem::transmute(protect.unwrap()));
    }

    true
}

pub unsafe fn nt_allocate_virtual_memory(
    process_handle: HANDLE,
    base_address: *mut *mut c_void,
    zero_bits: usize,
    region_size: *mut usize,
    allocation_type: u32,
    protect: u32,
) -> NTSTATUS {
    unsafe {
        match NT_ALLOCATE_VIRTUAL_MEMORY {
            Some(f) => f(process_handle, base_address, zero_bits, region_size, allocation_type, protect),
            None => {
                log::error!("NtAllocateVirtualMemory pointer not initialized");
                0xC0000002u32 as NTSTATUS // STATUS_NOT_IMPLEMENTED-ish
            }
        }
    }
}

pub unsafe fn nt_write_virtual_memory(
    process_handle: HANDLE,
    base_address: *mut c_void,
    buffer: *const c_void,
    number_of_bytes_to_write: usize,
    number_of_bytes_written: *mut usize,
) -> NTSTATUS {
    unsafe {
        match NT_WRITE_VIRTUAL_MEMORY {
            Some(f) => f(process_handle, base_address, buffer, number_of_bytes_to_write, number_of_bytes_written),
            None => {
                log::error!("NtWriteVirtualMemory pointer not initialized");
                0xC0000002u32 as NTSTATUS
            }
        }
    }
}

pub unsafe fn nt_create_thread_ex(
    thread_handle: *mut HANDLE,
    desired_access: u32,
    object_attributes: *mut c_void,
    process_handle: HANDLE,
    start_address: *const c_void,
    parameter: *const c_void,
    create_flags: u32,
    zero_bits: usize,
    stack_size: usize,
    maximum_stack_size: usize,
    attribute_list: *mut c_void,
) -> NTSTATUS {
    unsafe {
        match NT_CREATE_THREAD_EX {
            Some(f) => f(
                thread_handle,
                desired_access,
                object_attributes,
                process_handle,
                start_address,
                parameter,
                create_flags,
                zero_bits,
                stack_size,
                maximum_stack_size,
                attribute_list,
            ),
            None => {
                log::error!("NtCreateThreadEx pointer not initialized");
                0xC0000002u32 as NTSTATUS
            }
        }
    }
}

pub unsafe fn nt_free_virtual_memory(
    process_handle: HANDLE,
    base_address: *mut *mut c_void,
    region_size: *mut usize,
    free_type: u32,
) -> NTSTATUS {
    unsafe {
        match NT_FREE_VIRTUAL_MEMORY {
            Some(f) => f(process_handle, base_address, region_size, free_type),
            None => {
                log::error!("NtFreeVirtualMemory pointer not initialized");
                0xC0000002u32 as NTSTATUS
            }
        }
    }
}

pub unsafe fn nt_protect_virtual_memory(
    process_handle: HANDLE,
    base_address: *mut *mut c_void,
    region_size: *mut usize,
    new_protect: u32,
    old_protect: *mut u32,
) -> NTSTATUS {
    unsafe {
        match NT_PROTECT_VIRTUAL_MEMORY {
            Some(f) => f(process_handle, base_address, region_size, new_protect, old_protect),
            None => {
                log::error!("NtProtectVirtualMemory pointer not initialized");
                0xC0000002u32 as NTSTATUS
            }
        }
    }
 }
