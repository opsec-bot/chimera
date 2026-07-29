# Build Requirements

This project requires a Windows environment with the following tools and versions (or newer):

- **Rust Toolchain**

  - `rustc 1.87.0 (17067e9ac 2025-05-09)`
  - `cargo 1.87.0 (99624be96 2025-05-06)`

- **Python**

  - `Python 3.13.5`  
    Used for signing the final executable with `sig.py`.

- **Microsoft Visual Studio 2022 Community Edition**
  - Includes C++ MSVC toolchain and build tools.
  - `Microsoft (R) C/C++ Optimizing Compiler Version 19.44.35208 for x64` (`cl.exe`)
  - `Microsoft (R) Windows (R) Resource Compiler Version 10.0.10011.16384` (`rc.exe`)
  - `Microsoft (R) Incremental Linker Version 14.44.35208.0` (`link.exe`)
  - `Microsoft (R) Macro Assembler (x64) Version 14.44.35208.0` (`ml64.exe`)

## Additional Requirements

- `icon.ico` file in the project root (for executable icon embedding)
- `sig.py` and `extracted.sig` in the project root (for signing)
- All Rust, C++, and assembly source files as provided in the repository

## Checking Your Tool Versions

To verify your environment, run these commands in a terminal:

```sh
rustc --version
cargo --version
python --version
cl.exe
rc.exe /?
link.exe
ml64.exe
```

## Build Steps

1. Build:

   ```sh
   make.bat
   ```

2. The build script will:
   - Compile assembly and C++ components
   - Embed resources (including the icon)
   - Sign the final executable in `target/release/` as `signed_stub.exe`
