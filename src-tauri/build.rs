fn main() {
    println!("cargo:rerun-if-changed=icons/icon.ico");
    println!("cargo:rerun-if-changed=windows-app-manifest.xml");
    // Keep elevation for packaged builds, but let the debug window start
    // normally so the desktop UI can be tested without a UAC launch.
    let windows = if cfg!(debug_assertions) {
        tauri_build::WindowsAttributes::new()
    } else {
        tauri_build::WindowsAttributes::new().app_manifest(include_str!("windows-app-manifest.xml"))
    };
    let attributes = tauri_build::Attributes::new().windows_attributes(windows);
    tauri_build::try_build(attributes).expect("failed to run Tauri build script");
}
