# 从源码运行与打包

各平台的日常使用方式见 [README](../README.md#安装与使用)。本文面向需要修改代码或自行生成安装包的开发者。

## 开发环境

两个平台均需要 Node 22 和 Rust stable（cargo）。

- **macOS**：安装 Xcode Command Line Tools：`xcode-select --install`。
- **Windows 10/11**：安装 Visual Studio Build Tools 的“使用 C++ 的桌面开发”、Rust MSVC 工具链和 Microsoft Edge WebView2。网络功能需要 `curl.exe`；系统朗读需要 Windows PowerShell 5.1 / .NET Framework 的 System.Speech。

详细环境要求见 [Tauri 官方前置依赖](https://v2.tauri.app/start/prerequisites/)。Python 仅用于素材和台词处理，不是运行桌宠的必需依赖。

## 运行与打包

在项目根目录打开终端（Windows 可使用 PowerShell），执行：

```sh
cd app
npm ci
npm run dev
```

Windows 用户自行编译日常使用的可执行文件（在 `app` 目录的 PowerShell 中执行）：

```powershell
npm.cmd run build -- --no-bundle
Start-Process .\src-tauri\target\release\xiaoyun-pet.exe
```

此命令生成 `app/src-tauri/target/release/xiaoyun-pet.exe`，跳过安装程序打包。Windows 环境需事先安装 WebView2，详细操作见 [README 的 Windows 使用说明](../README.md#windows从源码编译运行)。

如果开发者需要自行生成应用包或安装程序：

```sh
npm run build
```

| 平台 | 构建产物 |
|---|---|
| macOS | `app/src-tauri/target/release/bundle/macos/小云桌宠.app` |
| Windows（自行打包安装程序） | `app/src-tauri/target/release/bundle/nsis/*-setup.exe` |

Tauri 自动合并对应平台的 `tauri.macos.conf.json` / `tauri.windows.conf.json`。安装包当前未做代码签名。

## 测试与平台验证

在 `app` 目录执行：

```sh
npm test
npm run check
cd src-tauri
cargo test --locked
```

[Desktop compatibility](../.github/workflows/desktop.yml) 工作流在 macOS 和 Windows runner 上分别测试、构建并上传产物。`main`、`master`、`codex/**` 分支的相关代码推送和 PR 会自动触发；工作流合入默认分支后也可手动运行。

成功运行后可从 GitHub Actions 的 Artifacts 下载应用包。Windows 的 `windows-smoke-evidence` 包含启动检查结果、截图及日志。具体覆盖范围和需要人工完成的桌面验收见 [平台验证说明](platform-validation.md)。

## 素材与台词重建

在项目根目录执行（Windows 上可将 `python3` 换为 `py -3`）：

```sh
python3 scripts/process_xiaoyun.py extra
python3 scripts/process_xiaoyun.py sheet
python3 scripts/build_lines.py
```

台词库构建依赖 `data/weibo/xiaoyun-alt/` 原始语料存档，仓库不含该目录。需要重建时，先按 [微博语料说明](../README.md#微博语料需自爬) 获取存档；直接运行已提交的应用素材与台词不需要这一步。

## 目录结构

```
├── app/                        # 桌宠应用（Tauri 2）
│   ├── ui/                     #   前端：静态 HTML/CSS/JS（无打包器，走 __TAURI__ 全局）
│   │   ├── assets/             #     精灵 PNG / lines.json / events.json / playlist.json / foods.json
│   │   └── js/                 #     状态机/台词引擎/调度器/互动/好感度/LLM…
│   └── src-tauri/              #   Rust：窗口/托盘/点击穿透轮询/TTS/天气/曲库扫描
├── img/xiaoyun/                # 角色素材（_orig/ 为原始导出）
├── scripts/                    # 素材处理管线 / 微博爬虫 / 台词库构建
├── data/weibo/xiaoyun-alt/     # 微博语料存档（不在仓库内，需自爬，见 README）
└── plan/                       # 素材规范 hello.md / 桌宠功能设计文档
```
