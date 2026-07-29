@echo off
call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"
ml64 /c /Fo target\syscall_trampoline.obj src\syscall_trampoline.asm
