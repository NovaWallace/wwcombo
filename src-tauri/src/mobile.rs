use serde_json::{json, Value};
use tauri::plugin::{Builder as PluginBuilder, PluginHandle};
use tauri::{Manager, Runtime, State, Wry};

struct MobileNative<R: Runtime>(PluginHandle<R>);

const MOBILE_AVATAR_API: &str = "https://wuwa-hpyg-tool.200503.xyz/api/v1/batch-icons/character";
const MOBILE_BASE_API: &str = "https://nova.fb520.site/api/project-assets/v1/manifest.json";

#[tauri::command]
async fn mobile_fetch_assets() -> Result<Value, String> {
    let client = reqwest::Client::builder()
        .user_agent("WWCombo-Android/0.64")
        .build()
        .map_err(|error| error.to_string())?;
    let avatar = client
        .get(MOBILE_AVATAR_API)
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .json::<Value>()
        .await
        .map_err(|error| error.to_string())?;
    let base = client
        .get(MOBILE_BASE_API)
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .json::<Value>()
        .await
        .map_err(|error| error.to_string())?;
    Ok(json!({ "avatars": avatar, "bases": base }))
}

#[tauri::command]
fn mobile_status(native: State<'_, MobileNative<Wry>>) -> Result<Value, String> {
    native
        .0
        .run_mobile_plugin("status", serde_json::json!({}))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn mobile_open_accessibility_settings(
    native: State<'_, MobileNative<Wry>>,
) -> Result<(), String> {
    native
        .0
        .run_mobile_plugin::<Value>("openAccessibilitySettings", serde_json::json!({}))
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn mobile_start_assistant(
    native: State<'_, MobileNative<Wry>>,
    chart: Value,
    settings: Value,
) -> Result<Value, String> {
    let chart_json = serde_json::to_string(&chart).map_err(|error| error.to_string())?;
    let settings_json = serde_json::to_string(&settings).map_err(|error| error.to_string())?;
    native
        .0
        .run_mobile_plugin(
            "startAssistant",
            serde_json::json!({ "chartJson": chart_json, "settingsJson": settings_json }),
        )
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn mobile_stop_assistant(
    native: State<'_, MobileNative<Wry>>,
) -> Result<Value, String> {
    native
        .0
        .run_mobile_plugin("stopAssistant", serde_json::json!({}))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn mobile_update_overlay_settings(
    native: State<'_, MobileNative<Wry>>,
    settings: Value,
) -> Result<Value, String> {
    let settings_json = serde_json::to_string(&settings).map_err(|error| error.to_string())?;
    native
        .0
        .run_mobile_plugin(
            "updateOverlaySettings",
            serde_json::json!({ "settingsJson": settings_json }),
        )
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn mobile_set_overlay_editing(
    native: State<'_, MobileNative<Wry>>,
    enabled: bool,
) -> Result<Value, String> {
    native
        .0
        .run_mobile_plugin("setOverlayEditing", serde_json::json!({ "enabled": enabled }))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn mobile_start_recording(
    native: State<'_, MobileNative<Wry>>,
    title: String,
    settings: Value,
    tap_merge_ms: u64,
    standard_hold_ms: u64,
    heavy_hold_ms: u64,
    starting_slot: u8,
) -> Result<Value, String> {
    let settings_json = serde_json::to_string(&settings).map_err(|error| error.to_string())?;
    native
        .0
        .run_mobile_plugin(
            "startRecording",
            serde_json::json!({
                "title": title,
                "settingsJson": settings_json,
                "tapMergeMs": tap_merge_ms,
                "standardHoldMs": standard_hold_ms,
                "heavyHoldMs": heavy_hold_ms,
                "startingSlot": starting_slot
            }),
        )
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn mobile_stop_recording(
    native: State<'_, MobileNative<Wry>>,
) -> Result<Value, String> {
    native
        .0
        .run_mobile_plugin("stopRecording", serde_json::json!({}))
        .map_err(|error| error.to_string())
}

fn mobile_native_plugin() -> tauri::plugin::TauriPlugin<Wry> {
    PluginBuilder::<Wry, ()>::new("mobile-native")
        .setup(|app, api| {
            let handle = api.register_android_plugin(
                "com.novawallace.wwcombo",
                "MobileCompanionPlugin",
            )?;
            app.manage(MobileNative(handle));
            Ok(())
        })
        .build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(mobile_native_plugin())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            mobile_fetch_assets,
            mobile_status,
            mobile_open_accessibility_settings,
            mobile_start_assistant,
            mobile_stop_assistant,
            mobile_update_overlay_settings,
            mobile_set_overlay_editing,
            mobile_start_recording,
            mobile_stop_recording
        ])
        .run(tauri::generate_context!())
        .expect("error while running WWCombo Mobile");
}
