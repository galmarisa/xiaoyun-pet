//! 系统朗读：macOS say / Windows System.Speech；自定义音色共用音频播放层。
use crate::{
    audio::{self, Playback},
    process::command,
    store::Config,
};
use std::sync::Mutex;

#[derive(serde::Serialize, serde::Deserialize)]
pub struct Voice {
    pub id: String,
    pub label: String,
}

// 播放器先释放文件句柄，临时目录随后清理（Windows 不允许删除打开的文件）。
struct Speech {
    _playback: Playback,
    _temp: Option<tempfile::TempDir>,
}

pub struct Tts {
    speech: Mutex<Option<Speech>>,
}

impl Tts {
    pub fn new() -> Self {
        Self {
            speech: Mutex::new(None),
        }
    }

    pub fn speak(&self, cfg: &Config, text: &str) -> Result<(), String> {
        let mut active = self.speech.lock().unwrap();
        *active = None;
        let text: String = text.chars().take(120).collect();
        if text.trim().is_empty() || audio::volume(cfg.tts_volume) == 0.0 {
            return Ok(());
        }
        *active = Some(if cfg.tts_mode == "custom" {
            speak_custom(cfg, &text)?
        } else {
            speak_system(cfg, &text)?
        });
        Ok(())
    }

    pub fn stop(&self) {
        *self.speech.lock().unwrap() = None;
    }
}

fn temp_dir() -> Result<tempfile::TempDir, String> {
    tempfile::Builder::new()
        .prefix("xiaoyun-tts-")
        .tempdir()
        .map_err(|e| e.to_string())
}

#[cfg(target_os = "macos")]
fn speak_system(cfg: &Config, text: &str) -> Result<Speech, String> {
    let rate = cfg.tts_rate.clamp(80, 400).to_string();
    let mut say = command("say");
    // auto uses the system's default voice; preserve existing named macOS voices.
    if !cfg.tts_voice.is_empty() && cfg.tts_voice != "auto" {
        say.args(["-v", &cfg.tts_voice]);
    }
    say.args(["-r", &rate]);
    if audio::volume(cfg.tts_volume) < 0.95 {
        let temp = temp_dir()?;
        let path = temp.path().join("speech.aiff");
        let out = say
            .arg("-o")
            .arg(&path)
            .arg("--")
            .arg(text)
            .output()
            .map_err(|e| e.to_string())?;
        if !out.status.success() {
            return Err(String::from_utf8_lossy(&out.stderr).trim().into());
        }
        Ok(Speech {
            _playback: audio::play(&path, cfg.tts_volume)?,
            _temp: Some(temp),
        })
    } else {
        Ok(Speech {
            _playback: Playback::Process(
                say.arg("--").arg(text).spawn().map_err(|e| e.to_string())?,
            ),
            _temp: None,
        })
    }
}

#[cfg(target_os = "windows")]
fn windows_speech(request: serde_json::Value) -> Result<Vec<u8>, String> {
    use std::io::Write;
    use std::process::Stdio;
    let mut child = command("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            include_str!("windows-speech.ps1"),
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("无法启动系统朗读: {e}"))?;
    let write = child
        .stdin
        .take()
        .unwrap()
        .write_all(request.to_string().as_bytes());
    if let Err(e) = write {
        let _ = child.kill();
        let _ = child.wait();
        return Err(e.to_string());
    }
    let out = child.wait_with_output().map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(format!(
            "系统朗读失败: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    Ok(out.stdout)
}

#[cfg(target_os = "windows")]
fn synthesize_windows(cfg: &Config, text: &str, path: &std::path::Path) -> Result<(), String> {
    windows_speech(serde_json::json!({
        "operation": "synthesize", "voice": cfg.tts_voice, "rate": cfg.tts_rate,
        "text": text, "path": path,
    }))?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn speak_system(cfg: &Config, text: &str) -> Result<Speech, String> {
    let temp = temp_dir()?;
    let path = temp.path().join("speech.wav");
    synthesize_windows(cfg, text, &path)?;
    Ok(Speech {
        _playback: audio::play(&path, cfg.tts_volume)?,
        _temp: Some(temp),
    })
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn speak_system(_cfg: &Config, _text: &str) -> Result<Speech, String> {
    Err("暂不支持此平台的系统朗读".into())
}

pub fn voices() -> Result<Vec<Voice>, String> {
    let mut voices = vec![Voice {
        id: "auto".into(),
        label: "自动选择系统音色".into(),
    }];
    #[cfg(target_os = "windows")]
    voices.extend(
        serde_json::from_slice::<Vec<Voice>>(&windows_speech(
            serde_json::json!({ "operation": "voices" }),
        )?)
        .map_err(|e| e.to_string())?,
    );
    #[cfg(target_os = "macos")]
    {
        let out = command("say")
            .args(["-v", "?"])
            .output()
            .map_err(|e| e.to_string())?;
        if !out.status.success() {
            return Err("无法读取系统音色".into());
        }
        for line in String::from_utf8_lossy(&out.stdout).lines() {
            // e.g. "Tingting            zh_CN    # ..."; names may contain spaces.
            let head = line.split('#').next().unwrap_or("").trim();
            if let Some((name, locale)) = head.rsplit_once(char::is_whitespace) {
                let name = name.trim();
                voices.push(Voice {
                    id: name.into(),
                    label: format!("{name} ({locale})"),
                });
            }
        }
    }
    Ok(voices)
}

fn speak_custom(cfg: &Config, text: &str) -> Result<Speech, String> {
    let endpoint = cfg
        .tts_endpoint
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or("自定义音色未配置端点")?;
    let url = format!("{}/v1/audio/speech", endpoint.trim_end_matches('/'));
    let model = cfg
        .tts_model
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("default");
    let body = serde_json::json!({
        "model": model, "input": text, "response_format": "wav",
        "speed": (cfg.tts_rate as f64 / 190.0).clamp(0.25, 4.0),
    })
    .to_string();
    let temp = temp_dir()?;
    let path = temp.path().join("speech.wav");
    let mut curl = command("curl");
    curl.args([
        "-sS",
        "--fail",
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
    .arg(&path)
    .arg(&url);
    if let Some(key) = cfg
        .tts_key
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        curl.args(["-H", &format!("Authorization: Bearer {key}")]);
    }
    let out = curl.output().map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(format!(
            "音色合成失败: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    validate_wav(&bytes)?;
    Ok(Speech {
        _playback: audio::play(&path, cfg.tts_volume)?,
        _temp: Some(temp),
    })
}

fn validate_wav(bytes: &[u8]) -> Result<(), String> {
    if bytes.len() < 12 || &bytes[..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return Err("音色接口未返回有效的 WAV 音频".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_error_bodies_instead_of_playing_stale_audio() {
        for bytes in [
            &b""[..],
            &b"{\"error\":\"failed\"}"[..],
            &b"<html>error</html>"[..],
        ] {
            assert!(validate_wav(bytes).is_err());
        }
        assert!(validate_wav(b"RIFF\x04\x00\x00\x00WAVE").is_ok());
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_speech_synthesizes_unicode_to_decodable_wav_without_speakers() {
        use rodio::Source;
        let temp = temp_dir().unwrap();
        let path = temp.path().join("小云 ' test.wav");
        let cfg = Config {
            tts_voice: "auto".into(),
            ..Config::default()
        };
        assert!(voices().unwrap().len() > 1);
        synthesize_windows(&cfg, "你好，小云。 Quotes: ' \" $(not-a-command)", &path).unwrap();
        validate_wav(&std::fs::read(&path).unwrap()).unwrap();
        let mut decoded = rodio::Decoder::try_from(std::fs::File::open(path).unwrap()).unwrap();
        assert!(decoded.sample_rate() > 0);
        assert!(decoded.any(|s| s != 0.0));
    }
}
