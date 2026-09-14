//! 天气：curl wttr.in（零额外依赖），本地缓存 30 分钟。

use crate::store;
use serde_json::{json, Value};
use std::process::Command;

pub fn fetch(force: bool) -> Result<Value, String> {
    let cache = store::data_dir().join("weather.json");
    if !force && cache.exists() {
        if let Ok(s) = std::fs::read_to_string(&cache) {
            if let Ok(j) = serde_json::from_str::<Value>(&s) {
                let fetched = j
                    .get("fetched_at")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0);
                if store::now_secs().saturating_sub(fetched) < 1800 {
                    return Ok(j);
                }
            }
        }
    }

    let out = Command::new("curl")
        .args(["-s", "--max-time", "8", "https://wttr.in/?format=j1"])
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err("weather request failed".into());
    }
    let body = String::from_utf8_lossy(&out.stdout);
    let j: Value = serde_json::from_str(&body).map_err(|e| e.to_string())?;
    let current = j
        .pointer("/current_condition/0")
        .cloned()
        .ok_or("no current_condition")?;
    let wrapped = json!({ "fetched_at": store::now_secs(), "current": current });
    if let Ok(s) = serde_json::to_string(&wrapped) {
        let _ = std::fs::write(&cache, s);
    }
    Ok(wrapped)
}

/// weatherCode（WWO）→ 语义条件（前端映射中文与角色反应）。
pub fn condition(code: i64) -> &'static str {
    match code {
        113 => "sunny",
        116 => "partly",
        119 | 122 | 143 | 248 | 260 => "cloudy",
        176 | 200 | 263 | 266 | 281 | 284 | 293 | 296 | 299 | 302 | 305 | 308
        | 311 | 314 | 317 | 350 | 353 | 356 | 359 | 386 | 389 => "rain",
        179 | 182 | 185 | 226 | 227 | 229 | 230 | 320 | 323 | 326 | 329 | 332
        | 335 | 338 | 341 | 344 | 362 | 365 | 368 | 371 | 374 | 377 | 392
        | 395 => "snow",
        _ => "unknown",
    }
}
