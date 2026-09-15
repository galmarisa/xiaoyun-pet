//! macOS 使用 afplay；Windows 使用原生音频设备，停止时释放文件和设备。
use std::path::Path;
use std::process::Child;

pub enum Playback {
    Process(Child),
    #[cfg(target_os = "windows")]
    Native {
        stop: std::sync::mpsc::Sender<()>,
        worker: Option<std::thread::JoinHandle<()>>,
    },
}

impl Drop for Playback {
    fn drop(&mut self) {
        match self {
            Self::Process(child) => {
                let _ = child.kill();
                let _ = child.wait();
            }
            #[cfg(target_os = "windows")]
            Self::Native { stop, worker } => {
                let _ = stop.send(());
                if let Some(worker) = worker.take() {
                    let _ = worker.join();
                }
            }
        }
    }
}

pub fn volume(value: f64) -> f64 {
    if value.is_finite() {
        value.clamp(0.0, 1.0)
    } else {
        1.0
    }
}

#[cfg(target_os = "macos")]
pub fn play(path: &Path, gain: f64) -> Result<Playback, String> {
    crate::process::command("afplay")
        .args(["-v", &volume(gain).to_string()])
        .arg(path)
        .spawn()
        .map(Playback::Process)
        .map_err(|e| format!("音频播放失败: {e}"))
}

#[cfg(target_os = "windows")]
pub fn play(path: &Path, gain: f64) -> Result<Playback, String> {
    use std::sync::mpsc;
    let path = path.to_owned();
    let (stop, stopped) = mpsc::channel();
    let (ready, result) = mpsc::sync_channel(1);
    let worker = std::thread::spawn(move || {
        let open = || -> Result<_, String> {
            let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
            let source = rodio::Decoder::try_from(file).map_err(|e| e.to_string())?;
            let stream = rodio::OutputStreamBuilder::open_default_stream()
                .map_err(|e| format!("无法打开音频设备: {e}"))?;
            let sink = rodio::Sink::connect_new(stream.mixer());
            sink.set_volume(volume(gain) as f32);
            sink.append(source);
            Ok((stream, sink))
        };
        match open() {
            Ok((_stream, sink)) => {
                let _ = ready.send(Ok(()));
                while !sink.empty() {
                    match stopped.recv_timeout(std::time::Duration::from_millis(30)) {
                        Err(mpsc::RecvTimeoutError::Timeout) => {}
                        _ => break,
                    }
                }
                sink.stop();
            }
            Err(e) => {
                let _ = ready.send(Err(e));
            }
        }
    });
    let playback = Playback::Native {
        stop,
        worker: Some(worker),
    };
    result.recv().map_err(|e| e.to_string())??;
    Ok(playback)
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn play(_path: &Path, _gain: f64) -> Result<Playback, String> {
    Err("暂不支持此平台的音频播放".into())
}

#[cfg(test)]
mod tests {
    #[test]
    fn volume_is_safe_for_audio_device() {
        assert_eq!(super::volume(-0.2), 0.0);
        assert_eq!(super::volume(1.2), 1.0);
        assert_eq!(super::volume(f64::NAN), 1.0);
        assert_eq!(super::volume(0.4), 0.4);
    }
}
