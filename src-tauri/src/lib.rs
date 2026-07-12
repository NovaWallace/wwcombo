use once_cell::sync::Lazy;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewWindow, WindowEvent};

static INPUT_HOOK_STARTED: AtomicBool = AtomicBool::new(false);
static INPUT_HOOK_STATUS: Lazy<Mutex<String>> = Lazy::new(|| Mutex::new(String::from("idle")));
static INPUT_EVENT_COUNT: Lazy<Mutex<u64>> = Lazy::new(|| Mutex::new(0));
static APP_HANDLE: Lazy<Mutex<Option<AppHandle>>> = Lazy::new(|| Mutex::new(None));

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
        .set_position(PhysicalPosition::new(bounds.x.round() as i32, bounds.y.round() as i32))
        .map_err(|error| error.to_string())?;
    window
        .set_size(PhysicalSize::new(bounds.width.max(1.0).round() as u32, bounds.height.max(1.0).round() as u32))
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
fn update_overlay(app: AppHandle, payload: serde_json::Value) -> Result<(), String> {
    let window = app
        .get_webview_window("overlay")
        .ok_or_else(|| String::from("overlay window not found"))?;
    if payload.get("visible").and_then(|value| value.as_bool()).unwrap_or(false) {
        let _ = window.set_always_on_top(true);
        let _ = window.set_shadow(false);
        let _ = window.show();
    }
    window
        .emit("overlay:update", payload)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn notify_overlay_bounds_changed(app: AppHandle, bounds: OverlayBounds) -> Result<(), String> {
    app.emit("overlay:bounds-changed", serde_json::json!({
        "x": bounds.x.round(),
        "y": bounds.y.round(),
        "width": bounds.width.round(),
        "height": bounds.height.round()
    }))
    .map_err(|error| error.to_string())
}

fn emit_overlay_window_bounds(app: &AppHandle, window: &WebviewWindow) {
    let Ok(position) = window.outer_position() else { return; };
    let Ok(size) = window.outer_size() else { return; };
    let _ = app.emit("overlay:bounds-changed", serde_json::json!({
        "x": position.x,
        "y": position.y,
        "width": size.width,
        "height": size.height
    }));
}

#[tauri::command]
fn request_overlay_move_mode(app: AppHandle, enabled: bool) -> Result<(), String> {
    app.emit("overlay:move-mode", serde_json::json!({ "enabled": enabled }))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn start_global_input(app: AppHandle) -> Result<serde_json::Value, String> {
    *APP_HANDLE.lock() = Some(app.clone());

    if INPUT_HOOK_STARTED.swap(true, Ordering::SeqCst) {
        return Ok(serde_json::json!({ "ok": true }));
    }

    *INPUT_HOOK_STATUS.lock() = String::from("starting");
    start_windows_global_input(app)?;
    *INPUT_HOOK_STATUS.lock() = String::from("running");
    Ok(serde_json::json!({ "ok": true }))
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

fn emit_input(event_type: &str, code: String) {
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
    use std::sync::atomic::Ordering;
    use std::io;

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
        fn SetWindowsHookExW(id_hook: i32, lpfn: Option<HookProc>, hmod: Hinstance, thread_id: u32) -> Hhook;
        fn CallNextHookEx(hhk: Hhook, n_code: i32, w_param: Wparam, l_param: Lparam) -> Lresult;
        fn GetMessageW(lp_msg: *mut Msg, hwnd: Hwnd, msg_filter_min: u32, msg_filter_max: u32) -> i32;
        fn TranslateMessage(lp_msg: *const Msg) -> i32;
        fn DispatchMessageW(lp_msg: *const Msg) -> Lresult;
        fn GetAsyncKeyState(v_key: i32) -> i16;
    }

    pub fn start() -> Result<(), String> {
        start_polling_fallback()?;

        std::thread::Builder::new()
            .name(String::from("windows-global-input-hook"))
            .spawn(|| unsafe {
                let keyboard_hook = SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_proc), 0, 0);
                let keyboard_error = io::Error::last_os_error();
                let mouse_hook = SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_proc), 0, 0);
                let mouse_error = io::Error::last_os_error();

                if keyboard_hook == 0 || mouse_hook == 0 {
                    *INPUT_HOOK_STATUS.lock() = format!(
                        "failed to install Windows hooks: keyboard={:?}, mouse={:?}",
                        keyboard_error, mouse_error
                    );
                    INPUT_HOOK_STARTED.store(false, Ordering::SeqCst);
                    return;
                }

                *INPUT_HOOK_STATUS.lock() = String::from("windows hooks installed");

                let mut msg = Msg::default();
                while GetMessageW(&mut msg, 0, 0, 0) > 0 {
                    let _ = TranslateMessage(&msg);
                    let _ = DispatchMessageW(&msg);
                }
            })
            .map_err(|error| {
                INPUT_HOOK_STARTED.store(false, Ordering::SeqCst);
                error.to_string()
            })?;

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
            keys.push((vk, Box::leak(format!("Digit{}", vk - 0x30).into_boxed_str())));
        }
        for vk in 0x41..=0x5A {
            keys.push((vk, Box::leak(format!("Key{}", char::from_u32(vk as u32).unwrap_or('?')).into_boxed_str())));
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
    Err(String::from("global input hook is only implemented on Windows"))
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
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            set_overlay_visible,
            set_overlay_click_through,
            set_overlay_bounds,
            get_overlay_bounds,
            update_overlay,
            notify_overlay_bounds_changed,
            request_overlay_move_mode,
            start_global_input,
            global_input_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
