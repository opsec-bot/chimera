use anyhow::{Result, anyhow};
use std::fs;
use std::path::{Path, PathBuf};

/// Represents a browser type
#[derive(Debug, Clone)]
pub enum BrowserType {
    Firefox,
    LibreWolf,
}

impl BrowserType {
    pub fn name(&self) -> &'static str {
        match self {
            BrowserType::Firefox => "firefox",
            BrowserType::LibreWolf => "librewolf",
        }
    }
}

/// Represents a browser profile
#[derive(Debug, Clone)]
pub struct GeckoProfile {
    pub path: PathBuf,
    pub browser_type: BrowserType,
    pub name: String,
}

impl GeckoProfile {
    pub fn new(path: PathBuf, browser_type: BrowserType) -> Self {
        let name = path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

        Self {
            path,
            browser_type,
            name,
        }
    }

    /// Check if this profile has login data
    pub fn has_login_data(&self) -> bool {
        self.path.join("logins.json").exists()
    }

    /// Get the logins.json file path
    pub fn logins_json_path(&self) -> PathBuf {
        self.path.join("logins.json")
    }

    /// Get the places.sqlite file path (history)
    pub fn places_db_path(&self) -> PathBuf {
        self.path.join("places.sqlite")
    }

    /// Get the formhistory.sqlite file path
    pub fn formhistory_db_path(&self) -> PathBuf {
        self.path.join("formhistory.sqlite")
    }

    /// Get the cookies.sqlite file path
    pub fn cookies_db_path(&self) -> PathBuf {
        self.path.join("cookies.sqlite")
    }
}

/// Profile finder for Firefox and LibreWolf
pub struct ProfileFinder;

impl ProfileFinder {
    /// Find all Firefox and LibreWolf profiles
    pub fn find_all_profiles() -> Result<Vec<GeckoProfile>> {
        let mut profiles = Vec::new();

        // Find Firefox profiles
        if let Ok(firefox_profiles) = Self::find_firefox_profiles() {
            profiles.extend(firefox_profiles);
        }

        // Find LibreWolf profiles
        if let Ok(librewolf_profiles) = Self::find_librewolf_profiles() {
            profiles.extend(librewolf_profiles);
        }

        if profiles.is_empty() {
            return Err(anyhow!("No Firefox or LibreWolf profiles found"));
        }

        Ok(profiles)
    }

    /// Find Firefox profiles
    pub fn find_firefox_profiles() -> Result<Vec<GeckoProfile>> {
        let profile_base = Self::get_firefox_profiles_dir()?;
        Self::find_profiles_in_directory(&profile_base, BrowserType::Firefox)
    }

    /// Find LibreWolf profiles
    pub fn find_librewolf_profiles() -> Result<Vec<GeckoProfile>> {
        let profile_base = Self::get_librewolf_profiles_dir()?;
        Self::find_profiles_in_directory(&profile_base, BrowserType::LibreWolf)
    }

    /// Get Firefox profiles directory
    fn get_firefox_profiles_dir() -> Result<PathBuf> {
        let userprofile = std::env::var("USERPROFILE")
            .map_err(|_| anyhow!("USERPROFILE environment variable not found"))?;
        
        let profile_dir = PathBuf::from(userprofile)
            .join("AppData")
            .join("Roaming")
            .join("Mozilla")
            .join("Firefox")
            .join("Profiles");

        if !profile_dir.exists() {
            return Err(anyhow!("Firefox profiles directory does not exist"));
        }

        Ok(profile_dir)
    }

    /// Get LibreWolf profiles directory
    fn get_librewolf_profiles_dir() -> Result<PathBuf> {
        let userprofile = std::env::var("USERPROFILE")
            .map_err(|_| anyhow!("USERPROFILE environment variable not found"))?;
        
        let profile_dir = PathBuf::from(userprofile)
            .join("AppData")
            .join("Roaming")
            .join("librewolf")
            .join("Profiles");

        if !profile_dir.exists() {
            return Err(anyhow!("LibreWolf profiles directory does not exist"));
        }

        Ok(profile_dir)
    }

    /// Find profiles in a given directory
    fn find_profiles_in_directory(base_dir: &Path, browser_type: BrowserType) -> Result<Vec<GeckoProfile>> {
        let mut profiles = Vec::new();

        let entries = fs::read_dir(base_dir)
            .map_err(|e| anyhow!("Failed to read directory {}: {}", base_dir.display(), e))?;

        for entry in entries {
            let entry = entry.map_err(|e| anyhow!("Failed to read directory entry: {}", e))?;
            let path = entry.path();

            if path.is_dir() {
                let logins_file = path.join("logins.json");
                if logins_file.exists() {
                    profiles.push(GeckoProfile::new(path, browser_type.clone()));
                }
            }
        }

        if profiles.is_empty() {
            return Err(anyhow!("No profiles found in {}", base_dir.display()));
        }

        Ok(profiles)
    }

    /// Find NSS3.dll path for the given browser types
    pub fn find_nss3_dll_path() -> Option<PathBuf> {
        let candidates = [
            // Firefox paths
            r"C:\Program Files\Mozilla Firefox\nss3.dll",
            r"C:\Program Files (x86)\Mozilla Firefox\nss3.dll",
            // LibreWolf paths
            r"C:\Program Files\LibreWolf\nss3.dll",
            r"C:\Program Files (x86)\LibreWolf\nss3.dll",
        ];

        for candidate in &candidates {
            let path = PathBuf::from(candidate);
            if path.exists() {
                return Some(path);
            }
        }

        None
    }
}
