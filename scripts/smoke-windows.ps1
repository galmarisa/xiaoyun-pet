# A hosted Windows desktop can check startup/window styles, but is not a listening test.
param([Parameter(Mandatory)][string]$Exe, [Parameter(Mandatory)][string]$OutputDir)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class PetWindow {
    public delegate bool EnumProc(IntPtr hwnd, IntPtr param);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc proc, IntPtr param);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hwnd, int index);
}
'@
$exePath = (Resolve-Path $Exe).Path
New-Item -ItemType Directory -Force $OutputDir | Out-Null
$output = (Resolve-Path $OutputDir).Path
$process = Start-Process -FilePath $exePath -PassThru -RedirectStandardError "$output/stderr.log" -RedirectStandardOutput "$output/stdout.log"
try {
    $script:petHandle = [IntPtr]::Zero
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        if ($process.HasExited) { throw "App exited early: $($process.ExitCode)" }
        [PetWindow]::EnumWindows({
            param($hwnd, $unused)
            [uint32]$ownerId = 0
            [void][PetWindow]::GetWindowThreadProcessId($hwnd, [ref]$ownerId)
            if ($ownerId -eq $process.Id -and [PetWindow]::IsWindowVisible($hwnd)) {
                $script:petHandle = $hwnd
                return $false
            }
            return $true
        }, [IntPtr]::Zero) | Out-Null
        if ($script:petHandle -ne [IntPtr]::Zero) { break }
        Start-Sleep -Seconds 1
    }
    if ($script:petHandle -eq [IntPtr]::Zero) { throw 'No visible app window within 60 seconds.' }
    Start-Sleep -Seconds 10
    if ($process.HasExited) { throw 'App crashed after creating its window.' }
    $style = [PetWindow]::GetWindowLong($script:petHandle, -16)
    $extended = [PetWindow]::GetWindowLong($script:petHandle, -20)
    if (($style -band 0x00C00000) -ne 0) { throw 'Pet window unexpectedly has a title bar.' }
    if (($extended -band 0x00000008) -eq 0) { throw 'Pet window is not always-on-top.' }
    $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
    $bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
        $bitmap.Save("$output/desktop.png", [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
        $graphics.Dispose()
        $bitmap.Dispose()
    }
    @{ startup = 'passed'; borderless = $true; alwaysOnTop = $true; pid = $process.Id;
       note = 'Screenshot requires visual review; real audio and mixed-DPI interaction require a desktop acceptance test.'
    } | ConvertTo-Json | Set-Content "$output/result.json" -Encoding utf8
} finally {
    if (!$process.HasExited) { Stop-Process -Id $process.Id -Force }
}
