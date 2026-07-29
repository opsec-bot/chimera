import os
import sys
import win32gui
import win32ui

def extract_icon(exe_path, ico_path='output.ico'):
    large, small = win32gui.ExtractIconEx(exe_path, 0)
    if not large:
        print("No icon found.")
        return

    hicon = large[0]
    hdc = win32ui.CreateDCFromHandle(win32gui.GetDC(0))
    hbmp = win32ui.CreateBitmap()
    hbmp.CreateCompatibleBitmap(hdc, 256, 256)
    hdc = hdc.CreateCompatibleDC()
    hdc.SelectObject(hbmp)

    win32gui.DrawIconEx(hdc.GetSafeHdc(), 0, 0, hicon, 256, 256, 0, None, 3)
    hbmp.SaveBitmapFile(hdc, "temp.bmp")

    # Convert BMP to ICO
    from PIL import Image
    img = Image.open("temp.bmp")
    img.save(ico_path, format="ICO")
    os.remove("temp.bmp")
    print(f"Icon saved as {ico_path}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python extract_icon.py <path_to_exe> [output.ico]")
        sys.exit(1)
    
    exe = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else "output.ico"
    extract_icon(exe, out)
