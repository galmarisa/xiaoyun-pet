//! 小云桌宠 —— 应用装配：窗口 / 托盘 / 插件 / 后台线程。

pub mod commands;
mod audio;
mod process;
pub mod cursor;
pub mod llm;
pub mod music;
pub mod store;
pub mod sfx;
pub mod tts;
pub mod weather;

use store::AppState;
use tauri::{
    AppHandle, Emitter, LogicalPosition, Manager,
    menu::{Menu, MenuEvent, MenuItem, Submenu, CheckMenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

/// 每秒 tick + 时钟跳变检测（睡眠唤醒后前端重挂提醒）。
fn spawn_tick(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last_mono = std::time::Instant::now();
        let mut last_wall = std::time::SystemTime::now();
        loop {
            std::thread::sleep(std::time::Duration::from_secs(1));
            let now_wall = std::time::SystemTime::now();
            let _ = app.emit("tick://sec", store::now_secs());
            let mono = last_mono.elapsed().as_secs_f64();
            let wall = now_wall
                .duration_since(last_wall)
                .map(|d| d.as_secs_f64())
                .unwrap_or(mono);
            if (wall - mono).abs() > 5.0 {
                let _ = app.emit("tick://clock-skew", ());
            }
            last_mono = std::time::Instant::now();
            last_wall = now_wall;
        }
    });
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let cfg = app.state::<AppState>().cfg.read().unwrap().clone();

    let show = MenuItem::with_id(app, "show", "显示 / 隐藏小云", true, None::<&str>)?;
    let talk = MenuItem::with_id(app, "talk", "和小云打个招呼", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "设置…", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;

    let feed = Submenu::with_id_and_items(
        app,
        "feed",
        "投喂",
        true,
        &[
            &MenuItem::with_id(app, "feed_bread", "面包 🍞", true, None::<&str>)?,
            &MenuItem::with_id(app, "feed_cake", "蛋糕 🍰", true, None::<&str>)?,
            &MenuItem::with_id(app, "feed_cheese", "芝士 🧀", true, None::<&str>)?,
            &MenuItem::with_id(app, "feed_noodle", "贵州粉 🍜", true, None::<&str>)?,
            &MenuItem::with_id(app, "feed_hotpot", "火锅 🍲", true, None::<&str>)?,
        ],
    )?;

    let passthrough = CheckMenuItem::with_id(
        app, "passthrough", "整窗接收鼠标（关闭逐像素穿透）", true,
        cfg.simple_passthrough, None::<&str>,
    )?;
    let autostart = CheckMenuItem::with_id(
        app, "autostart", "开机自启", true,
        cfg.autostart, None::<&str>,
    )?;

    let menu = Menu::with_items(
        app,
        &[
            &show,
            &talk,
            &feed,
            &PredefinedMenuItem::separator(app)?,
            &settings,
            &passthrough,
            &autostart,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;

    TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().expect("缺少应用图标").clone())
        .tooltip("小云桌宠")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(handle_menu_event)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle().clone();
                if let Some(w) = app.get_webview_window("pet") {
                    let _ = w.show();
                }
                let _ = app.emit("tray://talk", ());
            }
        })
        .build(app)?;
    Ok(())
}

fn handle_menu_event(app: &AppHandle, event: MenuEvent) {
    let id = event.id().as_ref().to_string();
    match id.as_str() {
        "show" => {
            if let Some(w) = app.get_webview_window("pet") {
                if w.is_visible().unwrap_or(false) {
                    let _ = w.hide();
                } else {
                    let _ = w.show();
                }
            }
        }
        "talk" => {
            let _ = app.emit("tray://talk", ());
        }
        "settings" => commands::open_settings(app.clone()),
        "history" => commands::open_history(app.clone()),
        "chat" | "music_daily" | "music_random" | "music_stop" | "sign_in" | "pomodoro"
        | "speak_line" => {
            let _ = app.emit("ctx://action", id);
        }
        "quit" => app.exit(0),
        "passthrough" => {
            let state = app.state::<AppState>();
            let mut cfg = state.cfg.write().unwrap();
            cfg.simple_passthrough = !cfg.simple_passthrough;
            let new = cfg.simple_passthrough;
            cfg.save();
            let payload = cfg.clone();
            drop(cfg);
            drop(state);
            let _ = app.emit("config://changed", &payload);
            let _ = new;
        }
        "autostart" => {
            let state = app.state::<AppState>();
            let mut cfg = state.cfg.write().unwrap();
            cfg.autostart = !cfg.autostart;
            let want = cfg.autostart;
            cfg.save();
            let payload = cfg.clone();
            drop(cfg);
            drop(state);
            let r = if want {
                app.autolaunch().enable()
            } else {
                app.autolaunch().disable()
            };
            if let Err(e) = r {
                eprintln!("[autostart] {e}");
            }
            let _ = app.emit("config://changed", &payload);
        }
        other if other.starts_with("feed_") => {
            let food = other.trim_start_matches("feed_");
            let _ = app.emit("tray://feed", food);
        }
        _ => {}
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("pet") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_dialog::init())
        .on_menu_event(handle_menu_event)
        .manage(AppState::load())
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::set_config,
            commands::get_data,
            commands::set_data,
            commands::set_hit_regions,
            commands::set_passthrough_override,
            commands::speak,
            commands::speak_stop,
            commands::tts_voices,
            commands::fetch_weather,
            commands::scan_music,
            commands::open_settings,
            commands::open_talk,
            commands::quit,
            commands::restore_position,
            commands::allow_music_dir,
            commands::llm_chat,
            commands::read_json_file,
            commands::show_context_menu,
            commands::sfx_list,
            commands::sfx_play,
            commands::set_skin,
            commands::append_chat,
            commands::clear_chat,
            commands::open_history,
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let state = app.state::<AppState>();
            let cfg = state.cfg.read().unwrap().clone();
            drop(state);

            // 自启状态以系统实际为准做一次同步
            if let Ok(enabled) = app.autolaunch().is_enabled() {
                if enabled != cfg.autostart {
                    let r = if cfg.autostart {
                        app.autolaunch().enable()
                    } else {
                        app.autolaunch().disable()
                    };
                    if let Err(e) = r {
                        eprintln!("[autostart] {e}");
                    }
                }
            }

            if let Some(w) = app.get_webview_window("pet") {
                if let (Some(x), Some(y)) = (cfg.pos_x, cfg.pos_y) {
                    let _ = w.set_position(LogicalPosition::new(x, y));
                }
                let _ = w.show();
                // 重建后清除 WKWebView 磁盘缓存，避免 web 资源跨版本驻留旧文件
                let _ = w.clear_all_browsing_data();
            }

            // 已配置皮肤目录 → 启动即授权 asset 协议
            if let Some(skin) = cfg.skin_dir.as_deref() {
                if std::path::Path::new(skin).join("front.png").is_file() {
                    for w in app.webview_windows().values() {
                        let _ = w.asset_protocol_scope().allow_directory(skin, true);
                    }
                }
            }

            let handle = app.handle().clone();
            build_tray(&handle)?;
            cursor::spawn(handle.clone());
            spawn_tick(handle);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("小云桌宠启动失败");
}
