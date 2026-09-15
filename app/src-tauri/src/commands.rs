//! 全部 #[tauri::command] IPC 命令。

use crate::store::{self, AppState, Config, HitRegion};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_autostart::ManagerExt;

#[tauri::command]
pub fn get_config(app: AppHandle) -> Config {
    app.state::<AppState>().cfg.read().unwrap().clone()
}

/// 应用新配置：持久化、同步自启动、广播给所有窗口。
#[tauri::command]
pub fn set_config(app: AppHandle, cfg: Config) -> Result<(), String> {
    let state = app.state::<AppState>();
    let old_autostart = state.cfg.read().unwrap().autostart;
    {
        let mut c = state.cfg.write().unwrap();
        *c = cfg.clone();
        c.save();
    }
    if cfg.autostart != old_autostart {
        let launcher = app.autolaunch();
        let r = if cfg.autostart {
            launcher.enable()
        } else {
            launcher.disable()
        };
        r.map_err(|e| e.to_string())?;
    }
    let _ = app.emit("config://changed", &cfg);
    Ok(())
}

#[tauri::command]
pub fn get_data(key: String) -> Option<Value> {
    store::get_kv(&key)
}

#[tauri::command]
pub fn set_data(key: String, value: Value) -> Result<(), String> {
    store::set_kv(&key, &value)
}

// ---------------- 聊天历史 ----------------

/// 追加聊天记录（成对调用：一次传 [user, pet]）。Rust 端统一盖毫秒时间戳。
#[tauri::command]
pub fn append_chat(app: AppHandle, entries: Vec<store::ChatEntry>) -> Result<(), String> {
    let mut rows: Vec<store::ChatEntry> = Vec::with_capacity(entries.len());
    for mut e in entries {
        if !matches!(e.role.as_str(), "user" | "pet" | "sys") {
            return Err("invalid role".into());
        }
        if e.role == "sys" {
            e.src = "sys".into(); // 会话分隔标记（如 new-chat）
        } else if !matches!(e.src.as_str(), "llm" | "offline") {
            e.src = "offline".into();
        }
        e.text = e.text.trim().chars().take(2000).collect();
        if e.text.is_empty() {
            continue;
        }
        e.ts = store::now_ms();
        rows.push(e);
    }
    if rows.is_empty() {
        return Ok(());
    }
    let state = app.state::<AppState>();
    let added = {
        let _g = state.chat_lock.lock().unwrap();
        let mut all = store::load_chat();
        let n = rows.len();
        all.append(&mut rows);
        let all = store::trim_to_max(all, store::CHAT_MAX);
        let v = serde_json::to_value(&all).map_err(|e| e.to_string())?;
        store::set_kv(store::CHAT_KEY, &v)?;
        v.as_array()
            .map(|a| a[a.len().saturating_sub(n)..].to_vec())
            .unwrap_or_default()
    };
    // 锁外广播，避免回调里再 invoke 排队等锁
    let _ = app.emit("chat://appended", &added);
    Ok(())
}

#[tauri::command]
pub fn clear_chat(app: AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    {
        let _g = state.chat_lock.lock().unwrap();
        store::set_kv(store::CHAT_KEY, &serde_json::json!([]))?;
    }
    let _ = app.emit("chat://cleared", ());
    Ok(())
}

#[tauri::command]
pub fn set_hit_regions(app: AppHandle, regions: Vec<HitRegion>) {
    *app.state::<AppState>().hit_regions.lock().unwrap() = regions;
}

/// override：None=自动 / Some(true)=强制穿透 / Some(false)=强制接收。
#[tauri::command]
pub fn set_passthrough_override(app: AppHandle, value: Option<bool>) {
    let v = match value {
        None => -1,
        Some(true) => 1,
        Some(false) => 0,
    };
    app.state::<AppState>()
        .passthrough_override
        .store(v, std::sync::atomic::Ordering::SeqCst);
}

#[tauri::command]
pub async fn speak(app: AppHandle, text: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let cfg = state.cfg.read().unwrap().clone();
        state.tts.speak(&cfg, &text)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn tts_voices() -> Result<Vec<crate::tts::Voice>, String> {
    tauri::async_runtime::spawn_blocking(crate::tts::voices)
        .await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn speak_stop(app: AppHandle) {
    app.state::<AppState>().tts.stop();
}

#[tauri::command]
pub async fn fetch_weather(force: Option<bool>) -> Result<Value, String> {
    let force = force.unwrap_or(false);
    tauri::async_runtime::spawn_blocking(move || crate::weather::fetch(force))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn scan_music(dir: String) -> Result<Vec<crate::music::Track>, String> {
    tauri::async_runtime::spawn_blocking(move || crate::music::scan(&dir))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_settings(app: AppHandle) {
    if let Some(w) = app.get_webview_window("settings") {
        let _ = w.show();
        let _ = w.set_focus();
        return;
    }
    let _ = tauri::WebviewWindowBuilder::new(
        &app,
        "settings",
        tauri::WebviewUrl::App("settings.html".into()),
    )
    .title("小云设置")
    .decorations(true)
    .resizable(true)
    .center()
    .focused(true)
    .min_inner_size(480.0, 420.0)
    .inner_size(600.0, 740.0)
    .build()
    .map(|w| {
        // 确保拿到 first responder：滚轮滚动与 Esc 依赖键盘焦点
        let _ = w.set_focus();
        w
    });
}

#[tauri::command]
pub fn open_talk(app: AppHandle) {
    if let Some(w) = app.get_webview_window("talk") {
        let _ = w.show();
        let _ = w.set_focus();
        return;
    }
    let _ = tauri::WebviewWindowBuilder::new(
        &app,
        "talk",
        tauri::WebviewUrl::App("talk.html".into()),
    )
    .title("和小云聊天")
    .decorations(false)
    .resizable(true)
    .always_on_top(true)
    .inner_size(340.0, 440.0)
    .min_inner_size(280.0, 360.0)
    .build();
}

#[tauri::command]
pub fn open_history(app: AppHandle) {
    if let Some(w) = app.get_webview_window("history") {
        let _ = w.show();
        let _ = w.set_focus();
        return;
    }
    let _ = tauri::WebviewWindowBuilder::new(
        &app,
        "history",
        tauri::WebviewUrl::App("history.html".into()),
    )
    .title("聊天历史")
    .decorations(false)
    .resizable(true)
    .always_on_top(true)
    .inner_size(420.0, 560.0)
    .min_inner_size(320.0, 420.0)
    .build();
}

#[tauri::command]
pub fn quit(app: AppHandle) {
    app.exit(0);
}

/// 恢复窗口位置（启动时由前端调用，确保 WebView 就绪后再移动）。
#[tauri::command]
pub fn restore_position(app: AppHandle, x: f64, y: f64) {
    if let Some(w) = app.get_webview_window("pet") {
        let _ = w.set_position(tauri::LogicalPosition::new(x, y));
    }
}

/// 允许音乐目录访问 asset 协议（运行时动态授权）。
#[tauri::command]
pub fn allow_music_dir(app: AppHandle, dir: String) -> Result<(), String> {
    for w in app.webview_windows().values() {
        w.asset_protocol_scope()
            .allow_directory(&dir, true)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ---------------- LLM 人格对话 ----------------

#[tauri::command]
pub async fn llm_chat(
    app: AppHandle,
    messages: Vec<crate::llm::ChatMessage>,
) -> Result<String, String> {
    let cfg = app.state::<AppState>().cfg.read().unwrap().clone();
    tauri::async_runtime::spawn_blocking(move || crate::llm::chat(&cfg, &messages))
        .await
        .map_err(|e| e.to_string())?
}

/// 受限文件读取：仅允许 .json（设置面板导入 posts.json 用）。
#[tauri::command]
pub fn read_json_file(path: String) -> Result<serde_json::Value, String> {
    if !path.to_ascii_lowercase().ends_with(".json") {
        return Err("只允许读取 .json 文件".into());
    }
    let s = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&s).map_err(|e| e.to_string())
}

/// 右键原生弹出菜单（不受宠物小窗口裁剪，点外部自动收起）。
#[tauri::command]
pub fn show_context_menu(
    app: AppHandle,
    window: tauri::Window,
    x: f64,
    y: f64,
) -> Result<(), String> {
    use tauri::menu::{ContextMenu, MenuItem, PredefinedMenuItem};

    let mi = |id: &str, label: &str| -> Result<MenuItem<tauri::Wry>, String> {
        MenuItem::with_id(&app, id, label, true, None::<&str>).map_err(|e| e.to_string())
    };
    let sep = || -> Result<PredefinedMenuItem<tauri::Wry>, String> {
        PredefinedMenuItem::separator(&app).map_err(|e| e.to_string())
    };
    let menu = tauri::menu::Menu::with_items(
        &app,
        &[
            &mi("feed_bread", "投喂面包 🍞")?,
            &mi("feed_cake", "投喂蛋糕 🍰")?,
            &mi("feed_cheese", "投喂芝士 🧀")?,
            &mi("feed_noodle", "投喂贵州粉 🍜")?,
            &mi("feed_hotpot", "投喂火锅 🍲")?,
            &sep()?,
            &mi("music_daily", "每日一曲 🎵")?,
            &mi("music_random", "随机来一首 🔀")?,
            &mi("music_stop", "停止播放 ⏹")?,
            &sep()?,
            &mi("sign_in", "每日签到 📅")?,
            &mi("pomodoro", "番茄钟 25/5 🍅")?,
            &mi("speak_line", "说台词 🎤")?,
            &mi("chat", "和她说句话… 💬")?,
            &mi("history", "聊天历史 📜")?,
            &mi("settings", "设置… ⚙️")?,
            &sep()?,
            &mi("quit", "退出小云 👋")?,
        ],
    )
    .map_err(|e| e.to_string())?;
    menu.popup_at(window, tauri::LogicalPosition::new(x, y))
        .map_err(|e| e.to_string())
}

// ---------------- live 音效 ----------------

#[tauri::command]
pub fn sfx_list() -> Vec<String> {
    crate::sfx::list()
}

#[tauri::command]
pub fn sfx_play(app: AppHandle, name: String, volume: Option<f64>) -> Result<(), String> {
    let state = app.state::<AppState>();
    let vol = state.cfg.read().unwrap().tts_volume;
    state
        .sfx
        .play(&name, volume.unwrap_or(vol))
}

// ---------------- 皮肤 ----------------

/// 设置皮肤目录（None 恢复内置）。校验 front.png 存在并授权 asset 协议。
#[tauri::command]
pub fn set_skin(app: AppHandle, dir: Option<String>) -> Result<(), String> {
    let state = app.state::<AppState>();
    if let Some(d) = dir.as_deref() {
        if !std::path::Path::new(d).join("front.png").is_file() {
            return Err("该目录缺少 front.png，不是有效皮肤".into());
        }
        for w in app.webview_windows().values() {
            w.asset_protocol_scope()
                .allow_directory(d, true)
                .map_err(|e| e.to_string())?;
        }
    }
    {
        let mut cfg = state.cfg.write().unwrap();
        cfg.skin_dir = dir;
        let payload = cfg.clone();
        cfg.save();
        drop(cfg);
        drop(state);
        let _ = app.emit("config://changed", &payload);
    }
    Ok(())
}
