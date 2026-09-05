use serde::Deserialize;
use std::collections::HashMap;
use std::io::{self, Read};
use std::time::{Duration, Instant};

#[derive(Clone, Deserialize)]
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

#[cfg(not(windows))]
fn main() {
    eprintln!("simulated input DLC is only supported on Windows");
    std::process::exit(1);
}

#[cfg(windows)]
fn main() {
    let mut source = Vec::new();
    if let Err(error) = io::stdin().read_to_end(&mut source) {
        eprintln!("could not read simulated input events: {error}");
        std::process::exit(1);
    }
    let events = match serde_json::from_slice::<Vec<SimulatedInputEvent>>(&source) {
        Ok(events) => events,
        Err(error) => {
            eprintln!("could not parse simulated input events: {error}");
            std::process::exit(1);
        }
    };
    if let Err(error) = run(events) {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

#[cfg(windows)]
fn run(mut events: Vec<SimulatedInputEvent>) -> Result<(), String> {
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
    for event in &events {
        input_simulator::validate_event(&event.event_type, &event.code)?;
    }

    events.sort_by_key(|event| event.at_ms);
    let target_window = input_simulator::foreground_window();
    if target_window == 0 {
        return Err(String::from("无法获取游戏窗口"));
    }
    let starts_at = Instant::now();
    let mut pressed_codes: HashMap<String, (u32, i32, i32)> = HashMap::new();

    for event in events {
        if input_simulator::foreground_window() != target_window {
            break;
        }
        let target = starts_at + Duration::from_millis(event.at_ms);
        while target > Instant::now() {
            let remaining = target.saturating_duration_since(Instant::now());
            if remaining > Duration::from_millis(3) {
                std::thread::sleep(remaining - Duration::from_millis(2));
            } else {
                std::thread::yield_now();
            }
        }

        let code = event
            .code
            .strip_suffix("Hold")
            .unwrap_or(&event.code)
            .to_owned();
        let is_press = matches!(event.event_type.as_str(), "keydown" | "mousedown");
        if is_press {
            if let Some(state) = pressed_codes.get_mut(&code) {
                state.0 = state.0.saturating_add(1);
                continue;
            }
            if input_simulator::inject(&event.event_type, &code, event.cursor_dx, event.cursor_dy)
                .is_ok()
            {
                pressed_codes.insert(code, (1, event.cursor_dx, event.cursor_dy));
            }
            continue;
        }

        let Some(state) = pressed_codes.get_mut(&code) else {
            let _ =
                input_simulator::inject(&event.event_type, &code, event.cursor_dx, event.cursor_dy);
            continue;
        };
        if state.0 > 1 {
            state.0 -= 1;
            continue;
        }
        let (_, cursor_dx, cursor_dy) = pressed_codes.remove(&code).unwrap();
        if input_simulator::inject(&event.event_type, &code, cursor_dx, cursor_dy).is_err() {
            pressed_codes.insert(code, (1, cursor_dx, cursor_dy));
        }
    }

    for (code, (_, cursor_dx, cursor_dy)) in pressed_codes {
        let event_type = if code.starts_with("Mouse") {
            "mouseup"
        } else {
            "keyup"
        };
        let _ = input_simulator::inject(event_type, &code, cursor_dx, cursor_dy);
    }
    Ok(())
}

#[cfg(windows)]
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
                send(Input {
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
                })?;
            }
            send(Input {
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
            })?;
            if !pressed && (cursor_dx != 0 || cursor_dy != 0) {
                send(Input {
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
                })?;
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
        let mut flags = KEYEVENTF_SCANCODE;
        if released {
            flags |= KEYEVENTF_KEYUP;
        }
        if is_extended_key(code) {
            flags |= KEYEVENTF_EXTENDEDKEY;
        }
        send(Input {
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
        })
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
