//! TTS 双后端：
//! - system：macOS `say`（音量 < 0.95 时 aiff + afplay 两段式）
//! - custom：OpenAI /v1/audio/speech 兼容协议——为"自己训练的音色"预留的接口，
//!   GPT-SoVITS / OpenedAI-Speech / CosyVoice-API / 云厂商兼容端点均可接入。
//!   合成 wav → afplay 播放；失败静默（不回退系统音色，避免预期外出声）。

use crate::store::{self, Config};
use std::process::{Child, Command};
use std::sync::Mutex;

pub struct Tts {
    child: Mutex<Option<Child>>,
}

impl Tts {
    pub fn new() -> Self {
        Self {
            child: Mutex::new(None),
        }
    }

    pub fn speak(&self, cfg: &Config, text: &str) {
        self.stop();
        let text: String = text.chars().take(120).collect();
        if cfg.tts_mode == "custom" {
            self.speak_custom(cfg, &text);
        } else {
            self.speak_system(cfg, &text);
        }
    }

    /// 系统音色：say（-r 语速；音量 <0.95 经 aiff+afplay）。
    fn speak_system(&self, cfg: &Config, text: &str) {
        let voice = cfg.tts_voice.as_str();
        let rate = cfg.tts_rate.to_string();
        if (0.0..0.95).contains(&cfg.tts_volume) {
            let tmp = std::env::temp_dir().join("xiaoyun-tts.aiff");
            let ok = Command::new("say")
                .args(["-v", voice, "-r", &rate, "-o"])
                .arg(&tmp)
                .arg(text)
                .status()
                .map(|s| s.success())
                .unwrap_or(false);
            if ok {
                if let Ok(c) = Command::new("afplay")
                    .args(["-v", &format!("{:.2}", cfg.tts_volume)])
                    .arg(&tmp)
                    .spawn()
                {
                    *self.child.lock().unwrap() = Some(c);
                }
            }
        } else if let Ok(c) = Command::new("say")
            .args(["-v", voice, "-r", &rate])
            .arg(text)
            .spawn()
        {
            *self.child.lock().unwrap() = Some(c);
        }
    }

    /// 自定义音色：POST {endpoint}/v1/audio/speech → wav → afplay。
    fn speak_custom(&self, cfg: &Config, text: &str) {
        let Some(endpoint) = cfg
            .tts_endpoint
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
        else {
            eprintln!("[tts] custom 模式未配置端点");
            return;
        };
        let url = format!("{}/v1/audio/speech", endpoint.trim_end_matches('/'));
        let speed = (cfg.tts_rate.max(80) as f64 / 190.0 * 100.0).round() / 100.0;
        let model = cfg
            .tts_model
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("default");
        let body = serde_json::json!({
            "model": model,
            "input": text,
            "response_format": "wav",
            "speed": speed,
        })
        .to_string();

        let out = store::data_dir().join("tts-out.wav");
        let mut cmd = Command::new("curl");
        cmd.args([
            "-s",
            "--max-time",
            "15",
            "-X",
            "POST",
            "-H",
            "Content-Type: application/json",
            "-d",
            &body,
            "-o",
        ])
        .arg(&out)
        .arg(&url);
        if let Some(k) = cfg
            .tts_key
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            cmd.args(["-H", &format!("Authorization: Bearer {k}")]);
        }
        let _ = cmd.status();

        // 校验：空文件或 JSON 错误体视为失败
        match std::fs::metadata(&out).map(|m| m.len()) {
            Ok(n) if n > 4 => {
                let mut head = [0u8; 1];
                let is_json = std::fs::File::open(&out)
                    .and_then(|mut f| std::io::Read::read_exact(&mut f, &mut head))
                    .map(|_| head[0] == b'{')
                    .unwrap_or(false);
                if is_json {
                    let snippet =
                        std::fs::read_to_string(&out).unwrap_or_default();
                    eprintln!(
                        "[tts] 自定义音色返回错误: {}",
                        &snippet[..snippet.len().min(120)]
                    );
                    return;
                }
            }
            _ => {
                eprintln!("[tts] 自定义音色合成失败（空响应）: {endpoint}");
                return;
            }
        }

        let mut play = Command::new("afplay");
        play.arg(&out);
        if (0.0..0.95).contains(&cfg.tts_volume) {
            play.args(["-v", &format!("{:.2}", cfg.tts_volume)]);
        }
        if let Ok(c) = play.spawn() {
            *self.child.lock().unwrap() = Some(c);
        }
    }

    pub fn stop(&self) {
        if let Some(mut c) = self.child.lock().unwrap().take() {
            let _ = c.kill();
            let _ = c.wait();
        }
    }
}

impl Drop for Tts {
    fn drop(&mut self) {
        self.stop();
    }
}
