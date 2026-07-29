use anyhow::{Result, anyhow};

pub fn find_reflective_loader_offset(dll_buffer: &[u8]) -> Result<usize> {
    // Parse PE headers
    if dll_buffer.len() < 64 {
        return Err(anyhow!("Buffer too small for PE headers"));
    }

    // Check DOS signature
    if &dll_buffer[0..2] != b"MZ" {
        return Err(anyhow!("Invalid DOS signature"));
    }

    // Get PE header offset
    let pe_offset = u32::from_le_bytes([
        dll_buffer[60],
        dll_buffer[61],
        dll_buffer[62],
        dll_buffer[63],
    ]) as usize;

    if pe_offset + 4 > dll_buffer.len() {
        return Err(anyhow!("Invalid PE offset"));
    }

    // Check PE signature
    if &dll_buffer[pe_offset..pe_offset + 4] != b"PE\0\0" {
        return Err(anyhow!("Invalid PE signature"));
    }

    // Parse COFF header
    let coff_header_offset = pe_offset + 4;
    if coff_header_offset + 20 > dll_buffer.len() {
        return Err(anyhow!("Buffer too small for COFF header"));
    }

    // Get optional header size from COFF header
    let optional_header_size = u16::from_le_bytes([
        dll_buffer[coff_header_offset + 16],
        dll_buffer[coff_header_offset + 17],
    ]);

    // Calculate optional header offset
    let optional_header_offset = coff_header_offset + 20;

    if optional_header_offset + optional_header_size as usize > dll_buffer.len() {
        return Err(anyhow!("Buffer too small for optional header"));
    }

    // Check magic number to determine PE32 vs PE32+
    let magic = u16::from_le_bytes([
        dll_buffer[optional_header_offset],
        dll_buffer[optional_header_offset + 1],
    ]);

    // Calculate data directory offset based on PE format
    let data_directory_offset = match magic {
        0x10b => optional_header_offset + 96,  // PE32
        0x20b => optional_header_offset + 112, // PE32+
        _ => return Err(anyhow!("Invalid PE magic number: 0x{:x}", magic)),
    };

    // Export table is the first entry in the data directory
    let export_table_offset = data_directory_offset;

    if export_table_offset + 8 > dll_buffer.len() {
        return Err(anyhow!("Buffer too small for export table"));
    }

    let export_rva = u32::from_le_bytes([
        dll_buffer[export_table_offset],
        dll_buffer[export_table_offset + 1],
        dll_buffer[export_table_offset + 2],
        dll_buffer[export_table_offset + 3],
    ]);

    let export_size = u32::from_le_bytes([
        dll_buffer[export_table_offset + 4],
        dll_buffer[export_table_offset + 5],
        dll_buffer[export_table_offset + 6],
        dll_buffer[export_table_offset + 7],
    ]);

    if export_rva == 0 || export_size == 0 {
        return Err(anyhow!("No export table found"));
    }

    // Convert RVA to file offset
    let export_offset = match rva_to_offset(export_rva, dll_buffer) {
        Ok(offset) => offset,
        Err(e) => {
            return Err(anyhow!(
                "Failed to convert export RVA to file offset: {}",
                e
            ));
        }
    };

    // Parse export directory
    if export_offset + 40 > dll_buffer.len() {
        return Err(anyhow!("Buffer too small for export directory"));
    }

    let number_of_names = u32::from_le_bytes([
        dll_buffer[export_offset + 24],
        dll_buffer[export_offset + 25],
        dll_buffer[export_offset + 26],
        dll_buffer[export_offset + 27],
    ]);

    let address_of_names_rva = u32::from_le_bytes([
        dll_buffer[export_offset + 32],
        dll_buffer[export_offset + 33],
        dll_buffer[export_offset + 34],
        dll_buffer[export_offset + 35],
    ]);

    let address_of_functions_rva = u32::from_le_bytes([
        dll_buffer[export_offset + 28],
        dll_buffer[export_offset + 29],
        dll_buffer[export_offset + 30],
        dll_buffer[export_offset + 31],
    ]);

    let address_of_name_ordinals_rva = u32::from_le_bytes([
        dll_buffer[export_offset + 36],
        dll_buffer[export_offset + 37],
        dll_buffer[export_offset + 38],
        dll_buffer[export_offset + 39],
    ]);

    // Convert RVAs to file offsets
    let names_offset = rva_to_offset(address_of_names_rva, dll_buffer)?;
    let functions_offset = rva_to_offset(address_of_functions_rva, dll_buffer)?;
    let ordinals_offset = rva_to_offset(address_of_name_ordinals_rva, dll_buffer)?;

    // Search for "ReflectiveLoader" export
    for i in 0..number_of_names {
        let name_rva_offset = names_offset + (i as usize) * 4;
        if name_rva_offset + 4 > dll_buffer.len() {
            continue;
        }

        let name_rva = u32::from_le_bytes([
            dll_buffer[name_rva_offset],
            dll_buffer[name_rva_offset + 1],
            dll_buffer[name_rva_offset + 2],
            dll_buffer[name_rva_offset + 3],
        ]);

        let name_offset = rva_to_offset(name_rva, dll_buffer)?;
        let name = read_null_terminated_string(&dll_buffer[name_offset..])?;

        if name == "ReflectiveLoader" {
            // Found it! Get the function RVA
            let ordinal_offset = ordinals_offset + (i as usize) * 2;
            if ordinal_offset + 2 > dll_buffer.len() {
                return Err(anyhow!("Invalid ordinal offset"));
            }

            let ordinal =
                u16::from_le_bytes([dll_buffer[ordinal_offset], dll_buffer[ordinal_offset + 1]]);

            let function_rva_offset = functions_offset + (ordinal as usize) * 4;
            if function_rva_offset + 4 > dll_buffer.len() {
                return Err(anyhow!("Invalid function RVA offset"));
            }

            let function_rva = u32::from_le_bytes([
                dll_buffer[function_rva_offset],
                dll_buffer[function_rva_offset + 1],
                dll_buffer[function_rva_offset + 2],
                dll_buffer[function_rva_offset + 3],
            ]);

            return rva_to_offset(function_rva, dll_buffer);
        }
    }

    Err(anyhow!("ReflectiveLoader export not found"))
}

fn rva_to_offset(rva: u32, dll_buffer: &[u8]) -> Result<usize> {
    if dll_buffer.len() < 64 {
        return Err(anyhow!("Buffer too small for PE headers"));
    }

    // Get PE header offset
    let pe_offset = u32::from_le_bytes([
        dll_buffer[60],
        dll_buffer[61],
        dll_buffer[62],
        dll_buffer[63],
    ]) as usize;

    // Parse COFF header to get number of sections
    let coff_header_offset = pe_offset + 4;
    let number_of_sections = u16::from_le_bytes([
        dll_buffer[coff_header_offset + 2],
        dll_buffer[coff_header_offset + 3],
    ]);

    let optional_header_size = u16::from_le_bytes([
        dll_buffer[coff_header_offset + 16],
        dll_buffer[coff_header_offset + 17],
    ]);

    // Section headers start after optional header
    let section_headers_offset = coff_header_offset + 20 + optional_header_size as usize;

    // Search through section headers
    for i in 0..number_of_sections {
        let section_offset = section_headers_offset + (i as usize * 40);

        if section_offset + 40 > dll_buffer.len() {
            continue;
        }

        let virtual_address = u32::from_le_bytes([
            dll_buffer[section_offset + 12],
            dll_buffer[section_offset + 13],
            dll_buffer[section_offset + 14],
            dll_buffer[section_offset + 15],
        ]);

        let virtual_size = u32::from_le_bytes([
            dll_buffer[section_offset + 8],
            dll_buffer[section_offset + 9],
            dll_buffer[section_offset + 10],
            dll_buffer[section_offset + 11],
        ]);

        let raw_address = u32::from_le_bytes([
            dll_buffer[section_offset + 20],
            dll_buffer[section_offset + 21],
            dll_buffer[section_offset + 22],
            dll_buffer[section_offset + 23],
        ]);

        // Check if RVA falls within this section
        if rva >= virtual_address && rva < virtual_address + virtual_size {
            let offset = raw_address + (rva - virtual_address);

            if offset as usize >= dll_buffer.len() {
                return Err(anyhow!(
                    "Calculated offset 0x{:x} is beyond buffer size",
                    offset
                ));
            }

            return Ok(offset as usize);
        }
    }

    // If no section found, try direct mapping (fallback)
    let offset = rva as usize;
    if offset >= dll_buffer.len() {
        return Err(anyhow!(
            "RVA 0x{:x} is beyond buffer size and no matching section found",
            rva
        ));
    }

    Ok(offset)
}

fn read_null_terminated_string(data: &[u8]) -> Result<String> {
    let null_pos = data.iter().position(|&b| b == 0).unwrap_or(data.len());

    String::from_utf8(data[..null_pos].to_vec())
        .map_err(|e| anyhow!("Invalid UTF-8 in string: {}", e))
}
