//! 数据层：配置与用户数据持久化（~/.xiaoyun-pet/）。

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// 数据目录（ ~/.xiaoyun-pet ）。
pub fn data_dir() -> PathBuf {
    let d = dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".xiaoyun-pet");
    let _ = fs::create_dir_all(&d);
    d
}

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Schedule {
    pub title: String,
    /// "HH:MM"
    pub time: String,
    /// 可选具体日期 "YYYY-MM-DD"（为空则每天）
    pub date: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Config {
    pub pos_x: Option<f64>,
    pub pos_y: Option<f64>,
    /// 0.25 – 1.5
    pub scale: f64,
    /// 全局台词最短间隔（秒）
    pub min_line_interval_sec: u64,
    /// 随机碎碎念冷却下限（秒）
    pub chatter_min_sec: u64,
    pub tts_enabled: bool,
    pub tts_voice: String,
    pub tts_rate: i32,
    /// 0.0–1.0（<0.95 时走 afplay 以支持音量）
    pub tts_volume: f64,
    /// TTS 后端："system"（macOS say）| "custom"（OpenAI /v1/audio/speech 兼容，
    /// 供自训练音色模型接入：GPT-SoVITS / OpenedAI-Speech / CosyVoice-API 等）
    pub tts_mode: String,
    pub tts_endpoint: Option<String>,
    /// 模型/音色 ID（自训练声音的标识）
    pub tts_model: Option<String>,
    pub tts_key: Option<String>,
    /// 深夜自动静音（时段可配，起止小时）
    pub night_mute: bool,
    pub night_mute_start: i32,
    pub night_mute_end: i32,
    pub autostart: bool,
    pub sit_reminder_min: u64,
    pub water_reminder_min: u64,
    pub chime_enabled: bool,
    /// 简单模式：整窗接收鼠标（关闭逐像素穿透）
    pub simple_passthrough: bool,
    pub music_dir: Option<String>,
    /// LLM 人格对话（OpenAI 兼容协议，Ollama 通用）
    pub llm_enabled: bool,
    pub llm_endpoint: Option<String>,
    pub llm_key: Option<String>,
    pub llm_model: Option<String>,
    /// 生效台词类型（real/adapted/original 子集）
    pub line_types: Vec<String>,
    /// 皮肤素材目录（None = 内置 assets/sprites）
    pub skin_dir: Option<String>,
    /// 春节日期 "MM-DD"
    pub spring_festival: Option<String>,
    /// 演唱会日期 "YYYY-MM-DD"
    pub concert_date: Option<String>,
    pub schedules: Vec<Schedule>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            pos_x: None,
            pos_y: None,
            scale: 0.75,
            min_line_interval_sec: 60,
            chatter_min_sec: 300,
            tts_enabled: false,
            tts_voice: "Tingting".into(),
            tts_rate: 190,
            tts_volume: 1.0,
            tts_mode: "system".into(),
            tts_endpoint: None,
            tts_model: None,
            tts_key: None,
            night_mute: true,
            night_mute_start: 23,
            night_mute_end: 7,
            autostart: false,
            sit_reminder_min: 60,
            water_reminder_min: 90,
            chime_enabled: false,
            simple_passthrough: false,
            music_dir: None,
            llm_enabled: false,
            llm_endpoint: None,
            llm_key: None,
            llm_model: None,
            line_types: vec!["real".into(), "adapted".into(), "original".into()],
            skin_dir: None,
            spring_festival: Some("02-17".into()),
            concert_date: None,
            schedules: vec![],
        }
    }
}

impl Config {
    pub fn load() -> Self {
        let p = data_dir().join("config.json");
        fs::read_to_string(p)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    /// 原子写入（tmp + rename）。
    pub fn save(&self) {
        let p = data_dir().join("config.json");
        let tmp = data_dir().join(".config.json.tmp");
        if let Ok(json) = serde_json::to_string_pretty(self) {
            if fs::write(&tmp, json).is_ok() {
                let _ = fs::rename(&tmp, &p);
            }
        }
    }
}

/// 通用 key-value 数据（affinity / user_lines / weather 等由前端结构化使用）。
pub fn get_kv(key: &str) -> Option<serde_json::Value> {
    if !key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
        return None;
    }
    let p = data_dir().join(format!("{key}.json"));
    let s = fs::read_to_string(p).ok()?;
    serde_json::from_str(&s).ok()
}

pub fn set_kv(key: &str, value: &serde_json::Value) -> Result<(), String> {
    if !key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
        return Err("invalid key".into());
    }
    let p = data_dir().join(format!("{key}.json"));
    let tmp = data_dir().join(format!(".{key}.json.tmp"));
    let json = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &p).map_err(|e| e.to_string())
}

pub fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// ---------------- 聊天历史 ----------------

pub const CHAT_KEY: &str = "chat_history";
/// 历史上限（条），超出丢最旧。1000 条 ≈ 500 轮对话，约 150-300KB。
pub const CHAT_MAX: usize = 1000;

/// 一条聊天记录。
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ChatEntry {
    pub role: String, // "user" | "pet"
    pub text: String,
    pub ts: u64,     // epoch 毫秒
    pub src: String, // "llm" | "offline"
}

impl ChatEntry {
    pub fn valid(&self) -> bool {
        matches!(self.role.as_str(), "user" | "pet" | "sys")
            && !self.text.trim().is_empty()
            && self.ts > 0
    }
}

/// 容错解析（纯函数）：非数组→空；坏条目跳过；净化 role/text/ts。
pub fn parse_chat(v: serde_json::Value) -> Vec<ChatEntry> {
    v.as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|e| serde_json::from_value::<ChatEntry>(e.clone()).ok())
                .filter(ChatEntry::valid)
                .collect()
        })
        .unwrap_or_default()
}

pub fn load_chat() -> Vec<ChatEntry> {
    get_kv(CHAT_KEY).map(parse_chat).unwrap_or_default()
}

/// 超上限丢最旧（纯函数，便于单测）。
pub fn trim_to_max(mut v: Vec<ChatEntry>, max: usize) -> Vec<ChatEntry> {
    if v.len() > max {
        v.drain(0..v.len() - max);
    }
    v
}

/// 前端上报的命中区：窗口内 CSS 像素矩形 + 32x32 不透明网格（可空）。
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HitRegion {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    pub grid: Option<Vec<bool>>,
}

/// 全局共享状态。
pub struct AppState {
    pub cfg: std::sync::RwLock<Config>,
    pub hit_regions: std::sync::Mutex<Vec<HitRegion>>,
    /// 点击穿透 override：-1 自动 / 0 强制接收 / 1 强制穿透
    pub passthrough_override: std::sync::atomic::AtomicI8,
    /// 上次 set_ignore_cursor_events 的值（去抖）
    pub last_pass: std::sync::atomic::AtomicBool,
    pub tts: crate::tts::Tts,
    pub sfx: crate::sfx::Sfx,
    /// 聊天历史读-改-写串行锁（append/clear 共用）
    pub chat_lock: std::sync::Mutex<()>,
}

impl AppState {
    pub fn load() -> Self {
        Self {
            cfg: std::sync::RwLock::new(Config::load()),
            hit_regions: std::sync::Mutex::new(vec![]),
            passthrough_override: std::sync::atomic::AtomicI8::new(-1),
            last_pass: std::sync::atomic::AtomicBool::new(false),
            tts: crate::tts::Tts::new(),
            sfx: crate::sfx::Sfx::new(),
            chat_lock: std::sync::Mutex::new(()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(role: &str, text: &str, ts: u64) -> ChatEntry {
        ChatEntry {
            role: role.into(),
            text: text.into(),
            ts,
            src: "llm".into(),
        }
    }

    #[test]
    fn parse_chat_sanitizes() {
        let v = serde_json::json!([
            {"role": "user", "text": "hi", "ts": 1, "src": "llm"},
            {"role": "pet", "text": "  ", "ts": 2, "src": "llm"},   // 空白文本 → 丢
            {"role": "hack", "text": "x", "ts": 3, "src": "llm"},   // 非法 role → 丢
            {"role": "pet", "text": "ok", "ts": 0, "src": "llm"},   // ts=0 → 丢
            "garbage",                                                // 非对象 → 丢
            {"role": "sys", "text": "new-chat", "ts": 8, "src": "sys"}, // 会话标记 → 保留
            {"role": "pet", "text": "你好", "ts": 9, "src": "offline"}
        ]);
        let out = parse_chat(v);
        assert_eq!(out.len(), 3);
        assert_eq!(out[0].text, "hi");
        assert_eq!(out[1].role, "sys");
        assert_eq!(out[2].src, "offline");
    }

    #[test]
    fn parse_chat_tolerates_non_array() {
        assert!(parse_chat(serde_json::json!("not an array")).is_empty());
        assert!(parse_chat(serde_json::json!([1, 2, 3])).is_empty());
    }

    #[test]
    fn trim_keeps_newest() {
        let v: Vec<ChatEntry> = (0..1005)
            .map(|i| entry("user", &format!("m{i}"), i as u64))
            .collect();
        let out = trim_to_max(v, CHAT_MAX);
        assert_eq!(out.len(), CHAT_MAX);
        assert_eq!(out.first().unwrap().text, "m5"); // 最旧的 m0-m4 被丢
        assert_eq!(out.last().unwrap().text, "m1004");
    }

    #[test]
    fn chat_entry_serde_roundtrip() {
        let e = entry("pet", "嘻嘻", 1700000000000);
        let s = serde_json::to_value(&e).unwrap();
        assert_eq!(s["ts"], 1700000000000u64);
        let back: ChatEntry = serde_json::from_value(s).unwrap();
        assert_eq!(back.text, "嘻嘻");
        assert_eq!(back.role, "pet");
    }
}
