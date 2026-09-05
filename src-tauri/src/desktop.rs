use once_cell::sync::Lazy;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
#[cfg(feature = "release-core")]
use std::io::Write;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
#[cfg(not(feature = "release-core"))]
use std::sync::atomic::AtomicU64;
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, PhysicalSize, Size, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_opener::OpenerExt;

const DLC_DIRECTORY_NAME: &str = "wwcombo dlc";
#[cfg(not(feature = "release-core"))]
const SIMULATION_LEAD_MS: u64 = 0;

static INPUT_HOOK_STARTED: AtomicBool = AtomicBool::new(false);
static GLOBAL_INPUT_ENABLED: AtomicBool = AtomicBool::new(false);
static GLOBAL_INPUT_MODE: AtomicU8 = AtomicU8::new(GLOBAL_INPUT_MODE_KEYBOARD);
static VIDEO_EXPORT_CANCELLED: AtomicBool = AtomicBool::new(false);
static VIDEO_RECOGNITION_CANCELLED: AtomicBool = AtomicBool::new(false);
static VIDEO_RECOGNITION_RUNNING: AtomicBool = AtomicBool::new(false);
#[cfg(not(feature = "release-core"))]
static SIMULATION_RUN_ID: AtomicU64 = AtomicU64::new(0);
#[cfg(feature = "release-core")]
static SIMULATED_INPUT_PROCESS: Lazy<Mutex<Option<std::process::Child>>> =
    Lazy::new(|| Mutex::new(None));
static INPUT_HOOK_STATUS: Lazy<Mutex<String>> = Lazy::new(|| Mutex::new(String::from("idle")));
static INPUT_EVENT_COUNT: Lazy<Mutex<u64>> = Lazy::new(|| Mutex::new(0));
static INPUT_PRESSED_CODES: Lazy<Mutex<HashSet<String>>> = Lazy::new(|| Mutex::new(HashSet::new()));
static APP_HANDLE: Lazy<Mutex<Option<AppHandle>>> = Lazy::new(|| Mutex::new(None));
static AUXILIARY_WINDOW_CREATION_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));
static OVERLAY_STATE: Lazy<Mutex<serde_json::Value>> =
    Lazy::new(|| Mutex::new(serde_json::json!({ "visible": false, "moveMode": false })));
static OVERLAY_BOUNDS_STATE: Lazy<Mutex<OverlayBounds>> = Lazy::new(|| {
    Mutex::new(OverlayBounds {
        x: 160.0,
        y: 36.0,
        width: 980.0,
        height: 118.0,
    })
});
static OVERLAY_NOTES_STATE: Lazy<Mutex<serde_json::Value>> =
    Lazy::new(|| Mutex::new(serde_json::json!({ "visible": false, "moveMode": false })));
static OVERLAY_NOTES_BOUNDS_STATE: Lazy<Mutex<OverlayBounds>> = Lazy::new(|| {
    Mutex::new(OverlayBounds {
        x: 210.0,
        y: 140.0,
        width: 840.0,
        height: 300.0,
    })
});
static RHYTHM_FEEDBACK_STATE: Lazy<Mutex<serde_json::Value>> =
    Lazy::new(|| Mutex::new(serde_json::json!({ "visible": false, "moveMode": false })));
static KEY_MAPPING_STATE: Lazy<Mutex<serde_json::Value>> = Lazy::new(|| {
    Mutex::new(serde_json::json!({ "visible": false, "moveMode": false, "pressedCodes": [] }))
});
static RECORDING_INDICATOR_STATE: Lazy<Mutex<serde_json::Value>> = Lazy::new(|| {
    Mutex::new(serde_json::json!({ "visible": false, "recording": false, "corner": "bottom-left" }))
});
static REALTIME_VISION_STATE: Lazy<Mutex<serde_json::Value>> = Lazy::new(|| {
    Mutex::new(
        serde_json::json!({ "visible": false, "corner": "top-right", "timer": null, "buffs": [], "moveMode": false }),
    )
});

const GLOBAL_INPUT_MODE_KEYBOARD: u8 = 0;
const GLOBAL_INPUT_MODE_XBOX: u8 = 1;
const GLOBAL_INPUT_MODE_PLAYSTATION: u8 = 2;

fn global_input_mode_name(mode: u8) -> &'static str {
    match mode {
        GLOBAL_INPUT_MODE_XBOX => "xbox",
        GLOBAL_INPUT_MODE_PLAYSTATION => "playstation",
        _ => "keyboard",
    }
}

fn parse_global_input_mode(mode: &str) -> Option<u8> {
    match mode.trim().to_ascii_lowercase().as_str() {
        "keyboard" => Some(GLOBAL_INPUT_MODE_KEYBOARD),
        "xbox" => Some(GLOBAL_INPUT_MODE_XBOX),
        "playstation" | "ps" => Some(GLOBAL_INPUT_MODE_PLAYSTATION),
        _ => None,
    }
}

fn clear_global_input_pressed_state() {
    INPUT_PRESSED_CODES.lock().clear();
}

#[derive(Clone, Serialize)]
struct DesktopInputEvent {
    source: &'static str,
    #[serde(rename = "type")]
    event_type: String,
    #[serde(rename = "captureMode")]
    capture_mode: &'static str,
    code: String,
    time: f64,
    #[serde(rename = "shiftKey")]
    shift_key: bool,
}

#[derive(Clone, Copy, Deserialize, Serialize)]
struct OverlayBounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Clone, Copy, Deserialize, Serialize)]
struct OverlayPosition {
    x: f64,
    y: f64,
}

#[derive(Clone, Copy, Serialize)]
struct DisplaySize {
    width: f64,
    height: f64,
    #[serde(rename = "scaleFactor")]
    scale_factor: f64,
}

#[derive(Clone, Serialize)]
struct SaveExportResult {
    path: String,
}

#[derive(Clone, Serialize)]
struct ExportVideoResult {
    path: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SimulatedInputEvent {
    at_ms: u64,
    #[serde(rename = "type")]
    event_type: String,
    code: String,
    #[serde(default)]
    cursor_dx: i32,
    #[serde(default)]
    cursor_dy: i32,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SimulatedInputLaunch {
    starts_in_ms: u64,
}

#[derive(Clone, Serialize)]
struct PickedVideoFile {
    path: String,
    name: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VideoRecognitionHotspot {
    id: String,
    x: f64,
    y: f64,
    radius: f64,
    #[serde(default)]
    merge_repeated_hold: bool,
    #[serde(default)]
    preserve_tap_gaps: bool,
    #[serde(default = "default_recognition_sensitivity")]
    sensitivity: f64,
}

fn default_recognition_sensitivity() -> f64 {
    1.0
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VideoRecognitionRequest {
    source_path: String,
    start_ms: u64,
    duration_ms: u64,
    crop_x: u32,
    crop_y: u32,
    crop_width: u32,
    crop_height: u32,
    fps: u32,
    hotspots: Vec<VideoRecognitionHotspot>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct VideoRecognitionEvent {
    hotspot_id: String,
    start_ms: u64,
    duration_ms: u64,
    confidence: f64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct VideoRecognitionResult {
    events: Vec<VideoRecognitionEvent>,
    analyzed_frames: u64,
    fps: u32,
}

#[derive(Clone, Copy)]
struct VideoRecognitionFrameSample {
    active: bool,
    weak_active: bool,
    confidence: f64,
}

struct VideoRecognitionRunGuard;

impl Drop for VideoRecognitionRunGuard {
    fn drop(&mut self) {
        VIDEO_RECOGNITION_RUNNING.store(false, Ordering::SeqCst);
    }
}

type FeedbackBounds = OverlayBounds;

const FEEDBACK_MIN_WIDTH: u32 = 160;
const FEEDBACK_MIN_HEIGHT: u32 = 64;
const FEEDBACK_MAX_WIDTH: u32 = 520;
const FEEDBACK_MAX_HEIGHT: u32 = 180;
const KEY_MAPPING_MIN_WIDTH: u32 = 160;
const KEY_MAPPING_MIN_HEIGHT: u32 = 120;
const KEY_MAPPING_MAX_WIDTH: u32 = 2400;
const KEY_MAPPING_MAX_HEIGHT: u32 = 2000;
const RECORDING_INDICATOR_SIZE: f64 = 18.0;
const RECORDING_INDICATOR_MARGIN: f64 = 2.0;
const REALTIME_VISION_WIDTH: f64 = 360.0;
const REALTIME_VISION_BASE_HEIGHT: f64 = 40.0;
const REALTIME_VISION_ROW_HEIGHT: f64 = 36.0;
const REALTIME_VISION_MARGIN: f64 = 24.0;
const REALTIME_VISION_MIN_WIDTH: f64 = 180.0;
const REALTIME_VISION_MAX_WIDTH: f64 = 1440.0;
const REALTIME_VISION_MIN_HEIGHT: f64 = 64.0;
const REALTIME_VISION_MAX_HEIGHT: f64 = 1000.0;
const REMOTE_CHARACTER_AVATAR_API: &str =
    "https://wuwa-hpyg-tool.200503.xyz/api/v1/batch-icons/character";

fn configure_overlay_window(app: &AppHandle, window: &WebviewWindow) {
    let _ = window.set_always_on_top(true);
    let _ = window.set_shadow(false);
    let _ = window.set_ignore_cursor_events(true);
    let app_handle = app.clone();
    let window_for_event = window.clone();
    window.on_window_event(move |event| match event {
        WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
            emit_overlay_window_bounds(&app_handle, &window_for_event);
        }
        _ => {}
    });
}

fn ensure_overlay_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    let _creation_guard = AUXILIARY_WINDOW_CREATION_LOCK.lock();
    if let Some(window) = app.get_webview_window("overlay") {
        return Ok(window);
    }
    let bounds = *OVERLAY_BOUNDS_STATE.lock();
    let window = WebviewWindowBuilder::new(app, "overlay", WebviewUrl::App("overlay.html".into()))
        .title("Combo Overlay")
        .inner_size(bounds.width.max(1.0), bounds.height.max(1.0))
        .position(bounds.x, bounds.y)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(true)
        .shadow(false)
        .visible(false)
        .build()
        .map_err(|error| error.to_string())?;
    configure_overlay_window(app, &window);
    Ok(window)
}

fn configure_rhythm_feedback_window(app: &AppHandle, window: &WebviewWindow) {
    let _ = window.set_always_on_top(true);
    let _ = window.set_shadow(false);
    let _ = window.set_ignore_cursor_events(true);
    let _ = window.set_min_size(Some(Size::Physical(PhysicalSize::new(
        FEEDBACK_MIN_WIDTH,
        FEEDBACK_MIN_HEIGHT,
    ))));
    let _ = window.set_max_size(Some(Size::Physical(PhysicalSize::new(
        FEEDBACK_MAX_WIDTH,
        FEEDBACK_MAX_HEIGHT,
    ))));
    let app_handle = app.clone();
    let window_for_event = window.clone();
    window.on_window_event(move |event| match event {
        WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
            emit_rhythm_feedback_window_bounds(&app_handle, &window_for_event);
        }
        _ => {}
    });
}

fn ensure_rhythm_feedback_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    let _creation_guard = AUXILIARY_WINDOW_CREATION_LOCK.lock();
    if let Some(window) = app.get_webview_window("rhythm-feedback") {
        return Ok(window);
    }
    let window = WebviewWindowBuilder::new(
        app,
        "rhythm-feedback",
        WebviewUrl::App("rhythm-feedback.html".into()),
    )
    .title("Rhythm Feedback")
    .inner_size(260.0, 96.0)
    .position(520.0, 320.0)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(true)
    .shadow(false)
    .visible(false)
    .build()
    .map_err(|error| error.to_string())?;
    configure_rhythm_feedback_window(app, &window);
    Ok(window)
}

fn configure_key_mapping_window(app: &AppHandle, window: &WebviewWindow) {
    let _ = window.set_always_on_top(true);
    let _ = window.set_shadow(false);
    let _ = window.set_ignore_cursor_events(true);
    let _ = window.set_min_size(Some(Size::Logical(LogicalSize::new(
        KEY_MAPPING_MIN_WIDTH as f64,
        KEY_MAPPING_MIN_HEIGHT as f64,
    ))));
    let _ = window.set_max_size(Some(Size::Logical(LogicalSize::new(
        KEY_MAPPING_MAX_WIDTH as f64,
        KEY_MAPPING_MAX_HEIGHT as f64,
    ))));
    let app_handle = app.clone();
    let window_for_event = window.clone();
    window.on_window_event(move |event| match event {
        WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
            emit_key_mapping_window_bounds(&app_handle, &window_for_event);
        }
        _ => {}
    });
}

fn ensure_key_mapping_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    let _creation_guard = AUXILIARY_WINDOW_CREATION_LOCK.lock();
    if let Some(window) = app.get_webview_window("key-mapping") {
        return Ok(window);
    }
    let window = WebviewWindowBuilder::new(
        app,
        "key-mapping",
        WebviewUrl::App("key-mapping.html".into()),
    )
    .title("Key Mapping Overlay")
    .inner_size(620.0, 514.0)
    .position(520.0, 220.0)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(true)
    .shadow(false)
    .visible(false)
    .build()
    .map_err(|error| error.to_string())?;
    configure_key_mapping_window(app, &window);
    Ok(window)
}

fn ensure_recording_indicator_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    let _creation_guard = AUXILIARY_WINDOW_CREATION_LOCK.lock();
    if let Some(window) = app.get_webview_window("recording-indicator") {
        return Ok(window);
    }
    let window = WebviewWindowBuilder::new(
        app,
        "recording-indicator",
        WebviewUrl::App("recording-indicator.html".into()),
    )
    .title("Recording Status")
    .inner_size(48.0, 48.0)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .focusable(false)
    .shadow(false)
    .visible(false)
    .build()
    .map_err(|error| error.to_string())?;
    let _ = window.set_ignore_cursor_events(true);
    Ok(window)
}

fn ensure_realtime_vision_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    let _creation_guard = AUXILIARY_WINDOW_CREATION_LOCK.lock();
    if let Some(window) = app.get_webview_window("realtime-vision") {
        return Ok(window);
    }
    let window = WebviewWindowBuilder::new(
        app,
        "realtime-vision",
        WebviewUrl::App("realtime-vision.html".into()),
    )
    .title("Real-time Vision Alert")
    .inner_size(
        REALTIME_VISION_WIDTH,
        REALTIME_VISION_BASE_HEIGHT + REALTIME_VISION_ROW_HEIGHT,
    )
    .position(40.0, 80.0)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .focusable(false)
    .shadow(false)
    .visible(false)
    .build()
    .map_err(|error| error.to_string())?;
    let _ = window.set_ignore_cursor_events(true);
    Ok(window)
}

#[tauri::command]
async fn fetch_remote_character_avatars() -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|error| format!("创建角色头像请求客户端失败：{error}"))?;
    let response = client
        .get(REMOTE_CHARACTER_AVATAR_API)
        .send()
        .await
        .map_err(|error| format!("请求角色头像清单失败：{error}"))?;
    if !response.status().is_success() {
        return Err(format!("角色头像清单返回异常状态：{}", response.status()));
    }
    response
        .json::<serde_json::Value>()
        .await
        .map_err(|error| format!("解析角色头像清单失败：{error}"))
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Live2dDlcAsset {
    id: String,
    skeleton_path: String,
    atlas_path: String,
    texture_path: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DlcStatus {
    root_path: String,
    ffmpeg_installed: bool,
    simulated_input_installed: bool,
    live2d_assets: Vec<Live2dDlcAsset>,
}

fn push_unique_path(paths: &mut Vec<PathBuf>, candidate: PathBuf) {
    if !paths.iter().any(|path| path == &candidate) {
        paths.push(candidate);
    }
}

fn executable_directory() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()
        .and_then(|executable| executable.parent().map(Path::to_path_buf))
}

fn preferred_dlc_root(app: &AppHandle) -> PathBuf {
    if let Some(directory) = executable_directory() {
        return directory.join(DLC_DIRECTORY_NAME);
    }
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(DLC_DIRECTORY_NAME)
}

fn dlc_search_roots(app: &AppHandle) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    push_unique_path(&mut roots, preferred_dlc_root(app));
    if let Ok(resource_dir) = app.path().resource_dir() {
        push_unique_path(&mut roots, resource_dir.join(DLC_DIRECTORY_NAME));
    }
    if let Ok(app_data_dir) = app.path().app_data_dir() {
        push_unique_path(&mut roots, app_data_dir.join(DLC_DIRECTORY_NAME));
    }
    if let Some(repository_root) = Path::new(env!("CARGO_MANIFEST_DIR")).parent() {
        push_unique_path(&mut roots, repository_root.join(DLC_DIRECTORY_NAME));
    }
    roots
}

fn safe_relative_asset_path(package_root: &Path, raw_path: &str) -> Option<PathBuf> {
    let relative = Path::new(raw_path);
    if relative.is_absolute()
        || relative.components().any(|component| {
            matches!(
                component,
                std::path::Component::ParentDir
                    | std::path::Component::Prefix(_)
                    | std::path::Component::RootDir
            )
        })
    {
        return None;
    }
    let candidate = package_root.join(relative);
    candidate.is_file().then_some(candidate)
}

fn live2d_assets_from_manifest(manifest_path: &Path) -> Vec<Live2dDlcAsset> {
    let Ok(source) = fs::read_to_string(manifest_path) else {
        return Vec::new();
    };
    let source = source.strip_prefix('\u{feff}').unwrap_or(&source);
    let Ok(value) = serde_json::from_str::<serde_json::Value>(source) else {
        return Vec::new();
    };
    let Some(package_root) = manifest_path.parent() else {
        return Vec::new();
    };

    let mut records = Vec::new();
    if let (Some(id), Some(skeleton)) = (
        value.get("id").and_then(serde_json::Value::as_str),
        value.get("skeleton").and_then(serde_json::Value::as_str),
    ) {
        if let (Some(path), Some(atlas_path), Some(texture_path)) = (
            safe_relative_asset_path(package_root, skeleton),
            value
                .get("atlas")
                .and_then(serde_json::Value::as_str)
                .and_then(|raw_path| safe_relative_asset_path(package_root, raw_path)),
            value
                .get("texture")
                .and_then(serde_json::Value::as_str)
                .and_then(|raw_path| safe_relative_asset_path(package_root, raw_path)),
        ) {
            records.push(Live2dDlcAsset {
                id: id.to_string(),
                skeleton_path: path.to_string_lossy().into_owned(),
                atlas_path: atlas_path.to_string_lossy().into_owned(),
                texture_path: texture_path.to_string_lossy().into_owned(),
            });
        }
    }

    if let Some(characters) = value
        .get("characters")
        .and_then(serde_json::Value::as_array)
    {
        for character in characters {
            let Some(id) = character.get("id").and_then(serde_json::Value::as_str) else {
                continue;
            };
            let Some(skeleton) = character
                .get("skeleton")
                .and_then(serde_json::Value::as_str)
            else {
                continue;
            };
            if let (Some(path), Some(atlas_path), Some(texture_path)) = (
                safe_relative_asset_path(package_root, skeleton),
                character
                    .get("atlas")
                    .and_then(serde_json::Value::as_str)
                    .and_then(|raw_path| safe_relative_asset_path(package_root, raw_path)),
                character
                    .get("texture")
                    .and_then(serde_json::Value::as_str)
                    .and_then(|raw_path| safe_relative_asset_path(package_root, raw_path)),
            ) {
                records.push(Live2dDlcAsset {
                    id: id.to_string(),
                    skeleton_path: path.to_string_lossy().into_owned(),
                    atlas_path: atlas_path.to_string_lossy().into_owned(),
                    texture_path: texture_path.to_string_lossy().into_owned(),
                });
            }
        }
    }
    records
}

fn scan_live2d_package_directory(root: &Path) -> Vec<Live2dDlcAsset> {
    let live2d_root = root.join("live2d");
    let Ok(entries) = fs::read_dir(live2d_root) else {
        return Vec::new();
    };
    entries
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false))
        .flat_map(|entry| live2d_assets_from_manifest(&entry.path().join("manifest.json")))
        .collect()
}

fn legacy_live2d_roots(app: &AppHandle) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        push_unique_path(&mut roots, resource_dir.join("live2d"));
        push_unique_path(&mut roots, resource_dir.join("live2d-optional"));
    }
    if let Some(directory) = executable_directory() {
        push_unique_path(&mut roots, directory.join("live2d"));
        push_unique_path(&mut roots, directory.join("live2d-optional"));
    }
    roots
}

fn installed_live2d_assets(app: &AppHandle) -> Vec<Live2dDlcAsset> {
    let mut assets = HashMap::<String, Live2dDlcAsset>::new();
    for root in dlc_search_roots(app) {
        for asset in scan_live2d_package_directory(&root) {
            assets.entry(asset.id.clone()).or_insert(asset);
        }
    }
    for root in legacy_live2d_roots(app) {
        for asset in live2d_assets_from_manifest(&root.join("manifest.json")) {
            assets.entry(asset.id.clone()).or_insert(asset);
        }
    }
    let mut result = assets.into_values().collect::<Vec<_>>();
    result.sort_by(|left, right| left.id.cmp(&right.id));
    result
}

#[tauri::command]
fn get_dlc_status(app: AppHandle) -> DlcStatus {
    DlcStatus {
        root_path: preferred_dlc_root(&app).to_string_lossy().into_owned(),
        ffmpeg_installed: find_ffmpeg_in_dlc(&app).is_some(),
        simulated_input_installed: find_simulated_input_dlc(&app).is_some(),
        live2d_assets: installed_live2d_assets(&app),
    }
}

#[tauri::command]
fn open_dlc_folder(app: AppHandle) -> Result<String, String> {
    let root = preferred_dlc_root(&app);
    fs::create_dir_all(root.join("ffmpeg"))
        .map_err(|error| format!("无法创建 DLC 目录：{error}"))?;
    fs::create_dir_all(root.join("simulated-input"))
        .map_err(|error| format!("无法创建 DLC 目录：{error}"))?;
    fs::create_dir_all(root.join("live2d"))
        .map_err(|error| format!("无法创建 DLC 目录：{error}"))?;
    let path = root.to_string_lossy().into_owned();
    app.opener()
        .open_path(path.clone(), None::<String>)
        .map_err(|error| format!("无法打开 DLC 目录：{error}"))?;
    Ok(path)
}

#[cfg(test)]
mod dlc_tests {
    use super::{
        live2d_assets_from_manifest, safe_relative_asset_path, scan_live2d_package_directory,
    };
    use std::fs;
    use std::path::Path;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_root(label: &str) -> std::path::PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        std::env::temp_dir().join(format!("wwcombo-{label}-{nonce}"))
    }

    #[test]
    fn rejects_live2d_assets_outside_the_package() {
        let root = temp_root("dlc-path");
        fs::create_dir_all(root.join("assets")).unwrap();
        fs::write(root.join("assets").join("model.skel"), b"test").unwrap();
        assert!(safe_relative_asset_path(&root, "assets/model.skel").is_some());
        assert!(safe_relative_asset_path(&root, "../model.skel").is_none());
        assert!(safe_relative_asset_path(&root, "C:\\model.skel").is_none());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn discovers_an_individual_live2d_package() {
        let root = temp_root("dlc-package");
        let package = root.join("live2d").join("zani-1507");
        fs::create_dir_all(package.join("assets")).unwrap();
        fs::write(package.join("assets").join("zani.skel"), b"test").unwrap();
        fs::write(package.join("assets").join("zani.atlas"), b"test").unwrap();
        fs::write(package.join("assets").join("zani.webp"), b"test").unwrap();
        fs::write(
            package.join("manifest.json"),
            br#"{"schemaVersion":1,"type":"wwcombo-live2d","id":"zani","skeleton":"assets/zani.skel","atlas":"assets/zani.atlas","texture":"assets/zani.webp"}"#,
        )
        .unwrap();
        let assets = scan_live2d_package_directory(&root);
        assert_eq!(assets.len(), 1);
        assert_eq!(assets[0].id, "zani");
        assert!(Path::new(&assets[0].skeleton_path).is_file());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn discovers_a_live2d_package_with_utf8_bom_manifest() {
        let root = temp_root("dlc-package-bom");
        let package = root.join("live2d").join("zani-1507");
        fs::create_dir_all(package.join("assets")).unwrap();
        fs::write(package.join("assets").join("zani.skel"), b"test").unwrap();
        fs::write(package.join("assets").join("zani.atlas"), b"test").unwrap();
        fs::write(package.join("assets").join("zani.webp"), b"test").unwrap();
        let mut manifest = vec![0xef, 0xbb, 0xbf];
        manifest.extend_from_slice(
            br#"{"schemaVersion":1,"type":"wwcombo-live2d","id":"zani","skeleton":"assets/zani.skel","atlas":"assets/zani.atlas","texture":"assets/zani.webp"}"#,
        );
        fs::write(package.join("manifest.json"), manifest).unwrap();
        let assets = scan_live2d_package_directory(&root);
        assert_eq!(assets.len(), 1);
        assert_eq!(assets[0].id, "zani");
        assert!(Path::new(&assets[0].skeleton_path).is_file());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn keeps_legacy_collection_manifests_compatible() {
        let root = temp_root("dlc-legacy");
        fs::create_dir_all(root.join("theme").join("zani")).unwrap();
        fs::write(root.join("theme").join("zani").join("zani.skel"), b"test").unwrap();
        fs::write(root.join("theme").join("zani").join("zani.atlas"), b"test").unwrap();
        fs::write(root.join("theme").join("zani").join("zani.webp"), b"test").unwrap();
        let manifest = root.join("manifest.json");
        fs::write(
            &manifest,
            br#"{"characters":[{"id":"zani","skeleton":"theme/zani/zani.skel","atlas":"theme/zani/zani.atlas","texture":"theme/zani/zani.webp"}]}"#,
        )
        .unwrap();
        let assets = live2d_assets_from_manifest(&manifest);
        assert_eq!(assets.len(), 1);
        assert_eq!(assets[0].id, "zani");
        fs::remove_dir_all(root).unwrap();
    }
}

#[tauri::command]
async fn set_overlay_visible(app: AppHandle, visible: bool) -> Result<(), String> {
    if let Some(record) = OVERLAY_STATE.lock().as_object_mut() {
        record.insert(String::from("visible"), serde_json::Value::Bool(visible));
    }
    let window = match app.get_webview_window("overlay") {
        Some(window) => window,
        None if !visible => return Ok(()),
        None => ensure_overlay_window(&app)?,
    };
    if visible {
        let _ = window.set_always_on_top(true);
        let _ = window.set_shadow(false);
        let _ = window.set_ignore_cursor_events(true);
        window.show().map_err(|error| error.to_string())?;
    } else {
        window.hide().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn set_overlay_click_through(app: AppHandle, enabled: bool) -> Result<(), String> {
    let window = match app.get_webview_window("overlay") {
        Some(window) => window,
        None if enabled => return Ok(()),
        None => ensure_overlay_window(&app)?,
    };
    window
        .set_ignore_cursor_events(enabled)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn set_overlay_bounds(app: AppHandle, bounds: OverlayBounds) -> Result<(), String> {
    *OVERLAY_BOUNDS_STATE.lock() = bounds;
    let Some(window) = app.get_webview_window("overlay") else {
        return Ok(());
    };
    let _ = window.set_shadow(false);
    window
        .set_position(PhysicalPosition::new(
            bounds.x.round() as i32,
            bounds.y.round() as i32,
        ))
        .map_err(|error| error.to_string())?;
    window
        .set_size(PhysicalSize::new(
            bounds.width.max(1.0).round() as u32,
            bounds.height.max(1.0).round() as u32,
        ))
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn set_overlay_position(app: AppHandle, position: OverlayPosition) -> Result<(), String> {
    {
        let mut bounds = OVERLAY_BOUNDS_STATE.lock();
        bounds.x = position.x;
        bounds.y = position.y;
    }
    let Some(window) = app.get_webview_window("overlay") else {
        return Ok(());
    };
    window
        .set_position(PhysicalPosition::new(
            position.x.round() as i32,
            position.y.round() as i32,
        ))
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn get_overlay_bounds(app: AppHandle) -> Result<OverlayBounds, String> {
    let Some(window) = app.get_webview_window("overlay") else {
        return Ok(*OVERLAY_BOUNDS_STATE.lock());
    };
    let position = window.outer_position().map_err(|error| error.to_string())?;
    let size = window.outer_size().map_err(|error| error.to_string())?;
    let bounds = OverlayBounds {
        x: position.x as f64,
        y: position.y as f64,
        width: size.width as f64,
        height: size.height as f64,
    };
    *OVERLAY_BOUNDS_STATE.lock() = bounds;
    Ok(bounds)
}

#[tauri::command]
fn get_overlay_state() -> serde_json::Value {
    OVERLAY_STATE.lock().clone()
}

#[tauri::command]
fn get_display_size(app: AppHandle) -> Result<DisplaySize, String> {
    let window = app
        .get_webview_window("overlay")
        .or_else(|| app.get_webview_window("main"))
        .ok_or_else(|| String::from("window not found"))?;
    let monitor = window
        .current_monitor()
        .map_err(|error| error.to_string())?
        .or_else(|| window.primary_monitor().ok().flatten())
        .ok_or_else(|| String::from("monitor not found"))?;
    let size = monitor.size();
    Ok(DisplaySize {
        width: size.width as f64,
        height: size.height as f64,
        scale_factor: monitor.scale_factor(),
    })
}

fn apply_recording_indicator_state(
    app: &AppHandle,
    payload: &serde_json::Value,
) -> Result<(), String> {
    let window = app
        .get_webview_window("recording-indicator")
        .ok_or_else(|| String::from("recording indicator window not found"))?;
    let visible = payload
        .get("visible")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    if !visible {
        let _ = window.set_ignore_cursor_events(true);
        return window.hide().map_err(|error| error.to_string());
    }

    let anchor = app
        .get_webview_window("main")
        .unwrap_or_else(|| window.clone());
    let monitor = anchor
        .current_monitor()
        .map_err(|error| error.to_string())?
        .or_else(|| anchor.primary_monitor().ok().flatten())
        .ok_or_else(|| String::from("monitor not found"))?;
    let corner = payload
        .get("corner")
        .and_then(|value| value.as_str())
        .unwrap_or("bottom-left");
    let scale = monitor.scale_factor().max(0.5);
    let physical_window_size = (RECORDING_INDICATOR_SIZE * scale).round() as i32;
    let margin = (RECORDING_INDICATOR_MARGIN * scale).round() as i32;
    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let left = monitor_position.x + margin;
    let right = monitor_position.x + monitor_size.width as i32 - physical_window_size - margin;
    let top = monitor_position.y + margin;
    let bottom = monitor_position.y + monitor_size.height as i32 - physical_window_size - margin;
    let (x, y) = match corner {
        "top-left" => (left, top),
        "top-right" => (right, top),
        "bottom-right" => (right, bottom),
        _ => (left, bottom),
    };

    window
        .set_size(Size::Logical(LogicalSize::new(
            RECORDING_INDICATOR_SIZE,
            RECORDING_INDICATOR_SIZE,
        )))
        .map_err(|error| error.to_string())?;
    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|error| error.to_string())?;
    let _ = window.set_always_on_top(true);
    let _ = window.set_shadow(false);
    let _ = window.set_focusable(false);
    let _ = window.set_ignore_cursor_events(true);
    window.show().map_err(|error| error.to_string())
}

#[tauri::command]
async fn update_recording_indicator(
    app: AppHandle,
    payload: serde_json::Value,
) -> Result<(), String> {
    let corner = match payload.get("corner").and_then(|value| value.as_str()) {
        Some("top-left") => "top-left",
        Some("top-right") => "top-right",
        Some("bottom-right") => "bottom-right",
        _ => "bottom-left",
    };
    let normalized = serde_json::json!({
        "visible": payload.get("visible").and_then(|value| value.as_bool()).unwrap_or(false),
        "recording": payload.get("recording").and_then(|value| value.as_bool()).unwrap_or(false),
        "corner": corner
    });
    *RECORDING_INDICATOR_STATE.lock() = normalized.clone();
    let visible = normalized
        .get("visible")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    if app.get_webview_window("recording-indicator").is_none() {
        if !visible {
            return Ok(());
        }
        ensure_recording_indicator_window(&app)?;
    }
    if !visible {
        if let Some(window) = app.get_webview_window("recording-indicator") {
            let _ = window.hide();
            let _ = window.destroy();
        }
        return Ok(());
    }
    apply_recording_indicator_state(&app, &normalized)?;
    app.get_webview_window("recording-indicator")
        .ok_or_else(|| String::from("recording indicator window not found"))?
        .emit("recording-indicator:update", normalized)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn get_recording_indicator_state() -> serde_json::Value {
    RECORDING_INDICATOR_STATE.lock().clone()
}

fn normalize_realtime_vision_bounds(bounds: OverlayBounds) -> OverlayBounds {
    OverlayBounds {
        x: if bounds.x.is_finite() { bounds.x } else { 40.0 },
        y: if bounds.y.is_finite() { bounds.y } else { 80.0 },
        width: if bounds.width.is_finite() {
            bounds
                .width
                .clamp(REALTIME_VISION_MIN_WIDTH, REALTIME_VISION_MAX_WIDTH)
        } else {
            REALTIME_VISION_WIDTH
        },
        height: if bounds.height.is_finite() {
            bounds
                .height
                .clamp(REALTIME_VISION_MIN_HEIGHT, REALTIME_VISION_MAX_HEIGHT)
        } else {
            REALTIME_VISION_BASE_HEIGHT + REALTIME_VISION_ROW_HEIGHT
        },
    }
}

fn realtime_vision_bounds_from_value(value: Option<&serde_json::Value>) -> Option<OverlayBounds> {
    let bounds = serde_json::from_value::<OverlayBounds>(value?.clone()).ok()?;
    if !bounds.x.is_finite()
        || !bounds.y.is_finite()
        || !bounds.width.is_finite()
        || !bounds.height.is_finite()
    {
        return None;
    }
    Some(normalize_realtime_vision_bounds(bounds))
}

fn realtime_vision_window_bounds(window: &WebviewWindow) -> Result<OverlayBounds, String> {
    let position = window.outer_position().map_err(|error| error.to_string())?;
    let size = window.outer_size().map_err(|error| error.to_string())?;
    let scale_factor = window.scale_factor().unwrap_or(1.0).max(0.1);
    Ok(normalize_realtime_vision_bounds(OverlayBounds {
        x: position.x as f64,
        y: position.y as f64,
        width: size.width as f64 / scale_factor,
        height: size.height as f64 / scale_factor,
    }))
}

fn apply_realtime_vision_bounds(
    window: &WebviewWindow,
    bounds: OverlayBounds,
) -> Result<(), String> {
    let bounds = normalize_realtime_vision_bounds(bounds);
    window
        .set_size(Size::Logical(LogicalSize::new(bounds.width, bounds.height)))
        .map_err(|error| error.to_string())?;
    window
        .set_position(PhysicalPosition::new(
            bounds.x.round() as i32,
            bounds.y.round() as i32,
        ))
        .map_err(|error| error.to_string())
}

fn apply_realtime_vision_state(app: &AppHandle, payload: &serde_json::Value) -> Result<(), String> {
    let window = app
        .get_webview_window("realtime-vision")
        .ok_or_else(|| String::from("real-time vision window not found"))?;
    let visible = payload
        .get("visible")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    if !visible {
        let _ = window.set_ignore_cursor_events(true);
        return window.hide().map_err(|error| error.to_string());
    }

    let anchor = app
        .get_webview_window("main")
        .unwrap_or_else(|| window.clone());
    let monitor = anchor
        .current_monitor()
        .map_err(|error| error.to_string())?
        .or_else(|| anchor.primary_monitor().ok().flatten())
        .ok_or_else(|| String::from("monitor not found"))?;
    let corner = payload
        .get("corner")
        .and_then(|value| value.as_str())
        .unwrap_or("top-right");
    let row_count = payload
        .get("buffs")
        .and_then(|value| value.as_array())
        .map(|buffs| buffs.len().clamp(1, 6))
        .unwrap_or(1);
    let logical_height =
        REALTIME_VISION_BASE_HEIGHT + REALTIME_VISION_ROW_HEIGHT * row_count as f64;
    let scale = monitor.scale_factor().max(0.5);
    let physical_width = (REALTIME_VISION_WIDTH * scale).round() as i32;
    let physical_height = (logical_height * scale).round() as i32;
    let margin = (REALTIME_VISION_MARGIN * scale).round() as i32;
    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let left = monitor_position.x + margin;
    let right = monitor_position.x + monitor_size.width as i32 - physical_width - margin;
    let top = monitor_position.y + margin;
    let bottom = monitor_position.y + monitor_size.height as i32 - physical_height - margin;
    let (x, y) = match corner {
        "top-left" => (left, top),
        "bottom-left" => (left, bottom),
        "bottom-right" => (right, bottom),
        _ => (right, top),
    };

    let bounds =
        realtime_vision_bounds_from_value(payload.get("bounds")).unwrap_or(OverlayBounds {
            x: x as f64,
            y: y as f64,
            width: REALTIME_VISION_WIDTH,
            height: logical_height,
        });
    apply_realtime_vision_bounds(&window, bounds)?;
    let _ = window.set_always_on_top(true);
    let _ = window.set_shadow(false);
    let move_mode = payload
        .get("moveMode")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    let _ = window.set_focusable(move_mode);
    let _ = window.set_ignore_cursor_events(!move_mode);
    window.show().map_err(|error| error.to_string())
}

#[tauri::command]
async fn update_realtime_vision(app: AppHandle, payload: serde_json::Value) -> Result<(), String> {
    let corner = match payload.get("corner").and_then(|value| value.as_str()) {
        Some("top-left") => "top-left",
        Some("bottom-left") => "bottom-left",
        Some("bottom-right") => "bottom-right",
        _ => "top-right",
    };
    let buffs = payload
        .get("buffs")
        .and_then(|value| value.as_array())
        .map(|values| values.iter().take(6).cloned().collect::<Vec<_>>())
        .unwrap_or_default();
    let previous = REALTIME_VISION_STATE.lock().clone();
    let previous_visible = previous
        .get("visible")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    let previous_corner = previous
        .get("corner")
        .and_then(|value| value.as_str())
        .unwrap_or("top-right");
    let previous_rows = previous
        .get("buffs")
        .and_then(|value| value.as_array())
        .map(|values| values.len().clamp(1, 6))
        .unwrap_or(1);
    let move_mode = payload
        .get("moveMode")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    let mut requested_bounds = if previous_corner == corner {
        realtime_vision_bounds_from_value(payload.get("bounds"))
            .or_else(|| realtime_vision_bounds_from_value(previous.get("bounds")))
    } else {
        // Changing the corner is an explicit request to use the new corner;
        // do not let the old manually positioned bounds win over it.
        None
    };
    let normalized = serde_json::json!({
        "visible": payload.get("visible").and_then(|value| value.as_bool()).unwrap_or(false),
        "corner": corner,
        "timer": payload.get("timer").cloned().unwrap_or(serde_json::Value::Null),
        "buffs": buffs,
        "moveMode": move_mode,
        "language": payload.get("language").cloned().unwrap_or_else(|| serde_json::Value::String(String::from("zh-CN")))
    });
    let next_rows = normalized
        .get("buffs")
        .and_then(|value| value.as_array())
        .map(|values| values.len().clamp(1, 6))
        .unwrap_or(1);
    if previous_rows != next_rows {
        if let Some(bounds) = requested_bounds.as_mut() {
            let scale = (bounds.width / REALTIME_VISION_WIDTH).clamp(0.5, 4.0);
            bounds.height = (REALTIME_VISION_BASE_HEIGHT
                + REALTIME_VISION_ROW_HEIGHT * next_rows as f64)
                * scale;
            *bounds = normalize_realtime_vision_bounds(*bounds);
        }
    }
    let mut normalized = normalized;
    if let Some(bounds) = requested_bounds {
        normalized["bounds"] = serde_json::to_value(bounds).map_err(|error| error.to_string())?;
    }
    *REALTIME_VISION_STATE.lock() = normalized.clone();
    let visible = normalized
        .get("visible")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    let needs_window = app.get_webview_window("realtime-vision").is_none();
    if needs_window {
        if !visible {
            return Ok(());
        }
        ensure_realtime_vision_window(&app)?;
    }
    if !visible {
        if let Some(window) = app.get_webview_window("realtime-vision") {
            let _ = window.hide();
            let _ = window.destroy();
        }
        return Ok(());
    }
    if needs_window || !previous_visible || previous_corner != corner || previous_rows != next_rows
    {
        apply_realtime_vision_state(&app, &normalized)?;
    }
    if let Some(window) = app.get_webview_window("realtime-vision") {
        if let Ok(bounds) = realtime_vision_window_bounds(&window) {
            normalized["bounds"] =
                serde_json::to_value(bounds).map_err(|error| error.to_string())?;
        }
    }
    *REALTIME_VISION_STATE.lock() = normalized.clone();
    app.get_webview_window("realtime-vision")
        .ok_or_else(|| String::from("real-time vision window not found"))?
        .emit("realtime-vision:update", normalized)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn get_realtime_vision_state() -> serde_json::Value {
    REALTIME_VISION_STATE.lock().clone()
}

#[tauri::command]
async fn set_realtime_vision_bounds(app: AppHandle, bounds: OverlayBounds) -> Result<(), String> {
    let bounds = normalize_realtime_vision_bounds(bounds);
    if let Some(record) = REALTIME_VISION_STATE.lock().as_object_mut() {
        record.insert(
            String::from("bounds"),
            serde_json::to_value(bounds).map_err(|error| error.to_string())?,
        );
    }
    if let Some(window) = app.get_webview_window("realtime-vision") {
        apply_realtime_vision_bounds(&window, bounds)?;
    }
    Ok(())
}

#[tauri::command]
async fn set_realtime_vision_position(
    app: AppHandle,
    position: OverlayPosition,
) -> Result<(), String> {
    if !position.x.is_finite() || !position.y.is_finite() {
        return Err(String::from("invalid real-time vision position"));
    }
    if let Some(record) = REALTIME_VISION_STATE.lock().as_object_mut() {
        let current =
            realtime_vision_bounds_from_value(record.get("bounds")).unwrap_or(OverlayBounds {
                x: position.x,
                y: position.y,
                width: REALTIME_VISION_WIDTH,
                height: REALTIME_VISION_BASE_HEIGHT + REALTIME_VISION_ROW_HEIGHT,
            });
        record.insert(
            String::from("bounds"),
            serde_json::to_value(OverlayBounds {
                x: position.x,
                y: position.y,
                ..current
            })
            .map_err(|error| error.to_string())?,
        );
    }
    let Some(window) = app.get_webview_window("realtime-vision") else {
        return Ok(());
    };
    window
        .set_position(PhysicalPosition::new(
            position.x.round() as i32,
            position.y.round() as i32,
        ))
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn get_realtime_vision_bounds(app: AppHandle) -> Result<OverlayBounds, String> {
    if let Some(window) = app.get_webview_window("realtime-vision") {
        let bounds = realtime_vision_window_bounds(&window)?;
        if let Some(record) = REALTIME_VISION_STATE.lock().as_object_mut() {
            record.insert(
                String::from("bounds"),
                serde_json::to_value(bounds).map_err(|error| error.to_string())?,
            );
        }
        return Ok(bounds);
    }
    realtime_vision_bounds_from_value(REALTIME_VISION_STATE.lock().get("bounds"))
        .ok_or_else(|| String::from("real-time vision bounds not initialized"))
}

#[tauri::command]
async fn set_realtime_vision_click_through(app: AppHandle, enabled: bool) -> Result<(), String> {
    if let Some(record) = REALTIME_VISION_STATE.lock().as_object_mut() {
        record.insert(String::from("moveMode"), serde_json::Value::Bool(!enabled));
    }
    let Some(window) = app.get_webview_window("realtime-vision") else {
        return Ok(());
    };
    let _ = window.set_focusable(!enabled);
    window
        .set_ignore_cursor_events(enabled)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn update_overlay(app: AppHandle, payload: serde_json::Value) -> Result<(), String> {
    let visible = payload
        .get("visible")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    let move_mode = payload
        .get("moveMode")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    let requested_note_move_mode = payload
        .get("noteMoveMode")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    let show_notes_separately = payload
        .get("showNotesSeparately")
        .and_then(|value| value.as_bool())
        .unwrap_or(true);
    let was_note_move_mode = OVERLAY_NOTES_STATE
        .lock()
        .get("noteMoveMode")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    let note_move_mode = show_notes_separately && requested_note_move_mode;
    let mut notes_payload = payload.clone();
    if let Some(record) = notes_payload.as_object_mut() {
        record.insert(
            String::from("noteMoveMode"),
            serde_json::Value::Bool(note_move_mode),
        );
        record.insert(
            String::from("showNotesSeparately"),
            serde_json::Value::Bool(show_notes_separately),
        );
    }
    *OVERLAY_STATE.lock() = payload.clone();
    // The notes window may be created lazily. Keep the latest payload so its
    // React entry can recover the state even when the first emit happens
    // before the webview listener is attached.
    *OVERLAY_NOTES_STATE.lock() = notes_payload.clone();
    let window = match app.get_webview_window("overlay") {
        Some(window) => window,
        None if !visible && !move_mode => {
            if let Some(note_window) = app.get_webview_window("overlay-notes") {
                let _ = note_window.set_ignore_cursor_events(true);
                let _ = note_window.hide();
                let _ = note_window.destroy();
            }
            if let Some(editor_window) = app.get_webview_window("overlay-notes-editor") {
                let _ = editor_window.set_ignore_cursor_events(true);
                let _ = editor_window.hide();
                let _ = editor_window.destroy();
            }
            return Ok(());
        }
        None => ensure_overlay_window(&app)?,
    };
    // Native move/resize dragging owns the window bounds while move mode is active.
    // Applying the last React payload here would race the OS drag loop and make the
    // crop frame visibly jump between the pointer position and the stale settings.
    if !move_mode {
        if let Some(settings) = payload.get("settings") {
            if let Ok(bounds) = serde_json::from_value::<OverlayBounds>(settings.clone()) {
                *OVERLAY_BOUNDS_STATE.lock() = bounds;
                let _ = window.set_position(PhysicalPosition::new(
                    bounds.x.round() as i32,
                    bounds.y.round() as i32,
                ));
                let _ = window.set_size(PhysicalSize::new(
                    bounds.width.max(1.0).round() as u32,
                    bounds.height.max(1.0).round() as u32,
                ));
            }
        }
    }
    let _ = window.set_ignore_cursor_events(!move_mode);
    if visible || move_mode {
        let _ = window.set_always_on_top(true);
        let _ = window.set_shadow(false);
        let _ = window.show();
    } else {
        let _ = window.hide();
        let _ = window.destroy();
        return Ok(());
    }
    window
        .emit("overlay:update", payload.clone())
        .map_err(|error| error.to_string())?;

    let has_visible_notes = payload
        .get("visibleNoteStepIds")
        .and_then(|value| value.as_array())
        .is_some_and(|items| !items.is_empty());
    let note_visible = show_notes_separately && (note_move_mode || (visible && has_visible_notes));
    if note_move_mode {
        if let Some(window) = app.get_webview_window("overlay-notes") {
            let _ = window.set_ignore_cursor_events(true);
            let _ = window.hide();
        }
        let editor_window = ensure_overlay_notes_editor_window(&app)?;
        if !was_note_move_mode {
            if let Some(bounds) = payload.get("noteBounds") {
                if let Ok(bounds) = serde_json::from_value::<OverlayBounds>(bounds.clone()) {
                    *OVERLAY_NOTES_BOUNDS_STATE.lock() = bounds;
                    let _ = editor_window.set_position(PhysicalPosition::new(
                        bounds.x.round() as i32,
                        bounds.y.round() as i32,
                    ));
                    let _ = editor_window.set_size(PhysicalSize::new(
                        bounds.width.max(1.0).round() as u32,
                        bounds.height.max(1.0).round() as u32,
                    ));
                }
            }
        }
        let _ = editor_window.set_always_on_top(true);
        let _ = editor_window.set_shadow(false);
        let _ = editor_window.show();
        let _ = editor_window.set_ignore_cursor_events(false);
        let _ = editor_window.set_focusable(true);
        let _ = editor_window.set_focus();
        return editor_window
            .emit("overlay-notes:update", notes_payload)
            .map_err(|error| error.to_string());
    }

    if let Some(editor_window) = app.get_webview_window("overlay-notes-editor") {
        let _ = editor_window.set_ignore_cursor_events(true);
        let _ = editor_window.hide();
    }
    let note_window = match app.get_webview_window("overlay-notes") {
        Some(window) => window,
        None if !note_visible => return Ok(()),
        None => ensure_overlay_notes_window(&app)?,
    };
    if let Some(bounds) = payload.get("noteBounds") {
        if let Ok(bounds) = serde_json::from_value::<OverlayBounds>(bounds.clone()) {
            *OVERLAY_NOTES_BOUNDS_STATE.lock() = bounds;
            let _ = note_window.set_position(PhysicalPosition::new(
                bounds.x.round() as i32,
                bounds.y.round() as i32,
            ));
            let _ = note_window.set_size(PhysicalSize::new(
                bounds.width.max(1.0).round() as u32,
                bounds.height.max(1.0).round() as u32,
            ));
        }
    }
    if note_visible {
        let _ = note_window.set_always_on_top(true);
        let _ = note_window.set_shadow(false);
        let _ = note_window.show();
        let _ = note_window.set_ignore_cursor_events(true);
        let _ = note_window.set_focusable(false);
    } else {
        let _ = note_window.set_ignore_cursor_events(true);
        let _ = note_window.hide();
        let _ = note_window.destroy();
        return Ok(());
    }
    note_window
        .emit("overlay-notes:update", notes_payload)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn update_overlay_visible_notes(app: AppHandle, step_ids: Vec<String>) -> Result<(), String> {
    let mut notes_payload = OVERLAY_NOTES_STATE.lock().clone();
    if let Some(record) = notes_payload.as_object_mut() {
        record.insert(
            String::from("visibleNoteStepIds"),
            serde_json::to_value(&step_ids).map_err(|error| error.to_string())?,
        );
    }
    *OVERLAY_NOTES_STATE.lock() = notes_payload.clone();

    let visible = notes_payload
        .get("visible")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    let move_mode = notes_payload
        .get("noteMoveMode")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    let show_notes_separately = notes_payload
        .get("showNotesSeparately")
        .and_then(|value| value.as_bool())
        .unwrap_or(true);
    let note_visible = show_notes_separately && (move_mode || (visible && !step_ids.is_empty()));

    if !note_visible {
        if let Some(window) = active_overlay_notes_window(&app) {
            let _ = window.set_ignore_cursor_events(true);
            let _ = window.hide();
            let _ = window.destroy();
        }
        return Ok(());
    }

    let window = if move_mode {
        ensure_overlay_notes_editor_window(&app)?
    } else {
        ensure_overlay_notes_window(&app)?
    };
    if let Some(bounds) = notes_payload.get("noteBounds") {
        if let Ok(bounds) = serde_json::from_value::<OverlayBounds>(bounds.clone()) {
            *OVERLAY_NOTES_BOUNDS_STATE.lock() = bounds;
            let _ = window.set_position(PhysicalPosition::new(
                bounds.x.round() as i32,
                bounds.y.round() as i32,
            ));
            let _ = window.set_size(PhysicalSize::new(
                bounds.width.max(1.0).round() as u32,
                bounds.height.max(1.0).round() as u32,
            ));
        }
    }
    let _ = window.set_always_on_top(true);
    let _ = window.set_shadow(false);
    let _ = window.show();
    let _ = window.set_ignore_cursor_events(!move_mode);
    let _ = window.set_focusable(move_mode);
    window
        .emit("overlay-notes:update", notes_payload)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn update_overlay_practice(app: AppHandle, practice: serde_json::Value) -> Result<(), String> {
    if let Some(record) = OVERLAY_STATE.lock().as_object_mut() {
        record.insert(String::from("practice"), practice.clone());
    }
    if let Some(record) = OVERLAY_NOTES_STATE.lock().as_object_mut() {
        record.insert(String::from("practice"), practice.clone());
    }
    if let Some(window) = app.get_webview_window("overlay") {
        let _ = window.emit("overlay:practice-update", practice.clone());
    }
    if let Some(window) = app.get_webview_window("overlay-notes") {
        let _ = window.emit("overlay-notes:practice-update", practice.clone());
    }
    if let Some(window) = app.get_webview_window("overlay-notes-editor") {
        let _ = window.emit("overlay-notes:practice-update", practice);
    }
    Ok(())
}

#[tauri::command]
async fn set_rhythm_feedback_visible(app: AppHandle, visible: bool) -> Result<(), String> {
    if let Some(record) = RHYTHM_FEEDBACK_STATE.lock().as_object_mut() {
        record.insert(String::from("visible"), serde_json::Value::Bool(visible));
    }
    let window = match app.get_webview_window("rhythm-feedback") {
        Some(window) => window,
        None if !visible => return Ok(()),
        None => ensure_rhythm_feedback_window(&app)?,
    };
    if visible {
        let _ = window.set_always_on_top(true);
        let _ = window.set_shadow(false);
        let _ = window.set_ignore_cursor_events(true);
        window.show().map_err(|error| error.to_string())?;
    } else {
        let _ = window.set_ignore_cursor_events(true);
        let _ = window.hide();
        window.destroy().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn update_rhythm_feedback(app: AppHandle, payload: serde_json::Value) -> Result<(), String> {
    *RHYTHM_FEEDBACK_STATE.lock() = payload.clone();
    let move_mode = payload
        .get("moveMode")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    let visible = payload
        .get("visible")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    let window = match app.get_webview_window("rhythm-feedback") {
        Some(window) => window,
        None if !visible && !move_mode => return Ok(()),
        None => ensure_rhythm_feedback_window(&app)?,
    };
    if !move_mode {
        if let Some(bounds) = payload.get("bounds") {
            if let Ok(bounds) = serde_json::from_value::<FeedbackBounds>(bounds.clone()) {
                let _ = apply_rhythm_feedback_bounds(&window, bounds);
            }
        }
    }
    if visible || move_mode {
        let _ = window.set_always_on_top(true);
        let _ = window.set_shadow(false);
        let _ = window.set_ignore_cursor_events(!move_mode);
        let _ = window.show();
    } else {
        let _ = window.set_ignore_cursor_events(true);
        let _ = window.hide();
        let _ = window.destroy();
        return Ok(());
    }
    window
        .emit("rhythm-feedback:update", payload)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn get_rhythm_feedback_state() -> serde_json::Value {
    RHYTHM_FEEDBACK_STATE.lock().clone()
}

fn apply_rhythm_feedback_bounds(
    window: &WebviewWindow,
    bounds: FeedbackBounds,
) -> Result<(), String> {
    let width = bounds
        .width
        .max(FEEDBACK_MIN_WIDTH as f64)
        .min(FEEDBACK_MAX_WIDTH as f64)
        .round() as u32;
    let height = bounds
        .height
        .max(FEEDBACK_MIN_HEIGHT as f64)
        .min(FEEDBACK_MAX_HEIGHT as f64)
        .round() as u32;
    window
        .set_position(PhysicalPosition::new(
            bounds.x.round() as i32,
            bounds.y.round() as i32,
        ))
        .map_err(|error| error.to_string())?;
    window
        .set_size(PhysicalSize::new(width, height))
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn set_rhythm_feedback_bounds(app: AppHandle, bounds: FeedbackBounds) -> Result<(), String> {
    if let Some(record) = RHYTHM_FEEDBACK_STATE.lock().as_object_mut() {
        record.insert(
            String::from("bounds"),
            serde_json::to_value(bounds).map_err(|error| error.to_string())?,
        );
    }
    let Some(window) = app.get_webview_window("rhythm-feedback") else {
        return Ok(());
    };
    apply_rhythm_feedback_bounds(&window, bounds)
}

#[tauri::command]
async fn get_rhythm_feedback_bounds(app: AppHandle) -> Result<FeedbackBounds, String> {
    let Some(window) = app.get_webview_window("rhythm-feedback") else {
        let state = RHYTHM_FEEDBACK_STATE.lock();
        return state
            .get("bounds")
            .cloned()
            .and_then(|value| serde_json::from_value(value).ok())
            .ok_or_else(|| String::from("rhythm feedback bounds not initialized"));
    };
    let position = window.outer_position().map_err(|error| error.to_string())?;
    let size = window.outer_size().map_err(|error| error.to_string())?;
    Ok(FeedbackBounds {
        x: position.x as f64,
        y: position.y as f64,
        width: size.width as f64,
        height: size.height as f64,
    })
}

#[tauri::command]
async fn set_rhythm_feedback_position(
    app: AppHandle,
    position: OverlayPosition,
) -> Result<(), String> {
    let Some(window) = app.get_webview_window("rhythm-feedback") else {
        return Ok(());
    };
    window
        .set_position(PhysicalPosition::new(
            position.x.round() as i32,
            position.y.round() as i32,
        ))
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn start_rhythm_feedback_drag(app: AppHandle) -> Result<(), String> {
    let window = ensure_rhythm_feedback_window(&app)?;
    window.start_dragging().map_err(|error| error.to_string())
}

#[tauri::command]
fn notify_rhythm_feedback_bounds_changed(
    app: AppHandle,
    bounds: FeedbackBounds,
) -> Result<(), String> {
    app.emit(
        "rhythm-feedback:bounds-changed",
        serde_json::json!({
            "x": bounds.x.round(),
            "y": bounds.y.round(),
            "width": bounds.width.round(),
            "height": bounds.height.round()
        }),
    )
    .map_err(|error| error.to_string())
}

fn apply_key_mapping_bounds(window: &WebviewWindow, bounds: OverlayBounds) -> Result<(), String> {
    let width = bounds
        .width
        .max(KEY_MAPPING_MIN_WIDTH as f64)
        .min(KEY_MAPPING_MAX_WIDTH as f64)
        .round();
    let height = bounds
        .height
        .max(KEY_MAPPING_MIN_HEIGHT as f64)
        .min(KEY_MAPPING_MAX_HEIGHT as f64)
        .round();
    window
        .set_position(PhysicalPosition::new(
            bounds.x.round() as i32,
            bounds.y.round() as i32,
        ))
        .map_err(|error| error.to_string())?;
    window
        .set_size(Size::Logical(LogicalSize::new(width, height)))
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn set_key_mapping_visible(app: AppHandle, visible: bool) -> Result<(), String> {
    if let Some(record) = KEY_MAPPING_STATE.lock().as_object_mut() {
        record.insert(String::from("visible"), serde_json::Value::Bool(visible));
    }
    let window = match app.get_webview_window("key-mapping") {
        Some(window) => window,
        None if !visible => return Ok(()),
        None => ensure_key_mapping_window(&app)?,
    };
    if visible {
        let _ = window.set_always_on_top(true);
        let _ = window.set_shadow(false);
        let _ = window.set_ignore_cursor_events(true);
        window.show().map_err(|error| error.to_string())?;
    } else {
        let _ = window.set_ignore_cursor_events(true);
        let _ = window.hide();
        window.destroy().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn update_key_mapping(app: AppHandle, payload: serde_json::Value) -> Result<(), String> {
    {
        let mut state = KEY_MAPPING_STATE.lock();
        if payload.get("pressedCodes").is_some() && payload.get("layers").is_none() {
            if let Some(record) = state.as_object_mut() {
                record.insert(
                    String::from("pressedCodes"),
                    payload
                        .get("pressedCodes")
                        .cloned()
                        .unwrap_or_else(|| serde_json::json!([])),
                );
            }
        } else {
            *state = payload.clone();
        }
    }
    let move_mode = payload
        .get("moveMode")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    let visible = payload
        .get("visible")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    let window = match app.get_webview_window("key-mapping") {
        Some(window) => window,
        None if !visible && !move_mode => return Ok(()),
        None => ensure_key_mapping_window(&app)?,
    };
    if let Some(bounds) = payload.get("bounds") {
        if let Ok(bounds) = serde_json::from_value::<OverlayBounds>(bounds.clone()) {
            if !payload
                .get("moveMode")
                .and_then(|value| value.as_bool())
                .unwrap_or(false)
            {
                let _ = apply_key_mapping_bounds(&window, bounds);
            }
        }
    }
    if visible || move_mode {
        let _ = window.set_always_on_top(true);
        let _ = window.set_shadow(false);
        let _ = window.set_ignore_cursor_events(!move_mode);
        let _ = window.show();
    } else if payload.get("visible").is_some() || payload.get("moveMode").is_some() {
        let _ = window.set_ignore_cursor_events(true);
        let _ = window.hide();
        let _ = window.destroy();
        return Ok(());
    }
    window
        .emit("key-mapping:update", payload)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn get_key_mapping_state() -> serde_json::Value {
    KEY_MAPPING_STATE.lock().clone()
}

#[tauri::command]
async fn set_key_mapping_bounds(app: AppHandle, bounds: OverlayBounds) -> Result<(), String> {
    if let Some(record) = KEY_MAPPING_STATE.lock().as_object_mut() {
        record.insert(
            String::from("bounds"),
            serde_json::to_value(bounds).map_err(|error| error.to_string())?,
        );
    }
    let Some(window) = app.get_webview_window("key-mapping") else {
        return Ok(());
    };
    apply_key_mapping_bounds(&window, bounds)
}

#[tauri::command]
async fn get_key_mapping_bounds(app: AppHandle) -> Result<OverlayBounds, String> {
    let Some(window) = app.get_webview_window("key-mapping") else {
        let state = KEY_MAPPING_STATE.lock();
        return state
            .get("bounds")
            .cloned()
            .and_then(|value| serde_json::from_value(value).ok())
            .ok_or_else(|| String::from("key mapping bounds not initialized"));
    };
    let position = window.outer_position().map_err(|error| error.to_string())?;
    let size = window.outer_size().map_err(|error| error.to_string())?;
    let scale_factor = window.scale_factor().unwrap_or(1.0).max(0.1);
    Ok(OverlayBounds {
        x: position.x as f64,
        y: position.y as f64,
        width: size.width as f64 / scale_factor,
        height: size.height as f64 / scale_factor,
    })
}

#[tauri::command]
async fn set_key_mapping_position(app: AppHandle, position: OverlayPosition) -> Result<(), String> {
    let Some(window) = app.get_webview_window("key-mapping") else {
        return Ok(());
    };
    window
        .set_position(PhysicalPosition::new(
            position.x.round() as i32,
            position.y.round() as i32,
        ))
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn start_key_mapping_drag(app: AppHandle) -> Result<(), String> {
    let window = ensure_key_mapping_window(&app)?;
    window.start_dragging().map_err(|error| error.to_string())
}

#[tauri::command]
fn notify_key_mapping_bounds_changed(app: AppHandle, bounds: OverlayBounds) -> Result<(), String> {
    app.emit(
        "key-mapping:bounds-changed",
        serde_json::json!({
            "x": bounds.x.round(),
            "y": bounds.y.round(),
            "width": bounds.width.round(),
            "height": bounds.height.round()
        }),
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
fn notify_overlay_bounds_changed(app: AppHandle, bounds: OverlayBounds) -> Result<(), String> {
    *OVERLAY_BOUNDS_STATE.lock() = bounds;
    app.emit(
        "overlay:bounds-changed",
        serde_json::json!({
            "x": bounds.x.round(),
            "y": bounds.y.round(),
            "width": bounds.width.round(),
            "height": bounds.height.round()
        }),
    )
    .map_err(|error| error.to_string())
}

fn emit_overlay_window_bounds(app: &AppHandle, window: &WebviewWindow) {
    let Ok(position) = window.outer_position() else {
        return;
    };
    let Ok(size) = window.outer_size() else {
        return;
    };
    let bounds = OverlayBounds {
        x: position.x as f64,
        y: position.y as f64,
        width: size.width as f64,
        height: size.height as f64,
    };
    *OVERLAY_BOUNDS_STATE.lock() = bounds;
    let _ = app.emit(
        "overlay:bounds-changed",
        serde_json::json!({
            "x": bounds.x,
            "y": bounds.y,
            "width": bounds.width,
            "height": bounds.height
        }),
    );
}

fn emit_overlay_notes_window_bounds(app: &AppHandle, window: &WebviewWindow) {
    let Ok(position) = window.outer_position() else {
        return;
    };
    let Ok(size) = window.outer_size() else {
        return;
    };
    let bounds = OverlayBounds {
        x: position.x as f64,
        y: position.y as f64,
        width: size.width as f64,
        height: size.height as f64,
    };
    *OVERLAY_NOTES_BOUNDS_STATE.lock() = bounds;
    let _ = app.emit(
        "overlay:note-bounds-changed",
        serde_json::json!({
            "x": bounds.x.round(),
            "y": bounds.y.round(),
            "width": bounds.width.round(),
            "height": bounds.height.round()
        }),
    );
}

#[tauri::command]
async fn set_overlay_notes_visible(app: AppHandle, visible: bool) -> Result<(), String> {
    let should_show = {
        let mut state = OVERLAY_NOTES_STATE.lock();
        if let Some(record) = state.as_object_mut() {
            record.insert(String::from("visible"), serde_json::Value::Bool(visible));
        }
        let move_mode = state
            .get("noteMoveMode")
            .and_then(|value| value.as_bool())
            .unwrap_or(false);
        let has_visible_notes = state
            .get("visibleNoteStepIds")
            .and_then(|value| value.as_array())
            .is_some_and(|items| !items.is_empty());
        visible && (move_mode || has_visible_notes)
    };
    if should_show {
        let window = match app.get_webview_window("overlay-notes") {
            Some(window) => window,
            None => ensure_overlay_notes_window(&app)?,
        };
        let _ = window.set_always_on_top(true);
        let _ = window.set_shadow(false);
        let _ = window.set_ignore_cursor_events(true);
        window.show().map_err(|error| error.to_string())?;
    } else {
        if let Some(window) = app.get_webview_window("overlay-notes") {
            let _ = window.set_ignore_cursor_events(true);
            let _ = window.hide();
        }
        if let Some(window) = app.get_webview_window("overlay-notes-editor") {
            let _ = window.set_ignore_cursor_events(true);
            let _ = window.hide();
        }
    }
    Ok(())
}

#[tauri::command]
async fn set_overlay_notes_click_through(app: AppHandle, enabled: bool) -> Result<(), String> {
    let state = {
        let mut state = OVERLAY_NOTES_STATE.lock();
        let show_notes_separately = state
            .get("showNotesSeparately")
            .and_then(|value| value.as_bool())
            .unwrap_or(true);
        if let Some(record) = state.as_object_mut() {
            record.insert(
                String::from("noteMoveMode"),
                serde_json::Value::Bool(!enabled && show_notes_separately),
            );
        }
        state.clone()
    };
    let window = if enabled {
        app.get_webview_window("overlay-notes")
            .or_else(|| app.get_webview_window("overlay-notes-editor"))
    } else {
        app.get_webview_window("overlay-notes-editor")
            .or_else(|| app.get_webview_window("overlay-notes"))
    };
    let window = match window {
        Some(window) => window,
        None if enabled => return Ok(()),
        None => ensure_overlay_notes_window(&app)?,
    };
    window
        .set_ignore_cursor_events(enabled)
        .map_err(|error| error.to_string())?;
    window
        .set_focusable(!enabled)
        .map_err(|error| error.to_string())?;
    let _ = window.emit("overlay-notes:update", state);
    Ok(())
}

#[tauri::command]
async fn set_overlay_notes_bounds(app: AppHandle, bounds: OverlayBounds) -> Result<(), String> {
    *OVERLAY_NOTES_BOUNDS_STATE.lock() = bounds;
    let Some(window) = active_overlay_notes_window(&app) else {
        return Ok(());
    };
    window
        .set_position(PhysicalPosition::new(
            bounds.x.round() as i32,
            bounds.y.round() as i32,
        ))
        .map_err(|error| error.to_string())?;
    window
        .set_size(PhysicalSize::new(
            bounds.width.max(1.0).round() as u32,
            bounds.height.max(1.0).round() as u32,
        ))
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn get_overlay_notes_bounds(app: AppHandle) -> Result<OverlayBounds, String> {
    let Some(window) = active_overlay_notes_window(&app) else {
        return Ok(*OVERLAY_NOTES_BOUNDS_STATE.lock());
    };
    let position = window.outer_position().map_err(|error| error.to_string())?;
    let size = window.outer_size().map_err(|error| error.to_string())?;
    let bounds = OverlayBounds {
        x: position.x as f64,
        y: position.y as f64,
        width: size.width as f64,
        height: size.height as f64,
    };
    *OVERLAY_NOTES_BOUNDS_STATE.lock() = bounds;
    Ok(bounds)
}

#[tauri::command]
fn get_overlay_notes_state() -> serde_json::Value {
    OVERLAY_NOTES_STATE.lock().clone()
}

fn configure_overlay_notes_window(app: &AppHandle, window: &WebviewWindow) {
    let _ = window.set_always_on_top(true);
    let _ = window.set_shadow(false);
    let _ = window.set_ignore_cursor_events(true);
    let app_handle = app.clone();
    let window_for_event = window.clone();
    window.on_window_event(move |event| match event {
        WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
            emit_overlay_notes_window_bounds(&app_handle, &window_for_event);
        }
        _ => {}
    });
}

fn ensure_overlay_notes_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    let _creation_guard = AUXILIARY_WINDOW_CREATION_LOCK.lock();
    if let Some(window) = app.get_webview_window("overlay-notes") {
        return Ok(window);
    }
    let bounds = *OVERLAY_NOTES_BOUNDS_STATE.lock();
    let window = WebviewWindowBuilder::new(
        app,
        "overlay-notes",
        WebviewUrl::App("overlay-notes.html".into()),
    )
    .title("Combo Notes")
    .inner_size(bounds.width.max(1.0), bounds.height.max(1.0))
    .position(bounds.x, bounds.y)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(true)
    .shadow(false)
    .visible(false)
    .build()
    .map_err(|error| error.to_string())?;
    configure_overlay_notes_window(app, &window);
    Ok(window)
}

fn ensure_overlay_notes_editor_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    let _creation_guard = AUXILIARY_WINDOW_CREATION_LOCK.lock();
    if let Some(window) = app.get_webview_window("overlay-notes-editor") {
        return Ok(window);
    }
    let bounds = *OVERLAY_NOTES_BOUNDS_STATE.lock();
    let window = WebviewWindowBuilder::new(
        app,
        "overlay-notes-editor",
        WebviewUrl::App("overlay-notes.html".into()),
    )
    .title("Combo Notes Editor")
    .inner_size(bounds.width.max(1.0), bounds.height.max(1.0))
    .position(bounds.x, bounds.y)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(true)
    .shadow(false)
    .visible(false)
    .build()
    .map_err(|error| error.to_string())?;
    configure_overlay_notes_window(app, &window);
    Ok(window)
}

fn active_overlay_notes_window(app: &AppHandle) -> Option<WebviewWindow> {
    let move_mode = OVERLAY_NOTES_STATE
        .lock()
        .get("noteMoveMode")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    if move_mode {
        app.get_webview_window("overlay-notes-editor")
            .or_else(|| app.get_webview_window("overlay-notes"))
    } else {
        app.get_webview_window("overlay-notes")
            .or_else(|| app.get_webview_window("overlay-notes-editor"))
    }
}

#[tauri::command]
fn notify_overlay_note_bounds_changed(app: AppHandle, bounds: OverlayBounds) -> Result<(), String> {
    app.emit(
        "overlay:note-bounds-changed",
        serde_json::json!({
            "x": bounds.x.round(),
            "y": bounds.y.round(),
            "width": bounds.width.round(),
            "height": bounds.height.round()
        }),
    )
    .map_err(|error| error.to_string())
}

fn emit_rhythm_feedback_window_bounds(app: &AppHandle, window: &WebviewWindow) {
    let Ok(position) = window.outer_position() else {
        return;
    };
    let Ok(size) = window.outer_size() else {
        return;
    };
    let _ = app.emit(
        "rhythm-feedback:bounds-changed",
        serde_json::json!({
            "x": position.x,
            "y": position.y,
            "width": size.width,
            "height": size.height
        }),
    );
}

fn emit_key_mapping_window_bounds(app: &AppHandle, window: &WebviewWindow) {
    let Ok(position) = window.outer_position() else {
        return;
    };
    let Ok(size) = window.outer_size() else {
        return;
    };
    let scale_factor = window.scale_factor().unwrap_or(1.0).max(0.1);
    let _ = app.emit(
        "key-mapping:bounds-changed",
        serde_json::json!({
            "x": position.x,
            "y": position.y,
            "width": size.width as f64 / scale_factor,
            "height": size.height as f64 / scale_factor
        }),
    );
}

#[tauri::command]
fn request_overlay_move_mode(app: AppHandle, enabled: bool) -> Result<(), String> {
    app.emit(
        "overlay:move-mode",
        serde_json::json!({ "enabled": enabled }),
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
#[cfg(not(feature = "release-core"))]
async fn start_simulated_input(
    mut events: Vec<SimulatedInputEvent>,
) -> Result<SimulatedInputLaunch, String> {
    if events.is_empty() {
        return Err(String::from("没有可模拟的输入"));
    }
    if events.len() > 100_000 {
        return Err(String::from("模拟输入事件数量过多"));
    }
    if events.iter().any(|event| {
        !matches!(
            event.event_type.as_str(),
            "keydown" | "keyup" | "mousedown" | "mouseup"
        ) || event.code.trim().is_empty()
    }) {
        return Err(String::from("模拟输入只支持键盘和鼠标事件"));
    }

    events.sort_by_key(|event| event.at_ms);
    let run_id = SIMULATION_RUN_ID.fetch_add(1, Ordering::SeqCst) + 1;

    #[cfg(windows)]
    {
        for event in &events {
            input_simulator::validate_event(&event.event_type, &event.code)?;
        }

        return tauri::async_runtime::spawn_blocking(move || {
            use std::time::{Duration, Instant};

            // The start key is captured while the game is foreground, so the
            // current foreground window is the injection target.
            let target_window = input_simulator::foreground_window();
            if target_window == 0 {
                return Err(String::from("无法获取游戏窗口"));
            }
            let starts_at = Instant::now() + Duration::from_millis(SIMULATION_LEAD_MS);
            std::thread::Builder::new()
                .name(String::from("wwcombo-input-simulation"))
                .spawn(move || {
                    let mut pressed_codes: HashMap<String, (u32, i32, i32)> = HashMap::new();
                    for event in events {
                        if SIMULATION_RUN_ID.load(Ordering::SeqCst) != run_id
                            || input_simulator::foreground_window() != target_window
                        {
                            break;
                        }
                        let target = starts_at + Duration::from_millis(event.at_ms);
                        while target > Instant::now() {
                            if SIMULATION_RUN_ID.load(Ordering::SeqCst) != run_id {
                                break;
                            }
                            let remaining = target.saturating_duration_since(Instant::now());
                            if remaining > Duration::from_millis(3) {
                                std::thread::sleep(remaining - Duration::from_millis(2));
                            } else {
                                std::thread::yield_now();
                            }
                        }
                        if SIMULATION_RUN_ID.load(Ordering::SeqCst) != run_id {
                            break;
                        }

                        let code = event
                            .code
                            .strip_suffix("Hold")
                            .unwrap_or(&event.code)
                            .to_owned();
                        let is_press = matches!(event.event_type.as_str(), "keydown" | "mousedown");
                        if is_press {
                            if let Some(state) = pressed_codes.get_mut(&code) {
                                // A malformed or very dense chart can overlap
                                // two presses of the same physical key. Keep
                                // it down until the matching final release.
                                state.0 = state.0.saturating_add(1);
                                continue;
                            }
                            if input_simulator::inject(
                                &event.event_type,
                                &code,
                                event.cursor_dx,
                                event.cursor_dy,
                            )
                            .is_ok()
                            {
                                pressed_codes
                                    .insert(code, (1_u32, event.cursor_dx, event.cursor_dy));
                            }
                            continue;
                        }

                        let Some(state) = pressed_codes.get_mut(&code) else {
                            let _ = input_simulator::inject(
                                &event.event_type,
                                &code,
                                event.cursor_dx,
                                event.cursor_dy,
                            );
                            continue;
                        };
                        if state.0 > 1 {
                            state.0 -= 1;
                            continue;
                        }
                        let (_, cursor_dx, cursor_dy) = pressed_codes.remove(&code).unwrap();
                        if input_simulator::inject(&event.event_type, &code, cursor_dx, cursor_dy)
                            .is_err()
                        {
                            pressed_codes.insert(code, (1, cursor_dx, cursor_dy));
                        }
                    }

                    // Cancellation or a foreground-window change can
                    // interrupt a held input. Release only this run's inputs.
                    for (code, (_, cursor_dx, cursor_dy)) in pressed_codes {
                        let event_type = if code.starts_with("Mouse") {
                            "mouseup"
                        } else {
                            "keyup"
                        };
                        let _ = input_simulator::inject(event_type, &code, cursor_dx, cursor_dy);
                    }
                })
                .map_err(|error| error.to_string())?;

            Ok(SimulatedInputLaunch {
                starts_in_ms: SIMULATION_LEAD_MS,
            })
        })
        .await
        .map_err(|error| error.to_string())?;
    }

    #[cfg(not(windows))]
    {
        let _ = events;
        Err(String::from("模拟输入仅支持 Windows"))
    }
}

#[tauri::command]
#[cfg(not(feature = "release-core"))]
fn stop_simulated_input() {
    SIMULATION_RUN_ID.fetch_add(1, Ordering::SeqCst);
}

#[cfg(feature = "release-core")]
#[tauri::command]
async fn start_simulated_input(
    mut events: Vec<SimulatedInputEvent>,
    app: AppHandle,
) -> Result<SimulatedInputLaunch, String> {
    if events.is_empty() {
        return Err(String::from("没有可模拟的输入"));
    }
    if events.len() > 100_000 {
        return Err(String::from("模拟输入事件数量过多"));
    }
    if events.iter().any(|event| {
        !matches!(
            event.event_type.as_str(),
            "keydown" | "keyup" | "mousedown" | "mouseup"
        ) || event.code.trim().is_empty()
    }) {
        return Err(String::from("模拟输入只支持键盘和鼠标事件"));
    }

    let executable = find_simulated_input_dlc(&app)
        .ok_or_else(|| String::from("未安装模拟演示 DLC。请将 DLC 解压到 wwcombo.exe 同级的 wwcombo dlc/simulated-input 目录。"))?;
    events.sort_by_key(|event| event.at_ms);
    stop_simulated_input_process();

    let payload = serde_json::to_vec(&events).map_err(|error| error.to_string())?;
    let mut command = Command::new(executable);
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command
        .spawn()
        .map_err(|error| format!("无法启动模拟演示 DLC：{error}"))?;
    let write_result = child
        .stdin
        .take()
        .ok_or_else(|| String::from("模拟演示 DLC 未打开输入通道"))
        .and_then(|mut stdin| {
            stdin
                .write_all(&payload)
                .and_then(|_| stdin.flush())
                .map_err(|error| format!("无法发送模拟输入事件：{error}"))
        });
    if let Err(error) = write_result {
        let _ = child.kill();
        let _ = child.wait();
        return Err(error);
    }
    *SIMULATED_INPUT_PROCESS.lock() = Some(child);
    Ok(SimulatedInputLaunch { starts_in_ms: 0 })
}

#[cfg(feature = "release-core")]
#[tauri::command]
fn stop_simulated_input() {
    stop_simulated_input_process();
}

#[cfg(feature = "release-core")]
fn stop_simulated_input_process() {
    let Some(mut child) = SIMULATED_INPUT_PROCESS.lock().take() else {
        return;
    };
    let _ = child.kill();
    let _ = child.wait();
}

#[cfg(all(windows, not(feature = "release-core")))]
mod input_simulator {
    const INPUT_KEYBOARD: u32 = 1;
    const INPUT_MOUSE: u32 = 0;
    const KEYEVENTF_KEYUP: u32 = 0x0002;
    const KEYEVENTF_SCANCODE: u32 = 0x0008;
    const KEYEVENTF_EXTENDEDKEY: u32 = 0x0001;
    const MOUSEEVENTF_MOVE: u32 = 0x0001;
    const MOUSEEVENTF_LEFTDOWN: u32 = 0x0002;
    const MOUSEEVENTF_LEFTUP: u32 = 0x0004;
    const MOUSEEVENTF_RIGHTDOWN: u32 = 0x0008;
    const MOUSEEVENTF_RIGHTUP: u32 = 0x0010;
    const MOUSEEVENTF_MIDDLEDOWN: u32 = 0x0020;
    const MOUSEEVENTF_MIDDLEUP: u32 = 0x0040;
    const MOUSEEVENTF_XDOWN: u32 = 0x0080;
    const MOUSEEVENTF_XUP: u32 = 0x0100;

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct KeyboardInput {
        w_vk: u16,
        w_scan: u16,
        dw_flags: u32,
        time: u32,
        dw_extra_info: usize,
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct MouseInput {
        dx: i32,
        dy: i32,
        mouse_data: u32,
        dw_flags: u32,
        time: u32,
        dw_extra_info: usize,
    }

    #[repr(C)]
    union InputUnion {
        keyboard: KeyboardInput,
        mouse: MouseInput,
    }

    #[repr(C)]
    struct Input {
        input_type: u32,
        data: InputUnion,
    }

    #[link(name = "user32")]
    extern "system" {
        fn SendInput(count: u32, inputs: *const Input, size: i32) -> u32;
        fn MapVirtualKeyW(code: u32, map_type: u32) -> u32;
        fn GetForegroundWindow() -> isize;
    }

    pub fn foreground_window() -> isize {
        unsafe { GetForegroundWindow() }
    }

    pub fn validate_event(event_type: &str, raw_code: &str) -> Result<(), String> {
        if !matches!(event_type, "keydown" | "keyup" | "mousedown" | "mouseup") {
            return Err(format!("不支持的模拟输入事件：{event_type}"));
        }
        let code = raw_code.strip_suffix("Hold").unwrap_or(raw_code);
        if mouse_event(code, true).is_some() {
            return Ok(());
        }
        let Some(vk) = virtual_key(code) else {
            return Err(format!("无法模拟的按键：{raw_code}"));
        };
        let scan = unsafe { MapVirtualKeyW(vk as u32, 0) } as u16;
        if scan == 0 {
            return Err(format!("无法获取按键扫描码：{raw_code}"));
        }
        Ok(())
    }

    pub fn inject(
        event_type: &str,
        raw_code: &str,
        cursor_dx: i32,
        cursor_dy: i32,
    ) -> Result<(), String> {
        let code = raw_code.strip_suffix("Hold").unwrap_or(raw_code);
        let pressed = matches!(event_type, "keydown" | "mousedown");
        let released = matches!(event_type, "keyup" | "mouseup");
        if !pressed && !released {
            return Err(format!("不支持的模拟输入事件：{event_type}"));
        }

        if let Some((mouse_flags, mouse_data)) = mouse_event(code, pressed) {
            let cursor_dx = cursor_dx.clamp(-32, 32);
            let cursor_dy = cursor_dy.clamp(-32, 32);
            if cursor_dx != 0 || cursor_dy != 0 {
                let move_input = Input {
                    input_type: INPUT_MOUSE,
                    data: InputUnion {
                        mouse: MouseInput {
                            dx: if pressed { cursor_dx } else { 0 },
                            dy: if pressed { cursor_dy } else { 0 },
                            mouse_data: 0,
                            dw_flags: MOUSEEVENTF_MOVE,
                            time: 0,
                            dw_extra_info: 0,
                        },
                    },
                };
                send(move_input)?;
            }
            let input = Input {
                input_type: INPUT_MOUSE,
                data: InputUnion {
                    mouse: MouseInput {
                        dx: 0,
                        dy: 0,
                        mouse_data,
                        dw_flags: mouse_flags,
                        time: 0,
                        dw_extra_info: 0,
                    },
                },
            };
            send(input)?;
            if !pressed && (cursor_dx != 0 || cursor_dy != 0) {
                let restore_input = Input {
                    input_type: INPUT_MOUSE,
                    data: InputUnion {
                        mouse: MouseInput {
                            dx: -cursor_dx,
                            dy: -cursor_dy,
                            mouse_data: 0,
                            dw_flags: MOUSEEVENTF_MOVE,
                            time: 0,
                            dw_extra_info: 0,
                        },
                    },
                };
                send(restore_input)?;
            }
            return Ok(());
        }

        let Some(vk) = virtual_key(code) else {
            return Err(format!("无法模拟的按键：{raw_code}"));
        };
        let scan = unsafe { MapVirtualKeyW(vk as u32, 0) } as u16;
        if scan == 0 {
            return Err(format!("无法获取按键扫描码：{raw_code}"));
        }
        let extended = is_extended_key(code);
        let mut flags = KEYEVENTF_SCANCODE;
        if released {
            flags |= KEYEVENTF_KEYUP;
        }
        if extended {
            flags |= KEYEVENTF_EXTENDEDKEY;
        }
        let input = Input {
            input_type: INPUT_KEYBOARD,
            data: InputUnion {
                keyboard: KeyboardInput {
                    w_vk: 0,
                    w_scan: scan,
                    dw_flags: flags,
                    time: 0,
                    dw_extra_info: 0,
                },
            },
        };
        send(input)
    }

    fn send(input: Input) -> Result<(), String> {
        let inserted = unsafe { SendInput(1, &input, std::mem::size_of::<Input>() as i32) };
        if inserted == 1 {
            Ok(())
        } else {
            Err(String::from("Windows 未接受模拟输入"))
        }
    }

    fn mouse_event(code: &str, pressed: bool) -> Option<(u32, u32)> {
        match code {
            "MouseLeft" => Some((
                if pressed {
                    MOUSEEVENTF_LEFTDOWN
                } else {
                    MOUSEEVENTF_LEFTUP
                },
                0,
            )),
            "MouseRight" => Some((
                if pressed {
                    MOUSEEVENTF_RIGHTDOWN
                } else {
                    MOUSEEVENTF_RIGHTUP
                },
                0,
            )),
            "MouseMiddle" => Some((
                if pressed {
                    MOUSEEVENTF_MIDDLEDOWN
                } else {
                    MOUSEEVENTF_MIDDLEUP
                },
                0,
            )),
            "Mouse3" => Some((
                if pressed {
                    MOUSEEVENTF_XDOWN
                } else {
                    MOUSEEVENTF_XUP
                },
                1,
            )),
            "Mouse4" => Some((
                if pressed {
                    MOUSEEVENTF_XDOWN
                } else {
                    MOUSEEVENTF_XUP
                },
                2,
            )),
            _ => None,
        }
    }

    fn virtual_key(code: &str) -> Option<u16> {
        let value = match code {
            "Backspace" => 0x08,
            "Tab" => 0x09,
            "Enter" | "NumpadEnter" => 0x0D,
            "ShiftLeft" | "ShiftRight" => 0x10,
            "ControlLeft" | "ControlRight" => 0x11,
            "AltLeft" | "AltRight" => 0x12,
            "Pause" => 0x13,
            "CapsLock" => 0x14,
            "Escape" => 0x1B,
            "Space" => 0x20,
            "PageUp" => 0x21,
            "PageDown" => 0x22,
            "End" => 0x23,
            "Home" => 0x24,
            "ArrowLeft" => 0x25,
            "ArrowUp" => 0x26,
            "ArrowRight" => 0x27,
            "ArrowDown" => 0x28,
            "PrintScreen" => 0x2C,
            "Insert" => 0x2D,
            "Delete" => 0x2E,
            "MetaLeft" => 0x5B,
            "MetaRight" => 0x5C,
            "ContextMenu" => 0x5D,
            "Numpad0" => 0x60,
            "Numpad1" => 0x61,
            "Numpad2" => 0x62,
            "Numpad3" => 0x63,
            "Numpad4" => 0x64,
            "Numpad5" => 0x65,
            "Numpad6" => 0x66,
            "Numpad7" => 0x67,
            "Numpad8" => 0x68,
            "Numpad9" => 0x69,
            "NumpadMultiply" => 0x6A,
            "NumpadAdd" => 0x6B,
            "NumpadSubtract" => 0x6D,
            "NumpadDecimal" => 0x6E,
            "NumpadDivide" => 0x6F,
            "NumLock" => 0x90,
            "ScrollLock" => 0x91,
            "Clear" => 0x0C,
            "Semicolon" => 0xBA,
            "Equal" => 0xBB,
            "Comma" => 0xBC,
            "Minus" => 0xBD,
            "Period" => 0xBE,
            "Slash" => 0xBF,
            "Backquote" => 0xC0,
            "BracketLeft" => 0xDB,
            "Backslash" => 0xDC,
            "BracketRight" => 0xDD,
            "Quote" => 0xDE,
            _ => {
                if let Some(number) = code.strip_prefix("Key") {
                    let byte = number.as_bytes().first().copied()?;
                    if number.len() == 1 && byte.is_ascii_alphabetic() {
                        return Some(byte.to_ascii_uppercase() as u16);
                    }
                }
                if let Some(number) = code.strip_prefix("Digit") {
                    let byte = number.as_bytes().first().copied()?;
                    if number.len() == 1 && byte.is_ascii_digit() {
                        return Some(byte as u16);
                    }
                }
                if let Some(number) = code.strip_prefix('F') {
                    let number = number.parse::<u16>().ok()?;
                    if (1..=24).contains(&number) {
                        return Some(0x70 + number - 1);
                    }
                }
                return None;
            }
        };
        Some(value)
    }

    fn is_extended_key(code: &str) -> bool {
        matches!(
            code,
            "ArrowLeft"
                | "ArrowUp"
                | "ArrowRight"
                | "ArrowDown"
                | "Insert"
                | "Delete"
                | "Home"
                | "End"
                | "PageUp"
                | "PageDown"
                | "PrintScreen"
                | "MetaLeft"
                | "MetaRight"
                | "ContextMenu"
                | "ControlRight"
                | "AltRight"
                | "NumpadEnter"
                | "NumpadDivide"
        )
    }
}

#[tauri::command]
fn start_global_input(app: AppHandle) -> serde_json::Value {
    *APP_HANDLE.lock() = Some(app.clone());
    GLOBAL_INPUT_ENABLED.store(true, Ordering::SeqCst);

    if INPUT_HOOK_STARTED.swap(true, Ordering::SeqCst) {
        *INPUT_HOOK_STATUS.lock() = format!(
            "running: {}",
            global_input_mode_name(GLOBAL_INPUT_MODE.load(Ordering::SeqCst))
        );
        return serde_json::json!({ "ok": true });
    }

    *INPUT_HOOK_STATUS.lock() = String::from("starting");
    match start_windows_global_input(app) {
        Ok(()) => {
            if INPUT_HOOK_STATUS.lock().as_str() == "starting" {
                *INPUT_HOOK_STATUS.lock() = String::from("running");
            }
            serde_json::json!({ "ok": true })
        }
        Err(error) => {
            INPUT_HOOK_STARTED.store(false, Ordering::SeqCst);
            GLOBAL_INPUT_ENABLED.store(false, Ordering::SeqCst);
            *INPUT_HOOK_STATUS.lock() = format!("failed: {error}");
            serde_json::json!({ "ok": false, "reason": error })
        }
    }
}

#[tauri::command]
fn stop_global_input() {
    GLOBAL_INPUT_ENABLED.store(false, Ordering::SeqCst);
    clear_global_input_pressed_state();
    *INPUT_HOOK_STATUS.lock() = String::from("paused");
}

#[tauri::command]
fn set_global_input_mode(mode: String) -> Result<(), String> {
    let next_mode = parse_global_input_mode(&mode)
        .ok_or_else(|| format!("unsupported global input mode: {mode}"))?;
    let previous_mode = GLOBAL_INPUT_MODE.swap(next_mode, Ordering::SeqCst);
    if previous_mode != next_mode {
        clear_global_input_pressed_state();
    }
    if GLOBAL_INPUT_ENABLED.load(Ordering::SeqCst) {
        *INPUT_HOOK_STATUS.lock() = format!("running: {}", global_input_mode_name(next_mode));
    }
    Ok(())
}

#[tauri::command]
fn global_input_status() -> serde_json::Value {
    let status = INPUT_HOOK_STATUS.lock().clone();
    let event_count = *INPUT_EVENT_COUNT.lock();
    serde_json::json!({
        "started": INPUT_HOOK_STARTED.load(Ordering::SeqCst)
            && GLOBAL_INPUT_ENABLED.load(Ordering::SeqCst),
        "status": status,
        "eventCount": event_count,
        "mode": global_input_mode_name(GLOBAL_INPUT_MODE.load(Ordering::SeqCst))
    })
}

#[tauri::command]
fn save_export_file(
    app: AppHandle,
    directory: String,
    filename: String,
    bytes: Vec<u8>,
) -> Result<SaveExportResult, String> {
    let path = export_file_path(&app, &directory, &filename)?;
    fs::write(&path, bytes).map_err(|error| error.to_string())?;
    Ok(SaveExportResult {
        path: path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
#[cfg(not(target_os = "android"))]
fn pick_export_directory(current_directory: String, title: String) -> Option<String> {
    let dialog_title = if title.trim().is_empty() {
        "Select Export Folder"
    } else {
        title.trim()
    };
    let mut dialog = rfd::FileDialog::new().set_title(dialog_title);
    let current = PathBuf::from(current_directory.trim());
    if current.is_dir() {
        dialog = dialog.set_directory(current);
    }
    dialog
        .pick_folder()
        .map(|path| path.to_string_lossy().to_string())
}

#[tauri::command]
#[cfg(target_os = "android")]
fn pick_export_directory(_current_directory: String, _title: String) -> Option<String> {
    None
}

#[tauri::command]
#[cfg(not(target_os = "android"))]
fn pick_video_file() -> Option<PickedVideoFile> {
    rfd::FileDialog::new()
        .add_filter("视频文件", &["mp4", "mov", "mkv", "webm", "avi", "m4v"])
        .pick_file()
        .map(|path| PickedVideoFile {
            name: path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("video")
                .to_string(),
            path: path.to_string_lossy().to_string(),
        })
}

#[tauri::command]
#[cfg(target_os = "android")]
fn pick_video_file() -> Option<PickedVideoFile> {
    None
}

fn is_recognition_cyan(red: u8, green: u8, blue: u8) -> bool {
    let red = i16::from(red);
    let green = i16::from(green);
    let blue = i16::from(blue);
    green > 110 && blue > 110 && (green - red).min(blue - red) > 35 && (green - blue).abs() < 105
}

fn measure_recognition_hotspot(
    frame: &[u8],
    width: usize,
    height: usize,
    hotspot: &VideoRecognitionHotspot,
) -> VideoRecognitionFrameSample {
    let radius = hotspot.radius.max(3.0);
    let outer_inner = radius + (radius * 0.18).max(2.0);
    let outer_radius = radius + (radius * 0.55).max(4.0);
    let min_x = (hotspot.x - outer_radius).floor().max(0.0) as usize;
    let max_x = (hotspot.x + outer_radius)
        .ceil()
        .min(width.saturating_sub(1) as f64) as usize;
    let min_y = (hotspot.y - outer_radius).floor().max(0.0) as usize;
    let max_y = (hotspot.y + outer_radius)
        .ceil()
        .min(height.saturating_sub(1) as f64) as usize;
    let radius_squared = radius * radius;
    let outer_inner_squared = outer_inner * outer_inner;
    let outer_radius_squared = outer_radius * outer_radius;
    let mut inner_total = 0_u64;
    let mut inner_cyan = 0_u64;
    let mut outer_total = 0_u64;
    let mut outer_cyan = 0_u64;

    for y in min_y..=max_y {
        for x in min_x..=max_x {
            let dx = x as f64 - hotspot.x;
            let dy = y as f64 - hotspot.y;
            let distance_squared = dx * dx + dy * dy;
            let pixel_offset = (y * width + x) * 3;
            if pixel_offset + 2 >= frame.len() {
                continue;
            }
            let cyan = is_recognition_cyan(
                frame[pixel_offset],
                frame[pixel_offset + 1],
                frame[pixel_offset + 2],
            );
            if distance_squared <= radius_squared {
                inner_total += 1;
                if cyan {
                    inner_cyan += 1;
                }
            } else if distance_squared >= outer_inner_squared
                && distance_squared <= outer_radius_squared
            {
                outer_total += 1;
                if cyan {
                    outer_cyan += 1;
                }
            }
        }
    }

    let inner_ratio = inner_cyan as f64 / inner_total.max(1) as f64;
    let outer_ratio = outer_cyan as f64 / outer_total.max(1) as f64;
    let contrast = inner_ratio - outer_ratio;
    let confidence = (inner_ratio * 0.6 + contrast.max(0.0) * 0.4).clamp(0.0, 1.0);
    let sensitivity = hotspot.sensitivity.clamp(0.65, 1.0);
    VideoRecognitionFrameSample {
        active: inner_ratio >= 0.34 * sensitivity
            && contrast >= 0.14 * sensitivity
            && confidence >= 0.26 * sensitivity,
        weak_active: inner_ratio >= 0.24 * sensitivity
            && contrast >= 0.08 * sensitivity
            && confidence >= 0.18 * sensitivity,
        confidence,
    }
}

fn recognition_events_for_hotspot(
    hotspot_id: &str,
    samples: &[VideoRecognitionFrameSample],
    fps: u32,
    merge_repeated_hold: bool,
    preserve_tap_gaps: bool,
) -> Vec<VideoRecognitionEvent> {
    if samples.is_empty() || fps == 0 {
        return Vec::new();
    }
    let mut normalized = samples.to_vec();
    let mut tracking_active = false;
    for sample in &mut normalized {
        if sample.active {
            tracking_active = true;
        } else if tracking_active && sample.weak_active {
            sample.active = true;
        } else {
            tracking_active = false;
        }
    }

    let max_hole_frames = if preserve_tap_gaps {
        0
    } else if merge_repeated_hold {
        ((fps as f64 * 0.05).ceil() as usize).max(1)
    } else {
        1
    };
    let mut index = 0_usize;
    while index < normalized.len() {
        if normalized[index].active {
            index += 1;
            continue;
        }
        let gap_start = index;
        while index < normalized.len() && !normalized[index].active {
            index += 1;
        }
        let gap_end = index;
        if gap_start > 0
            && gap_end < normalized.len()
            && gap_end - gap_start <= max_hole_frames
            && normalized[gap_start - 1].active
            && normalized[gap_end].active
        {
            let confidence =
                (normalized[gap_start - 1].confidence + normalized[gap_end].confidence) / 2.0;
            for sample in &mut normalized[gap_start..gap_end] {
                sample.active = true;
                sample.confidence = confidence;
            }
        }
    }

    let mut runs = Vec::<(usize, usize, f64)>::new();
    index = 0;
    while index < normalized.len() {
        if !normalized[index].active {
            index += 1;
            continue;
        }
        let start = index;
        index += 1;
        while index < normalized.len() && normalized[index].active {
            index += 1;
        }
        let end = index;
        if end - start < 2 {
            continue;
        }
        let confidence = normalized[start..end]
            .iter()
            .map(|sample| sample.confidence)
            .sum::<f64>()
            / (end - start) as f64;
        runs.push((start, end, confidence));
    }

    if merge_repeated_hold && runs.len() >= 3 {
        let max_repeat_gap_frames = ((fps as f64 * 0.4).ceil() as usize).max(1);
        let minimum_hold_frames = ((fps as f64 * 0.3).ceil() as usize).max(2);
        let mut merged = Vec::with_capacity(runs.len());
        let mut run_index = 0_usize;
        while run_index < runs.len() {
            let group_start = run_index;
            run_index += 1;
            while run_index < runs.len()
                && runs[run_index].0.saturating_sub(runs[run_index - 1].1) <= max_repeat_gap_frames
            {
                run_index += 1;
            }
            let group = &runs[group_start..run_index];
            let span_frames = group.last().unwrap().1 - group[0].0;
            if group.len() >= 3 && span_frames >= minimum_hold_frames {
                let active_frames = group
                    .iter()
                    .map(|(start, end, _)| end - start)
                    .sum::<usize>();
                let confidence = group
                    .iter()
                    .map(|(start, end, confidence)| confidence * (end - start) as f64)
                    .sum::<f64>()
                    / active_frames.max(1) as f64;
                merged.push((group[0].0, group.last().unwrap().1, confidence));
            } else {
                merged.extend_from_slice(group);
            }
        }
        runs = merged;
    }

    runs.into_iter()
        .map(|(start, end, confidence)| VideoRecognitionEvent {
            hotspot_id: hotspot_id.to_string(),
            start_ms: ((start as f64 * 1000.0) / fps as f64).round() as u64,
            duration_ms: (((end - start) as f64 * 1000.0) / fps as f64).round() as u64,
            confidence,
        })
        .collect()
}

#[cfg(test)]
mod video_recognition_tests {
    use super::{is_recognition_cyan, recognition_events_for_hotspot, VideoRecognitionFrameSample};

    fn sample(active: bool) -> VideoRecognitionFrameSample {
        VideoRecognitionFrameSample {
            active,
            weak_active: active,
            confidence: if active { 0.9 } else { 0.0 },
        }
    }

    #[test]
    fn cyan_classifier_accepts_overlay_blue_and_rejects_neutral_pixels() {
        assert!(is_recognition_cyan(36, 188, 224));
        assert!(!is_recognition_cyan(210, 210, 210));
        assert!(!is_recognition_cyan(180, 64, 48));
    }

    #[test]
    fn fills_a_single_inactive_frame_inside_an_active_run() {
        let events = recognition_events_for_hotspot(
            "skill",
            &[sample(true), sample(false), sample(true)],
            30,
            false,
            false,
        );
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].start_ms, 0);
        assert_eq!(events[0].duration_ms, 100);
    }

    #[test]
    fn rejects_single_frame_noise() {
        let events = recognition_events_for_hotspot(
            "skill",
            &[sample(false), sample(true), sample(false)],
            30,
            false,
            false,
        );
        assert!(events.is_empty());
    }

    #[test]
    fn coalesces_keyboard_repeat_pulses_into_one_hold() {
        let mut samples = Vec::new();
        for _ in 0..4 {
            samples.extend([
                sample(true),
                sample(true),
                sample(false),
                sample(false),
                sample(false),
            ]);
        }
        let events = recognition_events_for_hotspot("skill", &samples, 30, true, false);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].start_ms, 0);
        assert!(events[0].duration_ms >= 500);
    }

    #[test]
    fn keeps_repeated_basic_attack_pulses_separate() {
        let mut samples = Vec::new();
        for _ in 0..4 {
            samples.extend([
                sample(true),
                sample(true),
                sample(false),
                sample(false),
                sample(false),
            ]);
        }
        let events = recognition_events_for_hotspot("basic-attack", &samples, 30, false, true);
        assert_eq!(events.len(), 4);
    }

    #[test]
    fn does_not_fill_a_basic_attack_tap_gap() {
        let events = recognition_events_for_hotspot(
            "basic-attack",
            &[
                sample(true),
                sample(true),
                sample(false),
                sample(true),
                sample(true),
            ],
            30,
            false,
            true,
        );
        assert_eq!(events.len(), 2);
    }
}

#[tauri::command]
fn cancel_video_key_mapping_recognition() {
    VIDEO_RECOGNITION_CANCELLED.store(true, Ordering::SeqCst);
}

#[tauri::command]
async fn analyze_video_key_mapping(
    app: AppHandle,
    request: VideoRecognitionRequest,
) -> Result<VideoRecognitionResult, String> {
    if VIDEO_RECOGNITION_RUNNING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err(String::from("已有视频按键识别任务正在运行。"));
    }
    VIDEO_RECOGNITION_CANCELLED.store(false, Ordering::SeqCst);
    tauri::async_runtime::spawn_blocking(move || {
        let _run_guard = VideoRecognitionRunGuard;
        let source = PathBuf::from(request.source_path.trim());
        if !source.is_file() {
            return Err(String::from("视频文件不存在，请重新导入后再识别。"));
        }
        if request.hotspots.is_empty() {
            return Err(String::from("没有可识别的按键位置。"));
        }
        let fps = request.fps.clamp(10, 60);
        // FFmpeg's default yuv420 decoder requires even crop dimensions. Keep the
        // byte buffer dimensions identical to the dimensions emitted by FFmpeg.
        let crop_width = request.crop_width.max(8) & !1;
        let crop_height = request.crop_height.max(8) & !1;
        let crop_x = request.crop_x & !1;
        let crop_y = request.crop_y & !1;
        let frame_bytes = usize::try_from(crop_width)
            .ok()
            .and_then(|width| {
                usize::try_from(crop_height)
                    .ok()
                    .map(|height| width * height * 3)
            })
            .ok_or_else(|| String::from("识别区域尺寸无效。"))?;
        let ffmpeg =
            find_ffmpeg(&app).ok_or_else(|| String::from("未找到 ffmpeg，无法识别视频。"))?;
        let start_seconds = format!("{:.3}", request.start_ms as f64 / 1000.0);
        let duration_seconds = format!("{:.3}", request.duration_ms.max(1) as f64 / 1000.0);
        let filter = format!(
            "crop={}:{}:{}:{},fps={}",
            crop_width, crop_height, crop_x, crop_y, fps
        );
        let mut child = Command::new(ffmpeg)
            .arg("-hide_banner")
            .arg("-loglevel")
            .arg("error")
            .arg("-ss")
            .arg(&start_seconds)
            .arg("-i")
            .arg(&source)
            .arg("-t")
            .arg(&duration_seconds)
            .arg("-vf")
            .arg(filter)
            .arg("-an")
            .arg("-sn")
            .arg("-f")
            .arg("rawvideo")
            .arg("-pix_fmt")
            .arg("rgb24")
            .arg("pipe:1")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| format!("启动视频识别失败：{error}"))?;
        let mut stdout = child
            .stdout
            .take()
            .ok_or_else(|| String::from("无法读取 ffmpeg 视频帧。"))?;
        let mut stderr = child.stderr.take();
        let mut frame = vec![0_u8; frame_bytes];
        let mut samples = vec![Vec::<VideoRecognitionFrameSample>::new(); request.hotspots.len()];
        let total_frames = ((request.duration_ms.max(1) as f64 / 1000.0) * fps as f64)
            .ceil()
            .max(1.0) as u64;
        let mut processed_frames = 0_u64;
        loop {
            if VIDEO_RECOGNITION_CANCELLED.load(Ordering::SeqCst) {
                let _ = child.kill();
                let _ = child.wait();
                return Err(String::from("视频按键识别已取消。"));
            }
            match stdout.read_exact(&mut frame) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::UnexpectedEof => break,
                Err(error) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(format!("读取视频帧失败：{error}"));
                }
            }
            for (index, hotspot) in request.hotspots.iter().enumerate() {
                samples[index].push(measure_recognition_hotspot(
                    &frame,
                    crop_width as usize,
                    crop_height as usize,
                    hotspot,
                ));
            }
            processed_frames += 1;
            if processed_frames % 6 == 0 || processed_frames >= total_frames {
                let _ = app.emit(
                    "video-key-recognition-progress",
                    serde_json::json!({
                        "progress": (processed_frames as f64 / total_frames as f64).clamp(0.0, 1.0),
                        "processedFrames": processed_frames,
                        "totalFrames": total_frames
                    }),
                );
            }
        }
        let status = child
            .wait()
            .map_err(|error| format!("等待视频识别结束失败：{error}"))?;
        let mut error_text = String::new();
        if let Some(ref mut error_stream) = stderr {
            let _ = error_stream.read_to_string(&mut error_text);
        }
        if !status.success() {
            let details = error_text
                .lines()
                .rev()
                .take(4)
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect::<Vec<_>>()
                .join(" | ");
            return Err(if details.is_empty() {
                format!(
                    "ffmpeg 视频识别失败，退出码：{}",
                    status.code().unwrap_or(-1)
                )
            } else {
                format!("ffmpeg 视频识别失败：{details}")
            });
        }
        let mut events = request
            .hotspots
            .iter()
            .enumerate()
            .flat_map(|(index, hotspot)| {
                recognition_events_for_hotspot(
                    &hotspot.id,
                    &samples[index],
                    fps,
                    hotspot.merge_repeated_hold,
                    hotspot.preserve_tap_gaps,
                )
            })
            .collect::<Vec<_>>();
        events.sort_by(|left, right| {
            left.start_ms
                .cmp(&right.start_ms)
                .then_with(|| left.hotspot_id.cmp(&right.hotspot_id))
        });
        let _ = app.emit(
            "video-key-recognition-progress",
            serde_json::json!({
                "progress": 1.0,
                "processedFrames": processed_frames,
                "totalFrames": total_frames
            }),
        );
        Ok(VideoRecognitionResult {
            events,
            analyzed_frames: processed_frames,
            fps,
        })
    })
    .await
    .map_err(|error| format!("视频识别任务异常结束：{error}"))?
}

#[tauri::command]
fn cancel_video_export() {
    VIDEO_EXPORT_CANCELLED.store(true, Ordering::SeqCst);
}

#[tauri::command]
async fn export_video_with_overlay(
    app: AppHandle,
    directory: String,
    filename: String,
    source_path: String,
    overlay_x: i32,
    overlay_y: i32,
    start_ms: u64,
    duration_ms: u64,
    overlay_bytes: Vec<u8>,
) -> Result<ExportVideoResult, String> {
    VIDEO_EXPORT_CANCELLED.store(false, Ordering::SeqCst);
    tauri::async_runtime::spawn_blocking(move || {
        let source = PathBuf::from(source_path.trim());
        if !source.is_file() {
            return Err(String::from("\u{539f}\u{89c6}\u{9891}\u{6587}\u{4ef6}\u{4e0d}\u{5b58}\u{5728}\u{ff0c}\u{8bf7}\u{91cd}\u{65b0}\u{9009}\u{62e9}\u{89c6}\u{9891}\u{540e}\u{518d}\u{5bfc}\u{51fa}\u{3002}"));
        }
        let output_path = unique_export_path(export_file_path(&app, &directory, &filename)?);
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|value| value.as_millis())
            .unwrap_or_default();
        let temp_dir = std::env::temp_dir().join(format!("wwcombo-video-export-{}-{nonce}", std::process::id()));
        fs::create_dir_all(&temp_dir).map_err(|error| error.to_string())?;
        let overlay_path = temp_dir.join("overlay.webm");
        let temp_output_path = temp_dir.join("output.mp4");
        let error_log_path = temp_dir.join("ffmpeg-error.log");
        fs::write(&overlay_path, overlay_bytes).map_err(|error| error.to_string())?;
        let ffmpeg = find_ffmpeg(&app).ok_or_else(|| String::from("\u{672a}\u{627e}\u{5230} ffmpeg\u{ff0c}\u{65e0}\u{6cd5}\u{5408}\u{6210} MP4\u{3002}"))?;
        let error_log = fs::File::create(&error_log_path).map_err(|error| format!("\u{65e0}\u{6cd5}\u{521b}\u{5efa}\u{5bfc}\u{51fa}\u{65e5}\u{5fd7}\u{ff1a}{error}"))?;
        let start_seconds = format!("{:.3}", start_ms as f64 / 1000.0);
        let duration_seconds = format!("{:.3}", duration_ms as f64 / 1000.0);
        let mut child = Command::new(ffmpeg)
            .arg("-y")
            .arg("-ss")
            .arg(&start_seconds)
            .arg("-i")
            .arg(&source)
            .arg("-c:v")
            .arg("libvpx-vp9")
            .arg("-i")
            .arg(&overlay_path)
            .arg("-filter_complex").arg(format!("[1:v]format=rgba[overlay];[0:v][overlay]overlay={}:{}:format=auto:eof_action=pass[v]", overlay_x.max(0), overlay_y.max(0)))
            .arg("-map").arg("[v]")
            .arg("-map").arg("0:a?")
            .arg("-map_metadata").arg("0")
            .arg("-c:v").arg("libx264")
            .arg("-preset").arg("medium")
            .arg("-crf").arg("12")
            .arg("-pix_fmt").arg("yuv420p")
            .arg("-colorspace").arg("bt709")
            .arg("-color_primaries").arg("bt709")
            .arg("-color_trc").arg("bt709")
            .arg("-color_range").arg("tv")
            .arg("-c:a").arg("aac")
            .arg("-b:a").arg("320k")
            .arg("-movflags").arg("+faststart")
            .arg("-t")
            .arg(&duration_seconds)
            .arg("-progress")
            .arg("pipe:1")
            .arg("-nostats")
            .arg(&temp_output_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::from(error_log))
            .spawn()
            .map_err(|error| format!("\u{542f}\u{52a8} ffmpeg \u{5931}\u{8d25}\u{ff1a}{error}"))?;
        if let Some(stdout) = child.stdout.take() {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if VIDEO_EXPORT_CANCELLED.load(Ordering::SeqCst) {
                    let _ = child.kill();
                    let _ = child.wait();
                    let _ = fs::remove_dir_all(&temp_dir);
                    return Err(String::from("\u{89c6}\u{9891}\u{5bfc}\u{51fa}\u{5df2}\u{53d6}\u{6d88}"));
                }
                if let Some(value) = line.strip_prefix("out_time_ms=") {
                    if let Ok(microseconds) = value.parse::<u64>() {
                        let processed_ms = microseconds / 1000;
                        let progress = if duration_ms > 0 {
                            (processed_ms as f64 / duration_ms as f64).clamp(0.0, 1.0)
                        } else {
                            0.0
                        };
                        let _ = app.emit("video-export-progress", serde_json::json!({
                            "progress": progress,
                            "processedMs": processed_ms,
                            "durationMs": duration_ms
                        }));
                    }
                }
            }
        }
        if VIDEO_EXPORT_CANCELLED.load(Ordering::SeqCst) {
            let _ = child.kill();
            let _ = child.wait();
            let _ = fs::remove_dir_all(&temp_dir);
            return Err(String::from("\u{89c6}\u{9891}\u{5bfc}\u{51fa}\u{5df2}\u{53d6}\u{6d88}"));
        }
        let status = child.wait().map_err(|error| format!("\u{7b49}\u{5f85} ffmpeg \u{7ed3}\u{675f}\u{5931}\u{8d25}\u{ff1a}{error}"))?;
        if !status.success() {
            let details = ffmpeg_error_summary(&error_log_path);
            let _ = fs::remove_dir_all(&temp_dir);
            return Err(format!(
                "ffmpeg \u{5408}\u{6210} MP4 \u{5931}\u{8d25}\u{ff0c}\u{9000}\u{51fa}\u{7801}\u{ff1a}{}{}",
                status.code().unwrap_or(-1),
                details
            ));
        }
        if !temp_output_path.is_file() {
            let _ = fs::remove_dir_all(&temp_dir);
            return Err(String::from("ffmpeg \u{5df2}\u{7ed3}\u{675f}\u{ff0c}\u{4f46}\u{6ca1}\u{6709}\u{751f}\u{6210} MP4 \u{6587}\u{4ef6}\u{3002}"));
        }
        if let Err(rename_error) = fs::rename(&temp_output_path, &output_path) {
            fs::copy(&temp_output_path, &output_path)
                .map_err(|copy_error| format!("\u{5bfc}\u{51fa}\u{89c6}\u{9891}\u{5199}\u{5165}\u{5931}\u{8d25}\u{ff1a}{copy_error}\u{ff08}\u{79fb}\u{52a8}\u{5931}\u{8d25}\u{ff1a}{rename_error}\u{ff09}"))?;
        }
        let _ = fs::remove_dir_all(&temp_dir);
        Ok(ExportVideoResult { path: output_path.to_string_lossy().to_string() })
    })
    .await
    .map_err(|error| format!("\u{89c6}\u{9891}\u{5bfc}\u{51fa}\u{4efb}\u{52a1}\u{5f02}\u{5e38}\u{7ed3}\u{675f}\u{ff1a}{error}"))?
}

#[tauri::command]
fn save_export_mp4(
    app: AppHandle,
    directory: String,
    filename: String,
    bytes: Vec<u8>,
) -> Result<ExportVideoResult, String> {
    let output_path = unique_export_path(export_file_path(&app, &directory, &filename)?);
    let temp_webm_path = output_path.with_extension("exporting.webm");
    fs::write(&temp_webm_path, bytes).map_err(|error| error.to_string())?;
    let ffmpeg = find_ffmpeg(&app).ok_or_else(|| String::from("未安装视频扩展，无法转出 MP4。请将 FFmpeg DLC 解压到 wwcombo.exe 同级的 wwcombo dlc/ffmpeg 目录，或安装 ffmpeg 到 PATH。"))?;
    let status = Command::new(ffmpeg)
        .arg("-y")
        .arg("-i")
        .arg(&temp_webm_path)
        .arg("-c:v")
        .arg("libx264")
        .arg("-pix_fmt")
        .arg("yuv420p")
        .arg("-preset")
        .arg("veryfast")
        .arg("-crf")
        .arg("18")
        .arg("-c:a")
        .arg("aac")
        .arg("-b:a")
        .arg("192k")
        .arg("-movflags")
        .arg("+faststart")
        .arg(&output_path)
        .status()
        .map_err(|error| format!("启动 ffmpeg 失败：{error}"))?;
    let _ = fs::remove_file(&temp_webm_path);
    if !status.success() {
        let _ = fs::remove_file(&output_path);
        return Err(format!(
            "ffmpeg 转 MP4 失败，退出码：{}",
            status.code().unwrap_or(-1)
        ));
    }
    Ok(ExportVideoResult {
        path: output_path.to_string_lossy().to_string(),
    })
}

fn export_file_path(_app: &AppHandle, directory: &str, filename: &str) -> Result<PathBuf, String> {
    let safe_name = Path::new(filename)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty())
        .ok_or_else(|| String::from("导出文件名无效"))?;
    if directory.trim().is_empty() {
        return Err(String::from("请先选择导出文件夹"));
    }
    let directory_path = PathBuf::from(directory.trim());
    fs::create_dir_all(&directory_path).map_err(|error| error.to_string())?;
    if !directory_path.is_dir() {
        return Err(String::from("导出路径不是文件夹"));
    }
    Ok(directory_path.join(safe_name))
}

fn unique_export_path(path: PathBuf) -> PathBuf {
    if !path.exists() {
        return path;
    }
    let parent = path.parent().unwrap_or_else(|| Path::new(""));
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("video");
    let extension = path.extension().and_then(|value| value.to_str());
    for index in 1..10_000 {
        let name = match extension {
            Some(extension) if !extension.is_empty() => format!("{stem} ({index}).{extension}"),
            _ => format!("{stem} ({index})"),
        };
        let candidate = parent.join(name);
        if !candidate.exists() {
            return candidate;
        }
    }
    parent.join(format!(
        "{stem}-{}{}",
        current_time_ms() as u64,
        extension
            .map(|value| format!(".{value}"))
            .unwrap_or_default()
    ))
}

fn ffmpeg_error_summary(path: &Path) -> String {
    let Ok(contents) = fs::read_to_string(path) else {
        return String::new();
    };
    let lines = contents
        .lines()
        .filter(|line| !line.trim().is_empty())
        .collect::<Vec<_>>();
    let start = lines.len().saturating_sub(8);
    let summary = lines[start..].join(" | ");
    if summary.is_empty() {
        String::new()
    } else {
        format!("\u{ff1a}{summary}")
    }
}

#[cfg(test)]
mod export_path_tests {
    use super::unique_export_path;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn chooses_next_available_export_name() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("wwcombo-export-path-test-{nonce}"));
        fs::create_dir_all(&directory).unwrap();
        let base = directory.join("video.mp4");
        let first = directory.join("video (1).mp4");
        fs::write(&base, b"base").unwrap();
        fs::write(&first, b"first").unwrap();
        assert_eq!(unique_export_path(base), directory.join("video (2).mp4"));
        fs::remove_dir_all(directory).unwrap();
    }
}

fn find_ffmpeg_in_dlc(app: &AppHandle) -> Option<PathBuf> {
    dlc_search_roots(app)
        .into_iter()
        .map(|root| root.join("ffmpeg").join("ffmpeg.exe"))
        .find(|candidate| candidate.is_file())
}

fn find_simulated_input_dlc(app: &AppHandle) -> Option<PathBuf> {
    dlc_search_roots(app)
        .into_iter()
        .map(|root| root.join("simulated-input").join("simulated-input-dlc.exe"))
        .find(|candidate| candidate.is_file())
}

fn find_ffmpeg(app: &AppHandle) -> Option<PathBuf> {
    if let Some(ffmpeg) = find_ffmpeg_in_dlc(app) {
        return Some(ffmpeg);
    }
    if let Ok(dir) = app.path().resource_dir() {
        let bundled = dir.join("ffmpeg.exe");
        if bundled.is_file() {
            return Some(bundled);
        }
    }
    if let Ok(executable) = std::env::current_exe() {
        if let Some(directory) = executable.parent() {
            for bundled in [
                directory.join("ffmpeg.exe"),
                directory.join("resources").join("ffmpeg.exe"),
                directory.join(DLC_DIRECTORY_NAME).join("ffmpeg.exe"),
            ] {
                if bundled.is_file() {
                    return Some(bundled);
                }
            }
        }
    }
    let local = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("ffmpeg.exe");
    if local.is_file() {
        return Some(local);
    }
    Command::new("ffmpeg")
        .arg("-version")
        .status()
        .ok()
        .filter(|status| status.success())
        .map(|_| PathBuf::from("ffmpeg"))
}

fn emit_input(event_type: &str, code: String, capture_mode: u8) {
    if !GLOBAL_INPUT_ENABLED.load(Ordering::Relaxed)
        || GLOBAL_INPUT_MODE.load(Ordering::Relaxed) != capture_mode
    {
        return;
    }
    let shift_key = if event_type == "wheel" {
        let pressed_codes = INPUT_PRESSED_CODES.lock();
        pressed_codes.contains("ShiftLeft") || pressed_codes.contains("ShiftRight")
    } else {
        let mut pressed_codes = INPUT_PRESSED_CODES.lock();
        let Some(shift_key) = update_pressed_input_state(&mut pressed_codes, event_type, &code)
        else {
            return;
        };
        shift_key
    };

    *INPUT_EVENT_COUNT.lock() += 1;
    let event = DesktopInputEvent {
        source: "desktop",
        event_type: event_type.to_string(),
        capture_mode: global_input_mode_name(capture_mode),
        code,
        time: current_time_ms(),
        shift_key,
    };

    if let Some(app) = APP_HANDLE.lock().as_ref() {
        let _ = app.emit("global-input", event);
    }
}

fn update_pressed_input_state(
    pressed_codes: &mut HashSet<String>,
    event_type: &str,
    code: &str,
) -> Option<bool> {
    let is_pressed =
        event_type == "keydown" || event_type == "mousedown" || event_type == "gamepadbuttondown";
    let is_released =
        event_type == "keyup" || event_type == "mouseup" || event_type == "gamepadbuttonup";
    if !is_pressed && !is_released {
        return None;
    }
    if is_pressed {
        if !pressed_codes.insert(code.to_string()) {
            return None;
        }
    } else if !pressed_codes.remove(code) {
        return None;
    }
    Some(pressed_codes.contains("ShiftLeft") || pressed_codes.contains("ShiftRight"))
}

#[cfg(test)]
mod input_state_tests {
    use super::{
        global_input_mode_name, parse_global_input_mode, update_pressed_input_state,
        GLOBAL_INPUT_MODE_KEYBOARD, GLOBAL_INPUT_MODE_PLAYSTATION, GLOBAL_INPUT_MODE_XBOX,
    };
    use std::collections::HashSet;

    #[test]
    fn carries_shift_state_through_the_following_key_event() {
        let mut pressed = HashSet::new();
        assert_eq!(
            update_pressed_input_state(&mut pressed, "keydown", "ShiftLeft"),
            Some(true)
        );
        assert_eq!(
            update_pressed_input_state(&mut pressed, "keydown", "KeyE"),
            Some(true)
        );
        assert_eq!(
            update_pressed_input_state(&mut pressed, "keyup", "KeyE"),
            Some(true)
        );
        assert_eq!(
            update_pressed_input_state(&mut pressed, "keyup", "ShiftLeft"),
            Some(false)
        );
        assert_eq!(
            update_pressed_input_state(&mut pressed, "keydown", "KeyE"),
            Some(false)
        );
    }

    #[test]
    fn supports_right_shift_and_ignores_duplicate_transitions() {
        let mut pressed = HashSet::new();
        assert_eq!(
            update_pressed_input_state(&mut pressed, "keydown", "ShiftRight"),
            Some(true)
        );
        assert_eq!(
            update_pressed_input_state(&mut pressed, "keydown", "ShiftRight"),
            None
        );
        assert_eq!(
            update_pressed_input_state(&mut pressed, "keyup", "ShiftRight"),
            Some(false)
        );
        assert_eq!(
            update_pressed_input_state(&mut pressed, "keyup", "ShiftRight"),
            None
        );
    }

    #[test]
    fn parses_the_three_mutually_exclusive_capture_modes() {
        assert_eq!(
            parse_global_input_mode("keyboard"),
            Some(GLOBAL_INPUT_MODE_KEYBOARD)
        );
        assert_eq!(
            parse_global_input_mode("xbox"),
            Some(GLOBAL_INPUT_MODE_XBOX)
        );
        assert_eq!(
            parse_global_input_mode("PlayStation"),
            Some(GLOBAL_INPUT_MODE_PLAYSTATION)
        );
        assert_eq!(parse_global_input_mode("unknown"), None);
        assert_eq!(
            global_input_mode_name(GLOBAL_INPUT_MODE_PLAYSTATION),
            "playstation"
        );
    }
}

fn current_time_ms() -> f64 {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    now.as_secs_f64() * 1000.0
}

#[cfg(windows)]
mod winhook {
    use super::{
        emit_input, GLOBAL_INPUT_ENABLED, GLOBAL_INPUT_MODE, GLOBAL_INPUT_MODE_KEYBOARD,
        GLOBAL_INPUT_MODE_PLAYSTATION, GLOBAL_INPUT_MODE_XBOX, INPUT_HOOK_STARTED,
        INPUT_HOOK_STATUS,
    };
    use hidapi::{HidApi, HidDevice};
    use std::collections::HashSet;
    use std::ffi::c_void;
    use std::io;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::OnceLock;
    use std::time::{Duration, Instant};
    use windows::Gaming::Input::{
        GameControllerButtonLabel, GameControllerSwitchPosition, Gamepad, GamepadButtons,
        GamepadReading, RawGameController,
    };
    use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};

    static KEYBOARD_MOUSE_HOOKS_ACTIVE: AtomicBool = AtomicBool::new(false);

    type Hhook = isize;
    type Hinstance = isize;
    type Hwnd = isize;
    type Wparam = usize;
    type Lparam = isize;
    type Lresult = isize;
    type Hmodule = isize;
    type HookProc = unsafe extern "system" fn(i32, Wparam, Lparam) -> Lresult;
    type XInputGetStateFn = unsafe extern "system" fn(u32, *mut XInputState) -> u32;

    const WH_KEYBOARD_LL: i32 = 13;
    const WH_MOUSE_LL: i32 = 14;
    const HC_ACTION: i32 = 0;
    const WM_KEYDOWN: u32 = 0x0100;
    const WM_KEYUP: u32 = 0x0101;
    const WM_SYSKEYDOWN: u32 = 0x0104;
    const WM_SYSKEYUP: u32 = 0x0105;
    const WM_LBUTTONDOWN: u32 = 0x0201;
    const WM_LBUTTONUP: u32 = 0x0202;
    const WM_RBUTTONDOWN: u32 = 0x0204;
    const WM_RBUTTONUP: u32 = 0x0205;
    const WM_MBUTTONDOWN: u32 = 0x0207;
    const WM_MBUTTONUP: u32 = 0x0208;
    const WM_MOUSEWHEEL: u32 = 0x020A;
    const WM_XBUTTONDOWN: u32 = 0x020B;
    const WM_XBUTTONUP: u32 = 0x020C;
    const ERROR_SUCCESS: u32 = 0;
    const XINPUT_GAMEPAD_DPAD_UP: u16 = 0x0001;
    const XINPUT_GAMEPAD_DPAD_DOWN: u16 = 0x0002;
    const XINPUT_GAMEPAD_DPAD_LEFT: u16 = 0x0004;
    const XINPUT_GAMEPAD_DPAD_RIGHT: u16 = 0x0008;
    const XINPUT_GAMEPAD_START: u16 = 0x0010;
    const XINPUT_GAMEPAD_BACK: u16 = 0x0020;
    const XINPUT_GAMEPAD_LEFT_THUMB: u16 = 0x0040;
    const XINPUT_GAMEPAD_RIGHT_THUMB: u16 = 0x0080;
    const XINPUT_GAMEPAD_LEFT_SHOULDER: u16 = 0x0100;
    const XINPUT_GAMEPAD_RIGHT_SHOULDER: u16 = 0x0200;
    const XINPUT_GAMEPAD_A: u16 = 0x1000;
    const XINPUT_GAMEPAD_B: u16 = 0x2000;
    const XINPUT_GAMEPAD_X: u16 = 0x4000;
    const XINPUT_GAMEPAD_Y: u16 = 0x8000;
    const XINPUT_TRIGGER_THRESHOLD: u8 = 128;
    const PLAYSTATION_TRIGGER_THRESHOLD: f64 = 0.5;
    const SONY_VENDOR_ID: u16 = 0x054c;
    const MICROSOFT_VENDOR_ID: u16 = 0x045e;
    const NINTENDO_VENDOR_ID: u16 = 0x057e;
    const VALVE_VENDOR_ID: u16 = 0x28de;
    const GAMEPAD_COMBO_MODIFIER: &str = "GamepadLB";
    const GAMEPAD_CODE_ORDER: [&str; 16] = [
        "GamepadA",
        "GamepadB",
        "GamepadX",
        "GamepadY",
        "GamepadLB",
        "GamepadRB",
        "GamepadLT",
        "GamepadRT",
        "GamepadView",
        "GamepadMenu",
        "GamepadLeftStick",
        "GamepadRightStick",
        "GamepadDPadUp",
        "GamepadDPadDown",
        "GamepadDPadLeft",
        "GamepadDPadRight",
    ];

    #[repr(C)]
    struct KbdLlHookStruct {
        vk_code: u32,
        scan_code: u32,
        flags: u32,
        time: u32,
        dw_extra_info: usize,
    }

    #[repr(C)]
    struct MsllHookStruct {
        pt: Point,
        mouse_data: u32,
        flags: u32,
        time: u32,
        dw_extra_info: usize,
    }

    #[repr(C)]
    #[derive(Default, Copy, Clone)]
    struct XInputGamepad {
        buttons: u16,
        left_trigger: u8,
        right_trigger: u8,
        left_thumb_x: i16,
        left_thumb_y: i16,
        right_thumb_x: i16,
        right_thumb_y: i16,
    }

    #[repr(C)]
    #[derive(Default, Copy, Clone)]
    struct XInputState {
        packet_number: u32,
        gamepad: XInputGamepad,
    }

    struct PlaystationGamepadController {
        raw: RawGameController,
        gamepad: Option<Gamepad>,
    }

    struct PlaystationHidController {
        device: HidDevice,
        product_id: u16,
        codes: HashSet<&'static str>,
    }

    struct PlaystationHidPoller {
        api: HidApi,
        controllers: Vec<PlaystationHidController>,
        next_refresh: Instant,
    }

    impl PlaystationHidPoller {
        fn new() -> Result<Self, String> {
            let api = HidApi::new().map_err(|error| error.to_string())?;
            let mut poller = Self {
                api,
                controllers: Vec::new(),
                next_refresh: Instant::now(),
            };
            poller.refresh_devices();
            Ok(poller)
        }

        fn refresh_devices(&mut self) {
            let paths = self
                .api
                .device_list()
                .filter(|info| info.vendor_id() == SONY_VENDOR_ID)
                .filter(|info| {
                    matches!(
                        info.product_id(),
                        0x0ce6 | 0x0df2 | 0x0df3 | 0x0ba0 | 0x05c4 | 0x09cc
                    )
                })
                .map(|info| (info.path().to_owned(), info.product_id()))
                .collect::<Vec<_>>();
            self.controllers = paths
                .into_iter()
                .filter_map(|(path, product_id)| {
                    self.api
                        .open_path(&path)
                        .ok()
                        .map(|device| PlaystationHidController {
                            device,
                            product_id,
                            codes: HashSet::new(),
                        })
                })
                .collect();
            self.next_refresh = Instant::now() + Duration::from_secs(2);
        }

        fn has_controller(&self) -> bool {
            !self.controllers.is_empty()
        }

        fn read_codes(&mut self) -> HashSet<&'static str> {
            if Instant::now() >= self.next_refresh {
                self.refresh_devices();
            }
            let mut codes = HashSet::new();
            for controller in &mut self.controllers {
                let mut report = [0u8; 128];
                for _ in 0..8 {
                    match controller.device.read_timeout(&mut report, 0) {
                        Ok(0) => break,
                        Ok(length) => {
                            controller.codes = playstation_hid_report_codes(
                                controller.product_id,
                                &report[..length],
                            );
                        }
                        Err(_) => break,
                    }
                }
                codes.extend(controller.codes.iter().copied());
            }
            codes
        }
    }

    struct PlaystationGamepadPoller {
        controllers: Vec<PlaystationGamepadController>,
        hid: Option<PlaystationHidPoller>,
        wgi_available: bool,
        next_refresh: Instant,
    }

    impl PlaystationGamepadPoller {
        fn new() -> Result<Self, String> {
            static WINDOWS_GAMING_INPUT_INITIALIZED: OnceLock<Result<(), String>> = OnceLock::new();
            let wgi_available = WINDOWS_GAMING_INPUT_INITIALIZED
                .get_or_init(|| {
                    unsafe { RoInitialize(RO_INIT_MULTITHREADED) }
                        .map_err(|error| error.to_string())
                })
                .is_ok();
            let mut poller = Self {
                controllers: Vec::new(),
                hid: PlaystationHidPoller::new().ok(),
                wgi_available,
                next_refresh: Instant::now(),
            };
            poller.refresh_devices();
            Ok(poller)
        }

        fn refresh_devices(&mut self) {
            self.controllers = if self.wgi_available {
                RawGameController::RawGameControllers()
                    .ok()
                    .into_iter()
                    .flat_map(|controllers| controllers.into_iter())
                    .filter(is_playstation_controller)
                    .map(|raw| PlaystationGamepadController {
                        gamepad: Gamepad::FromGameController(&raw).ok(),
                        raw,
                    })
                    .collect()
            } else {
                Vec::new()
            };
            if let Some(hid) = self.hid.as_mut() {
                hid.refresh_devices();
            }
            self.next_refresh = Instant::now() + Duration::from_secs(2);
        }

        fn has_controller(&self) -> bool {
            !self.controllers.is_empty()
                || self
                    .hid
                    .as_ref()
                    .is_some_and(PlaystationHidPoller::has_controller)
        }

        fn read_codes(&mut self) -> HashSet<&'static str> {
            if Instant::now() >= self.next_refresh {
                self.refresh_devices();
            }
            let mut codes = HashSet::new();
            for controller in &self.controllers {
                if let Some(gamepad) = &controller.gamepad {
                    if let Ok(reading) = gamepad.GetCurrentReading() {
                        codes.extend(playstation_gamepad_codes(&reading));
                        continue;
                    }
                }
                codes.extend(playstation_raw_controller_codes(&controller.raw));
            }
            if let Some(hid) = self.hid.as_mut() {
                codes.extend(hid.read_codes());
            }
            codes
        }
    }

    // Some DualShock/DualSense drivers expose the controller as a RawGameController
    // without Sony's VID, while others expose it only through XInput. Use labels to
    // recognize the former and leave the latter to the XInput fallback below.
    fn is_playstation_controller(controller: &RawGameController) -> bool {
        let vendor = controller.HardwareVendorId().ok();
        if vendor == Some(SONY_VENDOR_ID) {
            return true;
        }
        if matches!(
            vendor,
            Some(MICROSOFT_VENDOR_ID) | Some(NINTENDO_VENDOR_ID) | Some(VALVE_VENDOR_ID)
        ) {
            return false;
        }
        let button_count = controller.ButtonCount().unwrap_or(0).max(0);
        (0..button_count).any(|index| {
            matches!(
                controller.GetButtonLabel(index),
                Ok(GameControllerButtonLabel::Cross
                    | GameControllerButtonLabel::Circle
                    | GameControllerButtonLabel::Square
                    | GameControllerButtonLabel::Triangle
                    | GameControllerButtonLabel::Share
                    | GameControllerButtonLabel::Options)
            )
        })
    }

    #[repr(C)]
    #[derive(Default, Copy, Clone)]
    struct Point {
        x: i32,
        y: i32,
    }

    #[repr(C)]
    #[derive(Default, Copy, Clone)]
    struct Msg {
        hwnd: Hwnd,
        message: u32,
        w_param: Wparam,
        l_param: Lparam,
        time: u32,
        pt: Point,
    }

    #[link(name = "user32")]
    extern "system" {
        fn SetWindowsHookExW(
            id_hook: i32,
            lpfn: Option<HookProc>,
            hmod: Hinstance,
            thread_id: u32,
        ) -> Hhook;
        fn CallNextHookEx(hhk: Hhook, n_code: i32, w_param: Wparam, l_param: Lparam) -> Lresult;
        fn GetMessageW(
            lp_msg: *mut Msg,
            hwnd: Hwnd,
            msg_filter_min: u32,
            msg_filter_max: u32,
        ) -> i32;
        fn TranslateMessage(lp_msg: *const Msg) -> i32;
        fn DispatchMessageW(lp_msg: *const Msg) -> Lresult;
        fn GetAsyncKeyState(v_key: i32) -> i16;
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn LoadLibraryW(file_name: *const u16) -> Hmodule;
        fn GetProcAddress(module: Hmodule, procedure_name: *const u8) -> *const c_void;
    }

    pub fn start() -> Result<(), String> {
        start_polling_fallback()?;

        if let Err(error) = std::thread::Builder::new()
            .name(String::from("windows-global-input-hook"))
            .spawn(|| unsafe {
                let keyboard_hook = SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_proc), 0, 0);
                let keyboard_error = io::Error::last_os_error();
                let mouse_hook = SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_proc), 0, 0);
                let mouse_error = io::Error::last_os_error();

                if keyboard_hook == 0 || mouse_hook == 0 {
                    *INPUT_HOOK_STATUS.lock() = format!(
                        "windows hooks unavailable; polling fallback active: keyboard={:?}, mouse={:?}",
                        keyboard_error, mouse_error
                    );
                    INPUT_HOOK_STARTED.store(true, Ordering::SeqCst);
                    return;
                }

                KEYBOARD_MOUSE_HOOKS_ACTIVE.store(true, Ordering::SeqCst);
                *INPUT_HOOK_STATUS.lock() = String::from("windows input capture ready");

                let mut msg = Msg::default();
                while GetMessageW(&mut msg, 0, 0, 0) > 0 {
                    let _ = TranslateMessage(&msg);
                    let _ = DispatchMessageW(&msg);
                }
                KEYBOARD_MOUSE_HOOKS_ACTIVE.store(false, Ordering::SeqCst);
            })
        {
            *INPUT_HOOK_STATUS.lock() = format!("polling fallback active; hook thread unavailable: {error}");
            INPUT_HOOK_STARTED.store(true, Ordering::SeqCst);
        }

        Ok(())
    }

    fn start_polling_fallback() -> Result<(), String> {
        std::thread::Builder::new()
            .name(String::from("windows-global-input-poll"))
            .spawn(|| unsafe {
                let keys = polled_keys();
                let mut previous = vec![false; keys.len()];
                let mut previous_gamepad = HashSet::new();
                let mut playstation_gamepad: Option<PlaystationGamepadPoller> = None;
                let mut playstation_retry_at = Instant::now();
                let mut previous_mode = u8::MAX;
                loop {
                    if !GLOBAL_INPUT_ENABLED.load(Ordering::Relaxed) {
                        previous.fill(false);
                        previous_gamepad.clear();
                        playstation_gamepad = None;
                        previous_mode = u8::MAX;
                        std::thread::sleep(Duration::from_millis(50));
                        continue;
                    }

                    let mode = GLOBAL_INPUT_MODE.load(Ordering::Relaxed);
                    if mode != previous_mode {
                        previous.fill(false);
                        previous_gamepad.clear();
                        if mode != GLOBAL_INPUT_MODE_PLAYSTATION {
                            playstation_gamepad = None;
                        }
                        previous_mode = mode;
                    }

                    if mode == GLOBAL_INPUT_MODE_KEYBOARD
                        && !KEYBOARD_MOUSE_HOOKS_ACTIVE.load(Ordering::Relaxed)
                    {
                        for (index, (vk, code)) in keys.iter().enumerate() {
                            let pressed = (GetAsyncKeyState(*vk) as u16 & 0x8000) != 0;
                            if pressed != previous[index] {
                                previous[index] = pressed;
                                let is_mouse = code.starts_with("Mouse");
                                let event_type = match (is_mouse, pressed) {
                                    (true, true) => "mousedown",
                                    (true, false) => "mouseup",
                                    (false, true) => "keydown",
                                    (false, false) => "keyup",
                                };
                                emit_input(event_type, String::from(*code), mode);
                            }
                        }
                    } else {
                        let current_gamepad = if mode == GLOBAL_INPUT_MODE_XBOX {
                            read_xinput_codes()
                        } else if mode == GLOBAL_INPUT_MODE_PLAYSTATION {
                            if playstation_gamepad.is_none()
                                && Instant::now() >= playstation_retry_at
                            {
                                playstation_gamepad = PlaystationGamepadPoller::new().ok();
                                playstation_retry_at = Instant::now() + Duration::from_secs(2);
                            }
                            playstation_gamepad
                                .as_mut()
                                .map(PlaystationGamepadPoller::read_codes)
                                .unwrap_or_default()
                                .into_iter()
                                .collect()
                        } else {
                            HashSet::new()
                        };
                        let current_gamepad = if mode == GLOBAL_INPUT_MODE_PLAYSTATION
                            && !playstation_gamepad
                                .as_ref()
                                .is_some_and(PlaystationGamepadPoller::has_controller)
                        {
                            // DS4Windows, Steam Input, and similar drivers expose a PS
                            // controller through XInput. Only use this fallback when no
                            // native PS-labelled controller was found, so the selected
                            // controller mode remains exclusive in normal cases.
                            read_xinput_codes()
                        } else {
                            current_gamepad
                        };
                        for (event_type, code) in
                            gamepad_transitions(&previous_gamepad, &current_gamepad)
                        {
                            emit_input(event_type, code, mode);
                        }
                        previous_gamepad = current_gamepad;
                    }
                    std::thread::sleep(Duration::from_millis(4));
                }
            })
            .map_err(|error| error.to_string())?;
        Ok(())
    }

    unsafe fn read_xinput_codes() -> HashSet<&'static str> {
        let mut codes = HashSet::new();
        let Some(get_state) = xinput_get_state() else {
            return codes;
        };
        for user_index in 0..4 {
            let mut state = XInputState::default();
            if get_state(user_index, &mut state) == ERROR_SUCCESS {
                codes.extend(xinput_gamepad_codes(&state.gamepad));
            }
        }
        codes
    }

    fn xinput_get_state() -> Option<XInputGetStateFn> {
        static GET_STATE: OnceLock<Option<XInputGetStateFn>> = OnceLock::new();
        *GET_STATE.get_or_init(|| unsafe {
            for library_name in ["xinput1_4.dll", "xinput1_3.dll", "xinput9_1_0.dll"] {
                let wide_name = library_name
                    .encode_utf16()
                    .chain(std::iter::once(0))
                    .collect::<Vec<_>>();
                let module = LoadLibraryW(wide_name.as_ptr());
                if module == 0 {
                    continue;
                }
                let address = GetProcAddress(module, b"XInputGetState\0".as_ptr());
                if !address.is_null() {
                    return Some(std::mem::transmute::<*const c_void, XInputGetStateFn>(
                        address,
                    ));
                }
            }
            None
        })
    }

    fn xinput_gamepad_codes(gamepad: &XInputGamepad) -> HashSet<&'static str> {
        let mut codes = HashSet::new();
        let button_codes = [
            (XINPUT_GAMEPAD_A, "GamepadA"),
            (XINPUT_GAMEPAD_B, "GamepadB"),
            (XINPUT_GAMEPAD_X, "GamepadX"),
            (XINPUT_GAMEPAD_Y, "GamepadY"),
            (XINPUT_GAMEPAD_LEFT_SHOULDER, "GamepadLB"),
            (XINPUT_GAMEPAD_RIGHT_SHOULDER, "GamepadRB"),
            (XINPUT_GAMEPAD_BACK, "GamepadView"),
            (XINPUT_GAMEPAD_START, "GamepadMenu"),
            (XINPUT_GAMEPAD_LEFT_THUMB, "GamepadLeftStick"),
            (XINPUT_GAMEPAD_RIGHT_THUMB, "GamepadRightStick"),
            (XINPUT_GAMEPAD_DPAD_UP, "GamepadDPadUp"),
            (XINPUT_GAMEPAD_DPAD_DOWN, "GamepadDPadDown"),
            (XINPUT_GAMEPAD_DPAD_LEFT, "GamepadDPadLeft"),
            (XINPUT_GAMEPAD_DPAD_RIGHT, "GamepadDPadRight"),
        ];
        for (mask, code) in button_codes {
            if gamepad.buttons & mask != 0 {
                codes.insert(code);
            }
        }
        if gamepad.left_trigger >= XINPUT_TRIGGER_THRESHOLD {
            codes.insert("GamepadLT");
        }
        if gamepad.right_trigger >= XINPUT_TRIGGER_THRESHOLD {
            codes.insert("GamepadRT");
        }
        codes
    }

    fn playstation_gamepad_codes(reading: &GamepadReading) -> HashSet<&'static str> {
        let mut codes = HashSet::new();
        let buttons = reading.Buttons;
        if buttons.contains(GamepadButtons::A) {
            codes.insert("GamepadA");
        }
        if buttons.contains(GamepadButtons::B) {
            codes.insert("GamepadB");
        }
        if buttons.contains(GamepadButtons::X) {
            codes.insert("GamepadX");
        }
        if buttons.contains(GamepadButtons::Y) {
            codes.insert("GamepadY");
        }
        if buttons.contains(GamepadButtons::LeftShoulder) {
            codes.insert("GamepadLB");
        }
        if buttons.contains(GamepadButtons::RightShoulder) {
            codes.insert("GamepadRB");
        }
        if reading.LeftTrigger >= PLAYSTATION_TRIGGER_THRESHOLD {
            codes.insert("GamepadLT");
        }
        if reading.RightTrigger >= PLAYSTATION_TRIGGER_THRESHOLD {
            codes.insert("GamepadRT");
        }
        if buttons.contains(GamepadButtons::View) {
            codes.insert("GamepadView");
        }
        if buttons.contains(GamepadButtons::Menu) {
            codes.insert("GamepadMenu");
        }
        if buttons.contains(GamepadButtons::LeftThumbstick) {
            codes.insert("GamepadLeftStick");
        }
        if buttons.contains(GamepadButtons::RightThumbstick) {
            codes.insert("GamepadRightStick");
        }
        if buttons.contains(GamepadButtons::DPadUp) {
            codes.insert("GamepadDPadUp");
        }
        if buttons.contains(GamepadButtons::DPadDown) {
            codes.insert("GamepadDPadDown");
        }
        if buttons.contains(GamepadButtons::DPadLeft) {
            codes.insert("GamepadDPadLeft");
        }
        if buttons.contains(GamepadButtons::DPadRight) {
            codes.insert("GamepadDPadRight");
        }
        codes
    }

    fn playstation_hid_report_codes(product_id: u16, report: &[u8]) -> HashSet<&'static str> {
        let mut codes = HashSet::new();
        if report.len() < 10 {
            return codes;
        }

        let dualsense = matches!(product_id, 0x0ce6 | 0x0df2 | 0x0df3);
        let offsets = if dualsense {
            match report[0] {
                // DualSense Bluetooth enhanced report: report id + sequence tag
                // precede the common state payload.
                0x31 => Some((9_usize, 6_usize)),
                // Bluetooth compatibility mode uses the compact DS4-shaped
                // state packet, while USB report 0x01 carries the full state.
                0x01 if report.len() <= 10 => Some((5, 8)),
                0x01 => Some((8, 5)),
                _ => None,
            }
        } else {
            match report[0] {
                // DualShock 4 Bluetooth adds two reserved bytes after id 0x11.
                0x11 => Some((7_usize, 10_usize)),
                // USB and the short Bluetooth compatibility report both put
                // the common state directly after report id 0x01.
                0x01 => Some((5, 8)),
                _ => None,
            }
        };
        let Some((button_offset, trigger_offset)) = offsets else {
            return codes;
        };
        if report.len() <= button_offset + 2 || report.len() <= trigger_offset + 1 {
            return codes;
        }

        match report[button_offset] & 0x0f {
            0 => {
                codes.insert("GamepadDPadUp");
            }
            1 => {
                codes.insert("GamepadDPadUp");
                codes.insert("GamepadDPadRight");
            }
            2 => {
                codes.insert("GamepadDPadRight");
            }
            3 => {
                codes.insert("GamepadDPadDown");
                codes.insert("GamepadDPadRight");
            }
            4 => {
                codes.insert("GamepadDPadDown");
            }
            5 => {
                codes.insert("GamepadDPadDown");
                codes.insert("GamepadDPadLeft");
            }
            6 => {
                codes.insert("GamepadDPadLeft");
            }
            7 => {
                codes.insert("GamepadDPadUp");
                codes.insert("GamepadDPadLeft");
            }
            _ => {}
        }

        let face = report[button_offset] & 0xf0;
        if face & 0x20 != 0 {
            codes.insert("GamepadA");
        }
        if face & 0x40 != 0 {
            codes.insert("GamepadB");
        }
        if face & 0x10 != 0 {
            codes.insert("GamepadX");
        }
        if face & 0x80 != 0 {
            codes.insert("GamepadY");
        }

        let shoulders = report[button_offset + 1];
        if shoulders & 0x01 != 0 {
            codes.insert("GamepadLB");
        }
        if shoulders & 0x02 != 0 {
            codes.insert("GamepadRB");
        }
        if shoulders & 0x04 != 0 {
            codes.insert("GamepadLT");
        }
        if shoulders & 0x08 != 0 {
            codes.insert("GamepadRT");
        }
        if shoulders & 0x10 != 0 {
            codes.insert("GamepadView");
        }
        if shoulders & 0x20 != 0 {
            codes.insert("GamepadMenu");
        }
        if shoulders & 0x40 != 0 {
            codes.insert("GamepadLeftStick");
        }
        if shoulders & 0x80 != 0 {
            codes.insert("GamepadRightStick");
        }

        if trigger_offset + 1 < report.len() {
            if report[trigger_offset] >= 128 {
                codes.insert("GamepadLT");
            }
            if report[trigger_offset + 1] >= 128 {
                codes.insert("GamepadRT");
            }
        }
        codes
    }

    fn playstation_raw_controller_codes(controller: &RawGameController) -> HashSet<&'static str> {
        let button_count = controller.ButtonCount().unwrap_or(0).max(0) as usize;
        let switch_count = controller.SwitchCount().unwrap_or(0).max(0) as usize;
        let axis_count = controller.AxisCount().unwrap_or(0).max(0) as usize;
        let mut buttons = vec![false; button_count];
        let mut switches = vec![GameControllerSwitchPosition::Center; switch_count];
        let mut axes = vec![0.0; axis_count];
        if controller
            .GetCurrentReading(&mut buttons, &mut switches, &mut axes)
            .is_err()
        {
            return HashSet::new();
        }
        let mut codes = HashSet::new();
        for (index, pressed) in buttons.into_iter().enumerate() {
            if !pressed {
                continue;
            }
            let Ok(label) = controller.GetButtonLabel(index as i32) else {
                continue;
            };
            if let Some(code) = playstation_button_label_code(label) {
                codes.insert(code);
            }
        }
        for position in switches {
            add_switch_position_codes(&mut codes, position);
        }
        codes
    }

    fn playstation_button_label_code(label: GameControllerButtonLabel) -> Option<&'static str> {
        match label {
            GameControllerButtonLabel::Cross | GameControllerButtonLabel::LetterA => {
                Some("GamepadA")
            }
            GameControllerButtonLabel::Circle | GameControllerButtonLabel::LetterB => {
                Some("GamepadB")
            }
            GameControllerButtonLabel::Square | GameControllerButtonLabel::LetterX => {
                Some("GamepadX")
            }
            GameControllerButtonLabel::Triangle | GameControllerButtonLabel::LetterY => {
                Some("GamepadY")
            }
            GameControllerButtonLabel::LeftBumper | GameControllerButtonLabel::Left1 => {
                Some("GamepadLB")
            }
            GameControllerButtonLabel::RightBumper | GameControllerButtonLabel::Right1 => {
                Some("GamepadRB")
            }
            GameControllerButtonLabel::LeftTrigger | GameControllerButtonLabel::Left2 => {
                Some("GamepadLT")
            }
            GameControllerButtonLabel::RightTrigger | GameControllerButtonLabel::Right2 => {
                Some("GamepadRT")
            }
            GameControllerButtonLabel::Share
            | GameControllerButtonLabel::View
            | GameControllerButtonLabel::Back
            | GameControllerButtonLabel::Select => Some("GamepadView"),
            GameControllerButtonLabel::Options
            | GameControllerButtonLabel::Menu
            | GameControllerButtonLabel::Start => Some("GamepadMenu"),
            GameControllerButtonLabel::LeftStickButton => Some("GamepadLeftStick"),
            GameControllerButtonLabel::RightStickButton => Some("GamepadRightStick"),
            GameControllerButtonLabel::Up => Some("GamepadDPadUp"),
            GameControllerButtonLabel::Down => Some("GamepadDPadDown"),
            GameControllerButtonLabel::Left => Some("GamepadDPadLeft"),
            GameControllerButtonLabel::Right => Some("GamepadDPadRight"),
            _ => None,
        }
    }

    fn add_switch_position_codes(
        codes: &mut HashSet<&'static str>,
        position: GameControllerSwitchPosition,
    ) {
        if matches!(
            position,
            GameControllerSwitchPosition::Up
                | GameControllerSwitchPosition::UpLeft
                | GameControllerSwitchPosition::UpRight
        ) {
            codes.insert("GamepadDPadUp");
        }
        if matches!(
            position,
            GameControllerSwitchPosition::Down
                | GameControllerSwitchPosition::DownLeft
                | GameControllerSwitchPosition::DownRight
        ) {
            codes.insert("GamepadDPadDown");
        }
        if matches!(
            position,
            GameControllerSwitchPosition::Left
                | GameControllerSwitchPosition::UpLeft
                | GameControllerSwitchPosition::DownLeft
        ) {
            codes.insert("GamepadDPadLeft");
        }
        if matches!(
            position,
            GameControllerSwitchPosition::Right
                | GameControllerSwitchPosition::UpRight
                | GameControllerSwitchPosition::DownRight
        ) {
            codes.insert("GamepadDPadRight");
        }
    }

    fn gamepad_transitions(
        previous: &HashSet<&'static str>,
        current: &HashSet<&'static str>,
    ) -> Vec<(&'static str, String)> {
        let mut events = Vec::new();

        if previous.contains(GAMEPAD_COMBO_MODIFIER) && !current.contains(GAMEPAD_COMBO_MODIFIER) {
            for code in GAMEPAD_CODE_ORDER {
                if code != GAMEPAD_COMBO_MODIFIER
                    && previous.contains(code)
                    && current.contains(code)
                {
                    events.push((
                        "gamepadbuttonup",
                        format!("{GAMEPAD_COMBO_MODIFIER}+{code}"),
                    ));
                }
            }
        }

        for code in GAMEPAD_CODE_ORDER {
            if previous.contains(code) && !current.contains(code) {
                let emitted_code = if code != GAMEPAD_COMBO_MODIFIER
                    && previous.contains(GAMEPAD_COMBO_MODIFIER)
                {
                    format!("{GAMEPAD_COMBO_MODIFIER}+{code}")
                } else {
                    String::from(code)
                };
                events.push(("gamepadbuttonup", emitted_code));
            }
        }

        for code in GAMEPAD_CODE_ORDER {
            if current.contains(code) && !previous.contains(code) {
                let emitted_code =
                    if code != GAMEPAD_COMBO_MODIFIER && current.contains(GAMEPAD_COMBO_MODIFIER) {
                        format!("{GAMEPAD_COMBO_MODIFIER}+{code}")
                    } else {
                        String::from(code)
                    };
                events.push(("gamepadbuttondown", emitted_code));
            }
        }

        events
    }

    fn polled_keys() -> Vec<(i32, &'static str)> {
        let mut keys = vec![
            (0x01, "MouseLeft"),
            (0x02, "MouseRight"),
            (0x04, "MouseMiddle"),
            (0x05, "Mouse3"),
            (0x06, "Mouse4"),
            (0x08, "Backspace"),
            (0x09, "Tab"),
            (0x0D, "Enter"),
            (0x14, "CapsLock"),
            (0x1B, "Escape"),
            (0x20, "Space"),
            (0x25, "ArrowLeft"),
            (0x26, "ArrowUp"),
            (0x27, "ArrowRight"),
            (0x28, "ArrowDown"),
            (0x2E, "Delete"),
            (0xA0, "ShiftLeft"),
            (0xA1, "ShiftRight"),
            (0xA2, "ControlLeft"),
            (0xA3, "ControlRight"),
            (0xA4, "AltLeft"),
            (0xA5, "AltRight"),
        ];
        for vk in 0x30..=0x39 {
            keys.push((
                vk,
                Box::leak(format!("Digit{}", vk - 0x30).into_boxed_str()),
            ));
        }
        for vk in 0x41..=0x5A {
            keys.push((
                vk,
                Box::leak(
                    format!("Key{}", char::from_u32(vk as u32).unwrap_or('?')).into_boxed_str(),
                ),
            ));
        }
        for vk in 0x70..=0x7B {
            keys.push((vk, Box::leak(format!("F{}", vk - 0x6F).into_boxed_str())));
        }
        keys
    }

    fn xbutton_to_code(mouse_data: u32) -> Option<&'static str> {
        match (mouse_data >> 16) & 0xFFFF {
            1 => Some("Mouse3"),
            2 => Some("Mouse4"),
            _ => None,
        }
    }

    unsafe extern "system" fn keyboard_proc(code: i32, wparam: Wparam, lparam: Lparam) -> Lresult {
        if code == HC_ACTION
            && GLOBAL_INPUT_ENABLED.load(Ordering::Relaxed)
            && GLOBAL_INPUT_MODE.load(Ordering::Relaxed) == GLOBAL_INPUT_MODE_KEYBOARD
        {
            let data = &*(lparam as *const KbdLlHookStruct);
            let event_type = match wparam as u32 {
                WM_KEYDOWN | WM_SYSKEYDOWN => Some("keydown"),
                WM_KEYUP | WM_SYSKEYUP => Some("keyup"),
                _ => None,
            };

            if let Some(event_type) = event_type {
                emit_input(
                    event_type,
                    vk_to_code(data.vk_code),
                    GLOBAL_INPUT_MODE_KEYBOARD,
                );
            }
        }

        CallNextHookEx(0, code, wparam, lparam)
    }

    unsafe extern "system" fn mouse_proc(code: i32, wparam: Wparam, lparam: Lparam) -> Lresult {
        if code == HC_ACTION
            && GLOBAL_INPUT_ENABLED.load(Ordering::Relaxed)
            && GLOBAL_INPUT_MODE.load(Ordering::Relaxed) == GLOBAL_INPUT_MODE_KEYBOARD
        {
            let mapped = match wparam as u32 {
                WM_LBUTTONDOWN => Some(("mousedown", "MouseLeft")),
                WM_LBUTTONUP => Some(("mouseup", "MouseLeft")),
                WM_RBUTTONDOWN => Some(("mousedown", "MouseRight")),
                WM_RBUTTONUP => Some(("mouseup", "MouseRight")),
                WM_MBUTTONDOWN => Some(("mousedown", "MouseMiddle")),
                WM_MBUTTONUP => Some(("mouseup", "MouseMiddle")),
                WM_XBUTTONDOWN => xbutton_to_code((*(lparam as *const MsllHookStruct)).mouse_data)
                    .map(|code| ("mousedown", code)),
                WM_XBUTTONUP => xbutton_to_code((*(lparam as *const MsllHookStruct)).mouse_data)
                    .map(|code| ("mouseup", code)),
                WM_MOUSEWHEEL => wheel_to_code((*(lparam as *const MsllHookStruct)).mouse_data)
                    .map(|code| ("wheel", code)),
                _ => None,
            };

            if let Some((event_type, code)) = mapped {
                emit_input(event_type, String::from(code), GLOBAL_INPUT_MODE_KEYBOARD);
            }
        }

        CallNextHookEx(0, code, wparam, lparam)
    }

    fn wheel_to_code(mouse_data: u32) -> Option<&'static str> {
        let delta = ((mouse_data >> 16) & 0xFFFF) as i16;
        if delta > 0 {
            Some("MouseWheelUp")
        } else if delta < 0 {
            Some("MouseWheelDown")
        } else {
            None
        }
    }

    fn vk_to_code(vk: u32) -> String {
        match vk {
            0x08 => String::from("Backspace"),
            0x09 => String::from("Tab"),
            0x0D => String::from("Enter"),
            0x10 => String::from("ShiftLeft"),
            0x11 => String::from("ControlLeft"),
            0x12 => String::from("AltLeft"),
            0x14 => String::from("CapsLock"),
            0x1B => String::from("Escape"),
            0x20 => String::from("Space"),
            0x25 => String::from("ArrowLeft"),
            0x26 => String::from("ArrowUp"),
            0x27 => String::from("ArrowRight"),
            0x28 => String::from("ArrowDown"),
            0x2E => String::from("Delete"),
            0x30..=0x39 => format!("Digit{}", vk - 0x30),
            0x41..=0x5A => format!("Key{}", char::from_u32(vk).unwrap_or('?')),
            0x70..=0x7B => format!("F{}", vk - 0x6F),
            0xA0 => String::from("ShiftLeft"),
            0xA1 => String::from("ShiftRight"),
            0xA2 => String::from("ControlLeft"),
            0xA3 => String::from("ControlRight"),
            0xA4 => String::from("AltLeft"),
            0xA5 => String::from("AltRight"),
            other => format!("VK{}", other),
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn maps_xinput_buttons_and_triggers_to_existing_binding_codes() {
            let gamepad = XInputGamepad {
                buttons: XINPUT_GAMEPAD_A
                    | XINPUT_GAMEPAD_B
                    | XINPUT_GAMEPAD_Y
                    | XINPUT_GAMEPAD_LEFT_SHOULDER
                    | XINPUT_GAMEPAD_START
                    | XINPUT_GAMEPAD_DPAD_RIGHT,
                left_trigger: XINPUT_TRIGGER_THRESHOLD,
                right_trigger: XINPUT_TRIGGER_THRESHOLD - 1,
                ..XInputGamepad::default()
            };

            let codes = xinput_gamepad_codes(&gamepad);
            assert!(codes.contains("GamepadA"));
            assert!(codes.contains("GamepadB"));
            assert!(codes.contains("GamepadY"));
            assert!(codes.contains("GamepadLB"));
            assert!(codes.contains("GamepadMenu"));
            assert!(codes.contains("GamepadLT"));
            assert!(codes.contains("GamepadDPadRight"));
            assert!(!codes.contains("GamepadRT"));
        }

        #[test]
        fn maps_playstation_gamepad_buttons_triggers_and_dpad() {
            let reading = GamepadReading {
                Buttons: GamepadButtons::A
                    | GamepadButtons::B
                    | GamepadButtons::Y
                    | GamepadButtons::LeftShoulder
                    | GamepadButtons::RightShoulder
                    | GamepadButtons::Menu
                    | GamepadButtons::DPadUp
                    | GamepadButtons::DPadLeft,
                LeftTrigger: PLAYSTATION_TRIGGER_THRESHOLD,
                RightTrigger: PLAYSTATION_TRIGGER_THRESHOLD - 0.01,
                ..GamepadReading::default()
            };

            let codes = playstation_gamepad_codes(&reading);
            assert!(codes.contains("GamepadA"));
            assert!(codes.contains("GamepadB"));
            assert!(codes.contains("GamepadY"));
            assert!(codes.contains("GamepadLB"));
            assert!(codes.contains("GamepadRB"));
            assert!(codes.contains("GamepadMenu"));
            assert!(codes.contains("GamepadLT"));
            assert!(codes.contains("GamepadDPadUp"));
            assert!(codes.contains("GamepadDPadLeft"));
            assert!(!codes.contains("GamepadRT"));
        }

        #[test]
        fn maps_playstation_labels_and_diagonal_switches() {
            assert_eq!(
                playstation_button_label_code(GameControllerButtonLabel::Cross),
                Some("GamepadA")
            );
            assert_eq!(
                playstation_button_label_code(GameControllerButtonLabel::Options),
                Some("GamepadMenu")
            );
            let mut codes = HashSet::new();
            add_switch_position_codes(&mut codes, GameControllerSwitchPosition::DownRight);
            assert_eq!(
                codes,
                HashSet::from(["GamepadDPadDown", "GamepadDPadRight"])
            );
        }

        #[test]
        fn maps_dualsense_hid_usb_report_to_playstation_codes() {
            let mut report = [0u8; 64];
            report[0] = 0x01;
            report[8] = 0x21;
            report[9] = 0x13;
            report[10] = 0x01;
            report[5] = 200;
            report[6] = 10;
            let codes = playstation_hid_report_codes(0x0ce6, &report);
            assert!(codes.contains("GamepadA"));
            assert!(codes.contains("GamepadDPadUp"));
            assert!(codes.contains("GamepadDPadRight"));
            assert!(codes.contains("GamepadLB"));
            assert!(codes.contains("GamepadRB"));
            assert!(codes.contains("GamepadView"));
            assert!(codes.contains("GamepadLT"));
            assert!(!codes.contains("GamepadRT"));
        }

        #[test]
        fn maps_dualsense_hid_bluetooth_and_compact_reports() {
            let mut bluetooth = [0u8; 78];
            bluetooth[0] = 0x31;
            bluetooth[9] = 0x42;
            bluetooth[10] = 0x2a;
            bluetooth[11] = 0x01;
            bluetooth[6] = 0;
            bluetooth[7] = 180;
            let codes = playstation_hid_report_codes(0x0ce6, &bluetooth);
            assert!(codes.contains("GamepadB"));
            assert!(codes.contains("GamepadDPadRight"));
            assert!(codes.contains("GamepadRB"));
            assert!(codes.contains("GamepadMenu"));
            assert!(codes.contains("GamepadRT"));
            assert!(!codes.contains("GamepadLT"));

            let mut compact = [0u8; 10];
            compact[0] = 0x01;
            compact[5] = 0x18;
            compact[6] = 0x41;
            compact[7] = 0x02;
            compact[8] = 0;
            compact[9] = 200;
            let compact_codes = playstation_hid_report_codes(0x0ce6, &compact);
            assert!(compact_codes.contains("GamepadX"));
            assert!(compact_codes.contains("GamepadLeftStick"));
            assert!(compact_codes.contains("GamepadRT"));
        }

        #[test]
        fn maps_dualshock4_hid_usb_and_bluetooth_reports() {
            let mut usb = [0u8; 64];
            usb[0] = 0x01;
            usb[5] = 0x84;
            usb[6] = 0x32;
            usb[7] = 0x01;
            usb[8] = 190;
            let usb_codes = playstation_hid_report_codes(0x09cc, &usb);
            assert!(usb_codes.contains("GamepadY"));
            assert!(usb_codes.contains("GamepadDPadDown"));
            assert!(usb_codes.contains("GamepadRB"));
            assert!(usb_codes.contains("GamepadMenu"));
            assert!(usb_codes.contains("GamepadLT"));

            let mut bluetooth = [0u8; 78];
            bluetooth[0] = 0x11;
            bluetooth[7] = 0x26;
            bluetooth[8] = 0x11;
            bluetooth[9] = 0x02;
            bluetooth[10] = 0;
            bluetooth[11] = 210;
            let bluetooth_codes = playstation_hid_report_codes(0x05c4, &bluetooth);
            assert!(bluetooth_codes.contains("GamepadA"));
            assert!(bluetooth_codes.contains("GamepadDPadLeft"));
            assert!(bluetooth_codes.contains("GamepadLB"));
            assert!(bluetooth_codes.contains("GamepadView"));
            assert!(bluetooth_codes.contains("GamepadRT"));
        }

        #[test]
        fn emits_modifier_combos_like_the_browser_gamepad_fallback() {
            let previous = HashSet::new();
            let current = HashSet::from([GAMEPAD_COMBO_MODIFIER, "GamepadX"]);
            assert_eq!(
                gamepad_transitions(&previous, &current),
                vec![
                    ("gamepadbuttondown", String::from("GamepadLB+GamepadX")),
                    ("gamepadbuttondown", String::from("GamepadLB")),
                ]
            );

            let released_modifier = HashSet::from(["GamepadX"]);
            assert_eq!(
                gamepad_transitions(&current, &released_modifier),
                vec![
                    ("gamepadbuttonup", String::from("GamepadLB+GamepadX")),
                    ("gamepadbuttonup", String::from("GamepadLB")),
                ]
            );
        }

        #[test]
        fn maps_windows_side_buttons_to_dom_compatible_codes() {
            assert_eq!(xbutton_to_code(1 << 16), Some("Mouse3"));
            assert_eq!(xbutton_to_code(2 << 16), Some("Mouse4"));
            assert_eq!(xbutton_to_code(3 << 16), None);

            let keys = polled_keys();
            assert!(keys.contains(&(0x05, "Mouse3")));
            assert!(keys.contains(&(0x06, "Mouse4")));
        }
    }
}

#[cfg(windows)]
fn start_windows_global_input(_app: AppHandle) -> Result<(), String> {
    winhook::start()
}

#[cfg(not(windows))]
fn start_windows_global_input(_app: AppHandle) -> Result<(), String> {
    INPUT_HOOK_STARTED.store(false, Ordering::SeqCst);
    Err(String::from(
        "global input hook is only implemented on Windows",
    ))
}

pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri::plugin::Builder::<tauri::Wry, ()>::new("afyg-bridge")
                .js_init_script_on_all_frames(include_str!("afyg_bridge.js"))
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if let Some(overlay) = app.get_webview_window("overlay") {
                let _ = overlay.set_always_on_top(true);
                let _ = overlay.set_shadow(false);
                let _ = overlay.set_ignore_cursor_events(true);
                let app_handle = app.handle().clone();
                let overlay_for_event = overlay.clone();
                overlay.on_window_event(move |event| match event {
                    WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
                        emit_overlay_window_bounds(&app_handle, &overlay_for_event);
                    }
                    _ => {}
                });
            }
            if let Some(feedback) = app.get_webview_window("rhythm-feedback") {
                let _ = feedback.set_always_on_top(true);
                let _ = feedback.set_shadow(false);
                let _ = feedback.set_ignore_cursor_events(true);
                let _ = feedback.set_min_size(Some(Size::Physical(PhysicalSize::new(
                    FEEDBACK_MIN_WIDTH,
                    FEEDBACK_MIN_HEIGHT,
                ))));
                let _ = feedback.set_max_size(Some(Size::Physical(PhysicalSize::new(
                    FEEDBACK_MAX_WIDTH,
                    FEEDBACK_MAX_HEIGHT,
                ))));
                let app_handle = app.handle().clone();
                let feedback_for_event = feedback.clone();
                feedback.on_window_event(move |event| match event {
                    WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
                        emit_rhythm_feedback_window_bounds(&app_handle, &feedback_for_event);
                    }
                    _ => {}
                });
            }
            if let Some(key_mapping) = app.get_webview_window("key-mapping") {
                let _ = key_mapping.set_always_on_top(true);
                let _ = key_mapping.set_shadow(false);
                let _ = key_mapping.set_ignore_cursor_events(true);
                let _ = key_mapping.set_min_size(Some(Size::Logical(LogicalSize::new(
                    KEY_MAPPING_MIN_WIDTH as f64,
                    KEY_MAPPING_MIN_HEIGHT as f64,
                ))));
                let _ = key_mapping.set_max_size(Some(Size::Logical(LogicalSize::new(
                    KEY_MAPPING_MAX_WIDTH as f64,
                    KEY_MAPPING_MAX_HEIGHT as f64,
                ))));
                let app_handle = app.handle().clone();
                let key_mapping_for_event = key_mapping.clone();
                key_mapping.on_window_event(move |event| match event {
                    WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
                        emit_key_mapping_window_bounds(&app_handle, &key_mapping_for_event);
                    }
                    _ => {}
                });
            }
            if let Some(indicator) = app.get_webview_window("recording-indicator") {
                let _ = indicator.set_always_on_top(true);
                let _ = indicator.set_shadow(false);
                let _ = indicator.set_focusable(false);
                let _ = indicator.set_ignore_cursor_events(true);
            }
            if let Some(main) = app.get_webview_window("main") {
                let app_handle = app.handle().clone();
                main.on_window_event(move |event| match event {
                    WindowEvent::Moved(_) => {
                        let state = RECORDING_INDICATOR_STATE.lock().clone();
                        if state
                            .get("visible")
                            .and_then(|value| value.as_bool())
                            .unwrap_or(false)
                        {
                            let _ = apply_recording_indicator_state(&app_handle, &state);
                        }
                    }
                    WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed => {
                        if let Some(overlay) = app_handle.get_webview_window("overlay") {
                            let _ = overlay.hide();
                            let _ = overlay.destroy();
                        }
                        if let Some(feedback) = app_handle.get_webview_window("rhythm-feedback") {
                            let _ = feedback.hide();
                            let _ = feedback.destroy();
                        }
                        if let Some(key_mapping) = app_handle.get_webview_window("key-mapping") {
                            let _ = key_mapping.hide();
                            let _ = key_mapping.destroy();
                        }
                        if let Some(indicator) =
                            app_handle.get_webview_window("recording-indicator")
                        {
                            let _ = indicator.hide();
                            let _ = indicator.destroy();
                        }
                        if let Some(notes_editor) =
                            app_handle.get_webview_window("overlay-notes-editor")
                        {
                            let _ = notes_editor.hide();
                            let _ = notes_editor.destroy();
                        }
                        app_handle.exit(0);
                    }
                    _ => {}
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            set_overlay_visible,
            set_overlay_click_through,
            set_overlay_bounds,
            set_overlay_position,
            get_overlay_bounds,
            get_overlay_state,
            get_display_size,
            update_overlay,
            update_overlay_visible_notes,
            update_overlay_practice,
            notify_overlay_bounds_changed,
            notify_overlay_note_bounds_changed,
            set_overlay_notes_visible,
            set_overlay_notes_click_through,
            set_overlay_notes_bounds,
            get_overlay_notes_bounds,
            get_overlay_notes_state,
            request_overlay_move_mode,
            set_rhythm_feedback_visible,
            update_rhythm_feedback,
            get_rhythm_feedback_state,
            set_rhythm_feedback_bounds,
            get_rhythm_feedback_bounds,
            set_rhythm_feedback_position,
            start_rhythm_feedback_drag,
            notify_rhythm_feedback_bounds_changed,
            set_key_mapping_visible,
            update_key_mapping,
            get_key_mapping_state,
            set_key_mapping_bounds,
            get_key_mapping_bounds,
            set_key_mapping_position,
            start_key_mapping_drag,
            notify_key_mapping_bounds_changed,
            update_recording_indicator,
            get_recording_indicator_state,
            update_realtime_vision,
            get_realtime_vision_state,
            set_realtime_vision_bounds,
            set_realtime_vision_position,
            get_realtime_vision_bounds,
            set_realtime_vision_click_through,
            start_simulated_input,
            stop_simulated_input,
            set_global_input_mode,
            start_global_input,
            stop_global_input,
            global_input_status,
            fetch_remote_character_avatars,
            get_dlc_status,
            open_dlc_folder,
            save_export_file,
            pick_export_directory,
            pick_video_file,
            analyze_video_key_mapping,
            cancel_video_key_mapping_recognition,
            cancel_video_export,
            export_video_with_overlay,
            save_export_mp4
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
