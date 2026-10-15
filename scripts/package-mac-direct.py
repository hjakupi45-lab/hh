import os
import sys
import zipfile
import re
import urllib.request

APP_NAME = "Electron by Haris"
VERSION = "1.0.0"
BUNDLE_ID = "com.haris.electronbyharis"
ELECTRON_VERSION = "44.7.2"

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DIST_DIR = os.path.join(ROOT_DIR, "dist")
CACHE_DIR = os.path.join(ROOT_DIR, "mac-cache")

os.makedirs(DIST_DIR, exist_ok=True)
os.makedirs(CACHE_DIR, exist_ok=True)

def download_electron_zip(arch):
    zip_name = f"electron-v{ELECTRON_VERSION}-darwin-{arch}.zip"
    dest_path = os.path.join(CACHE_DIR, zip_name)
    if os.path.exists(dest_path) and os.path.getsize(dest_path) > 50 * 1024 * 1024:
        print(f"[Cache Hit] Found {zip_name}")
        return dest_path
    
    url = f"https://github.com/electron/electron/releases/download/v{ELECTRON_VERSION}/{zip_name}"
    print(f"[Downloading] {url} ...")
    urllib.request.urlretrieve(url, dest_path)
    print(f"[Downloaded] Saved {dest_path} ({round(os.path.getsize(dest_path)/(1024*1024), 1)} MB)")
    return dest_path

def create_mac_bundle(arch, arch_label):
    print(f"\n==========================================================")
    print(f"  Packaging macOS Standalone Application ({arch_label})")
    print(f"==========================================================\n")
    
    src_zip_path = download_electron_zip(arch)
    out_zip_name = f"Electron-by-Haris-{VERSION}-macOS-{arch_label}.zip"
    out_zip_path = os.path.join(DIST_DIR, out_zip_name)
    
    if os.path.exists(out_zip_path):
        os.remove(out_zip_path)
        
    print(f"[Packaging] Generating standalone Mac bundle: {out_zip_name} ...")
    
    with zipfile.ZipFile(src_zip_path, 'r') as src_zip:
        with zipfile.ZipFile(out_zip_path, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as dst_zip:
            # 1. Transfer existing Electron framework files with renamed root
            for item in src_zip.infolist():
                orig_name = item.filename
                
                # Skip default app asar
                if "default_app.asar" in orig_name:
                    continue
                
                data = src_zip.read(orig_name)
                
                # Rename root folder
                new_name = orig_name.replace("Electron.app/", f"{APP_NAME}.app/", 1)
                
                # Rename main executable
                if new_name == f"{APP_NAME}.app/Contents/MacOS/Electron":
                    new_name = f"{APP_NAME}.app/Contents/MacOS/{APP_NAME}"
                
                # Modify Info.plist metadata
                if new_name == f"{APP_NAME}.app/Contents/Info.plist":
                    plist_text = data.decode('utf-8', errors='ignore')
                    plist_text = re.sub(r'<key>CFBundleDisplayName</key>\s*<string>[^<]*</string>',
                                        f'<key>CFBundleDisplayName</key>\n\t<string>{APP_NAME}</string>', plist_text)
                    plist_text = re.sub(r'<key>CFBundleName</key>\s*<string>[^<]*</string>',
                                        f'<key>CFBundleName</key>\n\t<string>{APP_NAME}</string>', plist_text)
                    plist_text = re.sub(r'<key>CFBundleExecutable</key>\s*<string>[^<]*</string>',
                                        f'<key>CFBundleExecutable</key>\n\t<string>{APP_NAME}</string>', plist_text)
                    plist_text = re.sub(r'<key>CFBundleIdentifier</key>\s*<string>[^<]*</string>',
                                        f'<key>CFBundleIdentifier</key>\n\t<string>{BUNDLE_ID}</string>', plist_text)
                    plist_text = re.sub(r'<key>CFBundleVersion</key>\s*<string>[^<]*</string>',
                                        f'<key>CFBundleVersion</key>\n\t<string>{VERSION}</string>', plist_text)
                    plist_text = re.sub(r'<key>CFBundleShortVersionString</key>\s*<string>[^<]*</string>',
                                        f'<key>CFBundleShortVersionString</key>\n\t<string>{VERSION}</string>', plist_text)
                    data = plist_text.encode('utf-8')
                
                # Create destination zipinfo with preserved Unix attributes
                new_info = zipfile.ZipInfo(new_name)
                new_info.date_time = item.date_time
                new_info.external_attr = item.external_attr  # Preserves Unix symlink (0o120755) and executable (0o755) flags!
                new_info.compress_type = zipfile.ZIP_DEFLATED
                
                dst_zip.writestr(new_info, data)
            
            # 2. Add Project Source Code: app/
            app_dir = os.path.join(ROOT_DIR, "app")
            for root, dirs, files in os.walk(app_dir):
                for f in files:
                    full_p = os.path.join(root, f)
                    rel_p = os.path.relpath(full_p, ROOT_DIR).replace('\\', '/')
                    zip_entry_name = f"{APP_NAME}.app/Contents/Resources/app/{rel_p}"
                    with open(full_p, 'rb') as fp:
                        content = fp.read()
                    zinfo = zipfile.ZipInfo(zip_entry_name)
                    zinfo.external_attr = 0o644 << 16  # standard Unix file
                    zinfo.compress_type = zipfile.ZIP_DEFLATED
                    dst_zip.writestr(zinfo, content)
            
            # 3. Add package.json
            pkg_json_p = os.path.join(ROOT_DIR, "package.json")
            with open(pkg_json_p, 'rb') as fp:
                pkg_data = fp.read()
            zinfo = zipfile.ZipInfo(f"{APP_NAME}.app/Contents/Resources/app/package.json")
            zinfo.external_attr = 0o644 << 16
            zinfo.compress_type = zipfile.ZIP_DEFLATED
            dst_zip.writestr(zinfo, pkg_data)
            
            # 4. Add Production Dependencies: node_modules/
            prod_modules_dir = os.path.join(ROOT_DIR, "node_modules")
            skip_mods = {".bin", "electron", "electron-builder", "app-builder-bin", "dmg-builder"}
            for mod_name in os.listdir(prod_modules_dir):
                if mod_name in skip_mods or mod_name.startswith("."):
                    continue
                mod_path = os.path.join(prod_modules_dir, mod_name)
                if os.path.isdir(mod_path):
                    for root, dirs, files in os.walk(mod_path):
                        for f in files:
                            full_p = os.path.join(root, f)
                            rel_p = os.path.relpath(full_p, ROOT_DIR).replace('\\', '/')
                            zip_entry_name = f"{APP_NAME}.app/Contents/Resources/app/{rel_p}"
                            with open(full_p, 'rb') as fp:
                                content = fp.read()
                            zinfo = zipfile.ZipInfo(zip_entry_name)
                            zinfo.external_attr = 0o644 << 16
                            zinfo.compress_type = zipfile.ZIP_DEFLATED
                            dst_zip.writestr(zinfo, content)
            
            # 5. Add Chrome Extension to Resources/extension
            ext_dir = os.path.join(ROOT_DIR, "extension")
            for root, dirs, files in os.walk(ext_dir):
                for f in files:
                    full_p = os.path.join(root, f)
                    rel_p = os.path.relpath(full_p, ext_dir).replace('\\', '/')
                    zip_entry_name = f"{APP_NAME}.app/Contents/Resources/extension/{rel_p}"
                    with open(full_p, 'rb') as fp:
                        content = fp.read()
                    zinfo = zipfile.ZipInfo(zip_entry_name)
                    zinfo.external_attr = 0o644 << 16
                    zinfo.compress_type = zipfile.ZIP_DEFLATED
                    dst_zip.writestr(zinfo, content)

    final_size_mb = round(os.path.getsize(out_zip_path) / (1024 * 1024), 2)
    print(f"\n[DONE] Built macOS {arch_label} Package: {out_zip_name} ({final_size_mb} MB)")
    print(f"Path: {out_zip_path}\n")
    return out_zip_path

def main():
    # 1. Package for Apple Silicon (M1/M2/M3/M4 - MacBook Air)
    create_mac_bundle("arm64", "AppleSilicon")
    # 2. Package for Intel Macs
    create_mac_bundle("x64", "Intel")
    print("\nAll standalone macOS packages created successfully in /dist directory!\n")

if __name__ == "__main__":
    main()
