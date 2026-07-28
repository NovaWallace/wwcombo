use once_cell::sync::Lazy;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, PhysicalSize, Size, WebviewWindow,
    WindowEvent,
};

static INPUT_HOOK_STARTED: AtomicBool = AtomicBool::new(false);
static VIDEO_EXPORT_CANCELLED: AtomicBool = AtomicBool::new(false);
static INPUT_HOOK_STATUS: Lazy<Mutex<String>> = Lazy::new(|| Mutex::new(String::from("idle")));
static INPUT_EVENT_COUNT: Lazy<Mutex<u64>> = Lazy::new(|| Mutex::new(0));
static INPUT_PRESSED_CODES: Lazy<Mutex<HashSet<String>>> = Lazy::new(|| Mutex::new(HashSet::new()));
static APP_HANDLE: Lazy<Mutex<Option<AppHandle>>> = Lazy::new(|| Mutex::new(None));
static RHYTHM_FEEDBACK_STATE: Lazy<Mutex<serde_json::Value>> =
    Lazy::new(|| Mutex::new(serde_json::json!({ "visible": false, "moveMode": false })));
static KEY_MAPPING_STATE: Lazy<Mutex<serde_json::Value>> = Lazy::new(|| {
    Mutex::new(serde_json::json!({ "visible": false, "moveMode": false, "pressedCodes": [] }))
});
static RECORDING_INDICATOR_STATE: Lazy<Mutex<serde_json::Value>> = Lazy::new(|| {
    Mutex::new(serde_json::json!({ "visible": false, "recording": false, "corner": "bottom-left" }))
});

#[derive(Clone, Serialize)]
struct DesktopInputEvent {
    source: &'static str,
    #[serde(rename = "type")]
    event_type: String,
    code: String,
    time: f64,
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
}

#[derive(Clone, Serialize)]
struct SaveExportResult {
    path: String,
}

#[derive(Clone, Serialize)]
struct ExportVideoResult {
    path: String,
}

#[derive(Clone, Serialize)]
struct PickedVideoFile {
    path: String,
    name: String,
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
const RECORDING_INDICATOR_SIZE: f64 = 48.0;
const RECORDING_INDICATOR_MARGIN: f64 = 18.0;
const REMOTE_CHARACTER_AVATAR_API: &str = "https://wuwa-hpyg-tool.200503.xyz/api/v1/icons/character";

#[tauri::command]
async fn fetch_remote_character_avatars() -> Result<serde_json::Value, String> {
    let response = reqwest::Client::new()
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

#[tauri::command]
fn set_overlay_visible(app: AppHandle, visible: bool) -> Result<(), String> {
    let window = app
        .get_webview_window("overlay")
        .ok_or_else(|| String::from("overlay window not found"))?;
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
fn set_overlay_click_through(app: AppHandle, enabled: bool) -> Result<(), String> {
    let window = app
        .get_webview_window("overlay")
        .ok_or_else(|| String::from("overlay window not found"))?;
    window
        .set_ignore_cursor_events(enabled)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn set_overlay_bounds(app: AppHandle, bounds: OverlayBounds) -> Result<(), String> {
    let window = app
        .get_webview_window("overlay")
        .ok_or_else(|| String::from("overlay window not found"))?;
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
fn set_overlay_position(app: AppHandle, position: OverlayPosition) -> Result<(), String> {
    let window = app
        .get_webview_window("overlay")
        .ok_or_else(|| String::from("overlay window not found"))?;
    window
        .set_position(PhysicalPosition::new(
            position.x.round() as i32,
            position.y.round() as i32,
        ))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn get_overlay_bounds(app: AppHandle) -> Result<OverlayBounds, String> {
    let window = app
        .get_webview_window("overlay")
        .ok_or_else(|| String::from("overlay window not found"))?;
    let position = window.outer_position().map_err(|error| error.to_string())?;
    let size = window.outer_size().map_err(|error| error.to_string())?;
    Ok(OverlayBounds {
        x: position.x as f64,
        y: position.y as f64,
        width: size.width as f64,
        height: size.height as f64,
    })
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
    let work_area = monitor.work_area();
    let left = work_area.position.x + margin;
    let right = work_area.position.x + work_area.size.width as i32 - physical_window_size - margin;
    let top = work_area.position.y + margin;
    let bottom =
        work_area.position.y + work_area.size.height as i32 - physical_window_size - margin;
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
fn update_recording_indicator(app: AppHandle, payload: serde_json::Value) -> Result<(), String> {
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

#[tauri::command]
fn update_overlay(app: AppHandle, payload: serde_json::Value) -> Result<(), String> {
    let window = app
        .get_webview_window("overlay")
        .ok_or_else(|| String::from("overlay window not found"))?;
    let visible = payload
        .get("visible")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    let move_mode = payload
        .get("moveMode")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    let _ = window.set_ignore_cursor_events(!move_mode);
    if visible || move_mode {
        let _ = window.set_always_on_top(true);
        let _ = window.set_shadow(false);
        let _ = window.show();
    } else {
        let _ = window.hide();
    }
    window
        .emit("overlay:update", payload)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn set_rhythm_feedback_visible(app: AppHandle, visible: bool) -> Result<(), String> {
    let window = app
        .get_webview_window("rhythm-feedback")
        .ok_or_else(|| String::from("rhythm feedback window not found"))?;
    if visible {
        let _ = window.set_always_on_top(true);
        let _ = window.set_shadow(false);
        let _ = window.set_ignore_cursor_events(true);
        window.show().map_err(|error| error.to_string())?;
    } else {
        let _ = window.set_ignore_cursor_events(true);
        window.hide().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn update_rhythm_feedback(app: AppHandle, payload: serde_json::Value) -> Result<(), String> {
    let window = app
        .get_webview_window("rhythm-feedback")
        .ok_or_else(|| String::from("rhythm feedback window not found"))?;
    *RHYTHM_FEEDBACK_STATE.lock() = payload.clone();
    if let Some(bounds) = payload.get("bounds") {
        if let Ok(bounds) = serde_json::from_value::<FeedbackBounds>(bounds.clone()) {
            let _ = apply_rhythm_feedback_bounds(&window, bounds);
        }
    }
    let move_mode = payload
        .get("moveMode")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    if payload
        .get("visible")
        .and_then(|value| value.as_bool())
        .unwrap_or(false)
        || move_mode
    {
        let _ = window.set_always_on_top(true);
        let _ = window.set_shadow(false);
        let _ = window.set_ignore_cursor_events(!move_mode);
        let _ = window.show();
    } else {
        let _ = window.set_ignore_cursor_events(true);
        let _ = window.hide();
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
fn set_rhythm_feedback_bounds(app: AppHandle, bounds: FeedbackBounds) -> Result<(), String> {
    let window = app
        .get_webview_window("rhythm-feedback")
        .ok_or_else(|| String::from("rhythm feedback window not found"))?;
    apply_rhythm_feedback_bounds(&window, bounds)
}

#[tauri::command]
fn get_rhythm_feedback_bounds(app: AppHandle) -> Result<FeedbackBounds, String> {
    let window = app
        .get_webview_window("rhythm-feedback")
        .ok_or_else(|| String::from("rhythm feedback window not found"))?;
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
fn set_rhythm_feedback_position(app: AppHandle, position: OverlayPosition) -> Result<(), String> {
    let window = app
        .get_webview_window("rhythm-feedback")
        .ok_or_else(|| String::from("rhythm feedback window not found"))?;
    window
        .set_position(PhysicalPosition::new(
            position.x.round() as i32,
            position.y.round() as i32,
        ))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn start_rhythm_feedback_drag(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("rhythm-feedback")
        .ok_or_else(|| String::from("rhythm feedback window not found"))?;
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
fn set_key_mapping_visible(app: AppHandle, visible: bool) -> Result<(), String> {
    let window = app
        .get_webview_window("key-mapping")
        .ok_or_else(|| String::from("key mapping window not found"))?;
    if visible {
        let _ = window.set_always_on_top(true);
        let _ = window.set_shadow(false);
        let _ = window.set_ignore_cursor_events(true);
        window.show().map_err(|error| error.to_string())?;
    } else {
        let _ = window.set_ignore_cursor_events(true);
        window.hide().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn update_key_mapping(app: AppHandle, payload: serde_json::Value) -> Result<(), String> {
    let window = app
        .get_webview_window("key-mapping")
        .ok_or_else(|| String::from("key mapping window not found"))?;
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
    let move_mode = payload
        .get("moveMode")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    let visible = payload
        .get("visible")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    if visible || move_mode {
        let _ = window.set_always_on_top(true);
        let _ = window.set_shadow(false);
        let _ = window.set_ignore_cursor_events(!move_mode);
        let _ = window.show();
    } else if payload.get("visible").is_some() || payload.get("moveMode").is_some() {
        let _ = window.set_ignore_cursor_events(true);
        let _ = window.hide();
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
fn set_key_mapping_bounds(app: AppHandle, bounds: OverlayBounds) -> Result<(), String> {
    let window = app
        .get_webview_window("key-mapping")
        .ok_or_else(|| String::from("key mapping window not found"))?;
    apply_key_mapping_bounds(&window, bounds)
}

#[tauri::command]
fn get_key_mapping_bounds(app: AppHandle) -> Result<OverlayBounds, String> {
    let window = app
        .get_webview_window("key-mapping")
        .ok_or_else(|| String::from("key mapping window not found"))?;
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
fn set_key_mapping_position(app: AppHandle, position: OverlayPosition) -> Result<(), String> {
    let window = app
        .get_webview_window("key-mapping")
        .ok_or_else(|| String::from("key mapping window not found"))?;
    window
        .set_position(PhysicalPosition::new(
            position.x.round() as i32,
            position.y.round() as i32,
        ))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn start_key_mapping_drag(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("key-mapping")
        .ok_or_else(|| String::from("key mapping window not found"))?;
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
    let _ = app.emit(
        "overlay:bounds-changed",
        serde_json::json!({
            "x": position.x,
            "y": position.y,
            "width": size.width,
            "height": size.height
        }),
    );
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
fn start_global_input(app: AppHandle) -> serde_json::Value {
    *APP_HANDLE.lock() = Some(app.clone());

    if INPUT_HOOK_STARTED.swap(true, Ordering::SeqCst) {
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
            *INPUT_HOOK_STATUS.lock() = format!("failed: {error}");
            serde_json::json!({ "ok": false, "reason": error })
        }
    }
}

#[tauri::command]
fn global_input_status() -> serde_json::Value {
    let status = INPUT_HOOK_STATUS.lock().clone();
    let event_count = *INPUT_EVENT_COUNT.lock();
    serde_json::json!({
        "started": INPUT_HOOK_STARTED.load(Ordering::SeqCst),
        "status": status,
        "eventCount": event_count
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
fn pick_video_file() -> Option<PickedVideoFile> {
    rfd::FileDialog::new()
        .add_filter("视频文件", &["mp4", "mov", "mkv", "webm", "avi", "m4v"])
        .pick_file()
        .map(|path| PickedVideoFile {
            name: path.file_name().and_then(|name| name.to_str()).unwrap_or("video").to_string(),
            path: path.to_string_lossy().to_string(),
        })
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
            .arg("-crf").arg("16")
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
    let ffmpeg = find_ffmpeg(&app).ok_or_else(|| String::from("未找到 ffmpeg，无法转出 MP4。请把 ffmpeg.exe 放到 src-tauri/resources/ffmpeg.exe 后重新打包，或安装 ffmpeg 到 PATH。"))?;
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
    let stem = path.file_stem().and_then(|value| value.to_str()).unwrap_or("video");
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
    parent.join(format!("{stem}-{}{}", current_time_ms() as u64, extension.map(|value| format!(".{value}")).unwrap_or_default()))
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

fn find_ffmpeg(app: &AppHandle) -> Option<PathBuf> {
    if let Ok(dir) = app.path().resource_dir() {
        let bundled = dir.join("ffmpeg.exe");
        if bundled.is_file() {
            return Some(bundled);
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

fn emit_input(event_type: &str, code: String) {
    let is_pressed = event_type == "keydown" || event_type == "mousedown";
    let is_released = event_type == "keyup" || event_type == "mouseup";
    if !is_pressed && !is_released {
        return;
    }

    {
        let mut pressed_codes = INPUT_PRESSED_CODES.lock();
        if is_pressed {
            if !pressed_codes.insert(code.clone()) {
                return;
            }
        } else if !pressed_codes.remove(&code) {
            return;
        }
    }

    *INPUT_EVENT_COUNT.lock() += 1;
    let event = DesktopInputEvent {
        source: "desktop",
        event_type: event_type.to_string(),
        code,
        time: current_time_ms(),
    };

    if let Some(app) = APP_HANDLE.lock().as_ref() {
        let _ = app.emit("global-input", event);
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
    use super::{emit_input, INPUT_HOOK_STARTED, INPUT_HOOK_STATUS};
    use std::io;
    use std::sync::atomic::Ordering;

    type Hhook = isize;
    type Hinstance = isize;
    type Hwnd = isize;
    type Wparam = usize;
    type Lparam = isize;
    type Lresult = isize;
    type HookProc = unsafe extern "system" fn(i32, Wparam, Lparam) -> Lresult;

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

    #[repr(C)]
    struct KbdLlHookStruct {
        vk_code: u32,
        scan_code: u32,
        flags: u32,
        time: u32,
        dw_extra_info: usize,
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

                *INPUT_HOOK_STATUS.lock() = String::from("windows hooks installed; polling fallback active");

                let mut msg = Msg::default();
                while GetMessageW(&mut msg, 0, 0, 0) > 0 {
                    let _ = TranslateMessage(&msg);
                    let _ = DispatchMessageW(&msg);
                }
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
                loop {
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
                            emit_input(event_type, String::from(*code));
                        }
                    }
                    std::thread::sleep(std::time::Duration::from_millis(4));
                }
            })
            .map_err(|error| error.to_string())?;
        Ok(())
    }

    fn polled_keys() -> Vec<(i32, &'static str)> {
        let mut keys = vec![
            (0x01, "MouseLeft"),
            (0x02, "MouseRight"),
            (0x04, "MouseMiddle"),
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

    unsafe extern "system" fn keyboard_proc(code: i32, wparam: Wparam, lparam: Lparam) -> Lresult {
        if code == HC_ACTION {
            let data = &*(lparam as *const KbdLlHookStruct);
            let event_type = match wparam as u32 {
                WM_KEYDOWN | WM_SYSKEYDOWN => Some("keydown"),
                WM_KEYUP | WM_SYSKEYUP => Some("keyup"),
                _ => None,
            };

            if let Some(event_type) = event_type {
                emit_input(event_type, vk_to_code(data.vk_code));
            }
        }

        CallNextHookEx(0, code, wparam, lparam)
    }

    unsafe extern "system" fn mouse_proc(code: i32, wparam: Wparam, lparam: Lparam) -> Lresult {
        if code == HC_ACTION {
            let mapped = match wparam as u32 {
                WM_LBUTTONDOWN => Some(("mousedown", "MouseLeft")),
                WM_LBUTTONUP => Some(("mouseup", "MouseLeft")),
                WM_RBUTTONDOWN => Some(("mousedown", "MouseRight")),
                WM_RBUTTONUP => Some(("mouseup", "MouseRight")),
                WM_MBUTTONDOWN => Some(("mousedown", "MouseMiddle")),
                WM_MBUTTONUP => Some(("mouseup", "MouseMiddle")),
                _ => None,
            };

            if let Some((event_type, code)) = mapped {
                emit_input(event_type, String::from(code));
            }
        }

        CallNextHookEx(0, code, wparam, lparam)
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
            get_display_size,
            update_overlay,
            notify_overlay_bounds_changed,
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
            start_global_input,
            global_input_status,
            fetch_remote_character_avatars,
            save_export_file,
            pick_export_directory,
            pick_video_file,
            cancel_video_export,
            export_video_with_overlay,
            save_export_mp4
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
