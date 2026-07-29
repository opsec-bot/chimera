@echo off
setlocal enabledelayedexpansion

echo --------------------------------------------------
echo Building ABE decryption DLL...
echo --------------------------------------------------

echo [INFO] Verifying build environment...
call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"
if not exist "build" (
    echo [INFO]   - Creating build directory...
    mkdir build
)

REM --------------------------------------------------
REM Step 1: Build Payload DLL
echo -- [1/3] Building Payload DLL -------------------------------
echo [INFO]   - Compiling reflective_loader.c
cl /nologo /W3 /O2 /MT /GS- /c cpp\src\reflective_loader.c /Fo"build\reflective_loader.obj"
if errorlevel 1 exit /b 1

echo [INFO]   - Compiling chrome_decrypt.cpp
cl /nologo /W3 /O2 /MT /GS- /EHsc /std:c++17 /c cpp\src\chrome_decrypt.cpp /Fo"build\chrome_decrypt.obj"
if errorlevel 1 exit /b 1

echo [INFO]   - Linking chrome_decrypt.dll
if not exist "build\release" (
    echo [INFO]   - Creating output directory...
    mkdir build\release
)
link /NOLOGO /DLL /OUT:"build\release\chrome_decrypt.dll" ^
    "build\chrome_decrypt.obj" ^
    "build\reflective_loader.obj" ^
    bcrypt.lib ole32.lib oleaut32.lib shell32.lib version.lib comsuppw.lib ^
    /IMPLIB:"build\chrome_decrypt.lib"
if errorlevel 1 exit /b 1

REM --------------------------------------------------
REM Step 2: Build Encryptor
echo -- [2/3] Building Encryptor Utility -------------------------
echo [INFO]   - Compiling encryptor.cpp
cl /nologo /W3 /O2 /MT /GS- /EHsc /std:c++17 /Icpp\libs\chacha cpp\src\encryptor.cpp /Fo"build\encryptor.obj" /link /NOLOGO /DYNAMICBASE /NXCOMPAT /OUT:"build\encryptor.exe"
if errorlevel 1 exit /b 1

REM --------------------------------------------------
REM Step 3: Encrypt Payload
echo -- [3/3] Encrypting Payload ---------------------------------
echo [INFO]   - Running encryptor
build\encryptor.exe build\release\chrome_decrypt.dll build\release\chrome_decrypt.enc
if errorlevel 1 exit /b 1

echo --------------------------------------------------
echo [ OK ] DLL build complete!
endlocal