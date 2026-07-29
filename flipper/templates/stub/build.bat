@echo off
setlocal

REM Step 0: Set up MSVC environment
call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"
if %errorlevel% neq 0 (
    echo Failed to load Visual Studio build environment.
    exit /b %errorlevel%
)

REM Step 1: Ensure build directory exists
if not exist build (
    mkdir build
    if %errorlevel% neq 0 (
        echo Failed to create build directory.
        exit /b %errorlevel%
    )
)

REM Step 2: Build C++ DLL
call make.bat
if %errorlevel% neq 0 (
    echo make.bat failed.
    exit /b %errorlevel%
)

REM Step 3: Build Rust project
call cargo build --release
if %errorlevel% neq 0 (
    echo Rust build failed.
    exit /b %errorlevel%
)

REM Step 4: Sign the built binary
REM Make sure BIN_NAME matches Cargo.toml's [[bin]] name
set BIN_NAME=stub.exe
set BIN_PATH=target\release\%BIN_NAME%
set SIGNED_BIN_PATH=target\release\signed_%BIN_NAME%

if exist %BIN_PATH% (
    python sig.py -s extracted.sig -t %BIN_PATH% -a -o %SIGNED_BIN_PATH%
    if %errorlevel% neq 0 (
        echo Signing failed.
        exit /b %errorlevel%
    )
    echo Binary signed successfully: %SIGNED_BIN_PATH%
) else (
    echo ERROR: Compiled binary not found: %BIN_PATH%
    exit /b 1
)

echo.
echo Build and signing complete. Output:
echo    Unsigned: %BIN_PATH%
echo    Signed:   %SIGNED_BIN_PATH%
endlocal
