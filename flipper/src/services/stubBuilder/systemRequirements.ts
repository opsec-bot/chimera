import { spawn } from 'child_process';
import { Logger } from '../../utils/logger';

export interface SystemCheck {
  available: boolean;
  version?: string;
  error?: string;
  path?: string;
}

export interface BuildEnvironment {
  rust: SystemCheck;
  python: SystemCheck;
  visualStudio: SystemCheck;
  msvc: SystemCheck;
  vcvars: SystemCheck;
  windowsSDK: SystemCheck;
}

/**
 * System requirements checker for Stub Builder
 *
 * Build Requirements:
 * - Rust Toolchain: rustc 1.87.0+, cargo 1.87.0+
 * - Python 3.13.5+ (for signing with sig.py)
 * - Microsoft Visual Studio 2022 Community Edition (required)
 * - MSVC Compiler Version 19.44.35208+ for x64 (cl.exe)
 * - vcvars64.bat environment setup from:
 *   C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat
 *
 * Usage:
 * 1. Install Visual Studio 2022 Community Edition
 * 2. Run vcvars64.bat before starting the application:
 *    "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"
 * 3. Start the application in the same terminal session
 */
export class SystemRequirements {
  /**
   * Check if Rust and Cargo are installed and available
   * Requires: rustc 1.87.0+, cargo 1.87.0+
   */
  public static async checkRustInstallation(): Promise<SystemCheck> {
    return new Promise((resolve) => {
      const cargo = spawn('cargo', ['--version'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
      });

      let stdout = '';
      let stderr = '';

      cargo.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      cargo.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      cargo.on('close', (code) => {
        if (code === 0) {
          const version = stdout.trim();
          // Extract version number for comparison
          const versionMatch = version.match(/cargo (\d+\.\d+\.\d+)/);
          const versionNum = versionMatch ? versionMatch[1] : 'unknown';

          resolve({ available: true, version, path: 'cargo' });
        } else {
          const error = stderr || 'Cargo command failed';
          Logger.error('Rust/Cargo not available', { error, code });
          resolve({ available: false, error });
        }
      });

      cargo.on('error', (error) => {
        Logger.error('Failed to run cargo command', { error: error.message });
        resolve({
          available: false,
          error: 'Cargo command not found. Please install Rust from https://rustup.rs/',
        });
      });

      // Timeout after 10 seconds
      const timeout = setTimeout(() => {
        cargo.kill('SIGKILL');
        resolve({
          available: false,
          error: 'Cargo command timed out',
        });
      }, 10000);

      cargo.on('close', () => {
        clearTimeout(timeout);
      });
    });
  }

  /**
   * Check if Python 3.13.5+ is installed and available
   * Required for signing executables with sig.py
   */
  public static async checkPythonInstallation(): Promise<SystemCheck> {
    return new Promise((resolve) => {
      const python = spawn('python', ['--version'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
      });

      let stdout = '';
      let stderr = '';

      python.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', (code) => {
        if (code === 0) {
          const version = stdout.trim();
          const versionMatch = version.match(/Python (\d+\.\d+\.\d+)/);
          const versionNum = versionMatch ? versionMatch[1] : 'unknown';

          resolve({ available: true, version, path: 'python' });
        } else {
          const error = stderr || stdout || 'Python command failed';
          Logger.error('Python not available', { error, code });
          resolve({ available: false, error });
        }
      });

      python.on('error', (error) => {
        Logger.error('Failed to run python command', { error: error.message });
        resolve({
          available: false,
          error: 'Python command not found. Please install Python 3.13.5+ from https://python.org/',
        });
      });

      const timeout = setTimeout(() => {
        python.kill('SIGKILL');
        resolve({
          available: false,
          error: 'Python command timed out',
        });
      }, 10000);

      python.on('close', () => {
        clearTimeout(timeout);
      });
    });
  }

  /**
   * Check if Microsoft Visual Studio 2022 Community Edition is installed
   * Requires: Visual Studio 2022 Community Edition
   */
  public static async checkVisualStudioInstallation(): Promise<SystemCheck> {
    const vsPath = 'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community';
    const vcvarsPath = `${vsPath}\\VC\\Auxiliary\\Build\\vcvars64.bat`;

    try {
      const fs = require('fs');

      // Check if Visual Studio 2022 Community directory exists
      if (!fs.existsSync(vsPath)) {
        Logger.error('Visual Studio 2022 Community not found', { expectedPath: vsPath });
        return {
          available: false,
          error:
            'Visual Studio 2022 Community Edition not found. Please install from https://visualstudio.microsoft.com/downloads/',
        };
      }

      // Check if vcvars64.bat exists
      if (!fs.existsSync(vcvarsPath)) {
        Logger.error('vcvars64.bat not found', { expectedPath: vcvarsPath });
        return {
          available: false,
          error:
            'vcvars64.bat not found. Please ensure Visual Studio 2022 Community Edition is properly installed.',
        };
      }

      return {
        available: true,
        version: 'Visual Studio 2022 Community Edition',
        path: vcvarsPath,
      };
    } catch (error) {
      Logger.error('Error checking Visual Studio installation', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        available: false,
        error: 'Error checking Visual Studio installation',
      };
    }
  }

  /**
   * Check if MSVC C++ compiler is available by checking Visual Studio installation directly
   * Requires: Microsoft Visual Studio 2022 Community Edition
   * MSVC Compiler Version 19.44.35208+ for x64 (cl.exe)
   */
  public static async checkMSVCInstallation(): Promise<SystemCheck> {
    const fs = require('fs');
    const path = require('path');

    // Check for MSVC compiler in typical Visual Studio 2022 installation paths
    const possiblePaths = [
      'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Tools\\MSVC',
      'C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\Community\\VC\\Tools\\MSVC',
      'C:\\Program Files\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Tools\\MSVC',
      'C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Tools\\MSVC',
    ];

    for (const basePath of possiblePaths) {
      try {
        if (fs.existsSync(basePath)) {
          // Look for the latest MSVC version directory
          const versionDirs = fs
            .readdirSync(basePath)
            .filter((dir: string) => {
              const fullPath = path.join(basePath, dir);
              return fs.statSync(fullPath).isDirectory() && /^\d+\.\d+\.\d+/.test(dir);
            })
            .sort()
            .reverse(); // Get latest version first

          for (const versionDir of versionDirs) {
            const clPath = path.join(basePath, versionDir, 'bin', 'Hostx64', 'x64', 'cl.exe');
            if (fs.existsSync(clPath)) {
              Logger.info('MSVC Compiler found', {
                version: `MSVC ${versionDir}`,
                path: clPath,
              });
              return {
                available: true,
                version: `MSVC ${versionDir}`,
                path: clPath,
              };
            }
          }
        }
      } catch (error) {
        // Continue checking other paths
        continue;
      }
    }

    Logger.error('MSVC Compiler not found in any standard Visual Studio paths', {
      checkedPaths: possiblePaths,
    });

    return {
      available: false,
      error:
        'MSVC Compiler (cl.exe) not found. Please install Visual Studio 2022 Community Edition with "MSVC v143 - C++ x64/x86 build tools" component.',
    };
  }

  /**
   * Check if vcvars64.bat environment tools are available by checking their installed locations
   * Verifies availability of link.exe, rc.exe, ml64.exe in Visual Studio installation
   * Path: C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat
   */
  public static async checkVCVarsEnvironment(): Promise<SystemCheck> {
    const fs = require('fs');
    const path = require('path');

    const vcvarsPath =
      'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Auxiliary\\Build\\vcvars64.bat';
    const tools: { [key: string]: string[] } = {
      'link.exe': [
        'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Tools\\MSVC\\*\\bin\\Hostx64\\x64\\link.exe',
        'C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\Community\\VC\\Tools\\MSVC\\*\\bin\\Hostx64\\x64\\link.exe',
      ],
      'ml64.exe': [
        'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Tools\\MSVC\\*\\bin\\Hostx64\\x64\\ml64.exe',
        'C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\Community\\VC\\Tools\\MSVC\\*\\bin\\Hostx64\\x64\\ml64.exe',
      ],
      'rc.exe': [
        'C:\\Program Files (x86)\\Windows Kits\\10\\bin\\*\\x64\\rc.exe',
        'C:\\Program Files\\Windows Kits\\10\\bin\\*\\x64\\rc.exe',
      ],
    };

    const results: { [key: string]: boolean } = {};
    const foundPaths: { [key: string]: string } = {};

    for (const [toolName, possiblePaths] of Object.entries(tools)) {
      let found = false;

      for (const pathPattern of possiblePaths) {
        try {
          const basePath = pathPattern.substring(0, pathPattern.lastIndexOf('\\'));
          const fileName = path.basename(pathPattern);

          // Handle wildcard in path
          if (basePath.includes('*')) {
            const beforeWildcard = basePath.substring(0, basePath.indexOf('*') - 1);
            const afterWildcard = basePath.substring(basePath.indexOf('*') + 1);

            if (fs.existsSync(beforeWildcard)) {
              const dirs = fs.readdirSync(beforeWildcard);
              for (const dir of dirs) {
                const fullPath = path.join(beforeWildcard, dir, afterWildcard, fileName);
                if (fs.existsSync(fullPath)) {
                  foundPaths[toolName] = fullPath;
                  found = true;
                  break;
                }
              }
            }
          } else {
            const fullPath = path.join(basePath, fileName);
            if (fs.existsSync(fullPath)) {
              foundPaths[toolName] = fullPath;
              found = true;
            }
          }

          if (found) break;
        } catch {
          continue;
        }
      }

      results[toolName] = found;
    }

    const allToolsAvailable = Object.values(results).every((available) => available);
    const availableTools = Object.keys(results).filter((tool) => results[tool]);
    const missingTools = Object.keys(results).filter((tool) => !results[tool]);

    if (allToolsAvailable) {
      return {
        available: true,
        version: `Build tools available: ${availableTools.join(', ')}`,
        path: vcvarsPath,
      };
    } else {
      Logger.error('Visual Studio build tools incomplete', {
        missing: missingTools,
        available: availableTools,
        foundPaths,
        vcvarsPath,
      });

      const missingComponents = [];
      if (missingTools.includes('link.exe') || missingTools.includes('ml64.exe')) {
        missingComponents.push('MSVC v143 - C++ x64/x86 build tools');
      }
      if (missingTools.includes('rc.exe')) {
        missingComponents.push('Windows 10/11 SDK');
      }

      return {
        available: false,
        error: `Missing build tools: ${missingTools.join(
          ', ',
        )}. Please install these Visual Studio components: ${missingComponents.join(', ')}.`,
      };
    }
  }

  /**
   * Check Windows SDK availability (rc.exe is part of Windows SDK)
   */
  public static async checkWindowsSDK(): Promise<SystemCheck> {
    return new Promise((resolve) => {
      const rc = spawn('rc', ['/?'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
      });

      let stdout = '';
      let stderr = '';

      rc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      rc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      rc.on('close', (code) => {
        const output = stdout + stderr;
        const versionMatch = output.match(
          /Microsoft \(R\) Windows \(R\) Resource Compiler Version ([\d\.]+)/,
        );

        if (versionMatch) {
          const version = `Windows SDK RC ${versionMatch[1]}`;
          resolve({ available: true, version, path: 'rc.exe' });
        } else if (code === 0 || output.includes('Resource Compiler')) {
          resolve({ available: true, version: 'Windows SDK RC (version unknown)', path: 'rc.exe' });
        } else {
          Logger.error('Windows SDK Resource Compiler not available', { output, code });
          resolve({
            available: false,
            error: 'Windows SDK Resource Compiler (rc.exe) not found. Please install Windows SDK.',
          });
        }
      });

      rc.on('error', (error) => {
        Logger.error('Failed to run rc command', { error: error.message });
        resolve({
          available: false,
          error: 'Windows SDK Resource Compiler (rc.exe) not found. Please install Windows SDK.',
        });
      });

      const timeout = setTimeout(() => {
        rc.kill('SIGKILL');
        resolve({
          available: false,
          error: 'Windows SDK Resource Compiler command timed out',
        });
      }, 10000);

      rc.on('close', () => {
        clearTimeout(timeout);
      });
    });
  }

  /**
   * Check system requirements and return health status
   * Returns comprehensive build environment status
   */
  public static async checkSystemRequirements(): Promise<{ healthy: boolean; report: any }> {
    const environment: BuildEnvironment = {
      rust: await this.checkRustInstallation(),
      python: await this.checkPythonInstallation(),
      visualStudio: await this.checkVisualStudioInstallation(),
      msvc: await this.checkMSVCInstallation(),
      vcvars: await this.checkVCVarsEnvironment(),
      windowsSDK: await this.checkWindowsSDK(),
    };

    const criticalRequirements = [
      environment.rust.available,
      environment.python.available,
      environment.visualStudio.available,
      environment.msvc.available,
      environment.vcvars.available,
    ];

    const allRequirementsMet = criticalRequirements.every((req) => req);
    const windowsSDKAvailable = environment.windowsSDK.available;

    const healthReport = {
      rust: environment.rust.available,
      python: environment.python.available,
      visualStudio: environment.visualStudio.available,
      msvc: environment.msvc.available,
      vcvars: environment.vcvars.available,
      windowsSDK: windowsSDKAvailable,
      healthy: allRequirementsMet,
    };

    if (allRequirementsMet) {
      Logger.info('Build environment is healthy', healthReport);
    } else {
      Logger.warn('Build environment issues detected', healthReport);
      this.logMissingRequirements(environment);
    }

    return { healthy: allRequirementsMet, report: healthReport };
  }

  /**
   * Get detailed build environment information
   */
  public static async getBuildEnvironmentInfo(): Promise<BuildEnvironment> {
    return {
      rust: await this.checkRustInstallation(),
      python: await this.checkPythonInstallation(),
      visualStudio: await this.checkVisualStudioInstallation(),
      msvc: await this.checkMSVCInstallation(),
      vcvars: await this.checkVCVarsEnvironment(),
      windowsSDK: await this.checkWindowsSDK(),
    };
  }

  /**
   * Log system check results in a consistent format
   */
  private static logSystemCheck(component: string, check: SystemCheck): void {
    if (check.available) {
      Logger.info(`✓ ${component}: ${check.version || 'Available'}`, {
        path: check.path,
      });
    } else {
      Logger.error(`✗ ${component}: ${check.error || 'Not available'}`);
    }
  }

  /**
   * Log missing requirements with installation instructions
   */
  private static logMissingRequirements(environment: BuildEnvironment): void {
    Logger.warn('='.repeat(80));
    Logger.warn('MISSING BUILD REQUIREMENTS - Installation Instructions:');
    Logger.warn('='.repeat(80));

    if (!environment.rust.available) {
      Logger.warn('RUST: Install from https://rustup.rs/');
      Logger.warn('  Required: rustc 1.87.0+, cargo 1.87.0+');
    }

    if (!environment.python.available) {
      Logger.warn('PYTHON: Install from https://python.org/');
      Logger.warn('  Required: Python 3.13.5+ (needed for sig.py signing)');
    }

    if (!environment.visualStudio.available) {
      Logger.warn('VISUAL STUDIO 2022: Install Visual Studio 2022 Community Edition');
      Logger.warn('  Required: Microsoft Visual Studio 2022 Community Edition');
      Logger.warn('  Download: https://visualstudio.microsoft.com/downloads/');
      Logger.warn('  Ensure "Desktop development with C++" workload is installed');
    }

    if (!environment.msvc.available) {
      Logger.warn('MSVC: MSVC C++ Compiler not available');
      Logger.warn('  Required: MSVC v143 - C++ x64/x86 build tools');
      Logger.warn('  Solution: In Visual Studio Installer, modify your VS2022 installation');
      Logger.warn(
        '  Select "Individual components" → "MSVC v143 - C++ x64/x86 build tools (Latest)"',
      );
    }

    if (!environment.vcvars.available) {
      Logger.warn('BUILD TOOLS: Missing Visual Studio build tools');
      Logger.warn('  Required components:');
      Logger.warn('    - MSVC v143 - C++ x64/x86 build tools (Latest)');
      Logger.warn('    - Windows 10/11 SDK (Latest)');
      Logger.warn('    - CMake tools for Visual Studio (Optional but recommended)');
      Logger.warn('  Solution: Run Visual Studio Installer and modify VS2022 Community');
      Logger.warn('  Under "Workloads" → select "Desktop development with C++"');
      Logger.warn('  This will install all required build tools automatically');
    }

    Logger.warn('='.repeat(80));
    Logger.warn('After installing missing components, restart your application.');
    Logger.warn('='.repeat(80));
  }
}
