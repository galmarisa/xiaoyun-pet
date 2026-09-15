# Embedded by Rust. All user data comes from JSON on stdin, never executable code.
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
Add-Type -AssemblyName System.Speech
$speech = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $voices = @($speech.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { $_.VoiceInfo })
    if ($request.operation -eq 'voices') {
        $items = @($voices | ForEach-Object {
            @{ id = $_.Name; label = "$($_.Name) ($($_.Culture.Name))" }
        })
        ConvertTo-Json -InputObject $items -Compress
    } elseif ($request.operation -eq 'synthesize') {
        if ($voices.Count -eq 0) { throw 'No system speech voices installed.' }
        # Existing macOS configurations remain usable when copied to Windows.
        if ($request.voice -and $request.voice -notin @('auto', 'Tingting', 'Meijia', 'Sinji')) {
            $speech.SelectVoice($request.voice)
        } else {
            $chinese = $voices | Where-Object { $_.Culture.Name -like 'zh-*' } | Select-Object -First 1
            if ($chinese) { $speech.SelectVoice($chinese.Name) }
        }
        $speech.Rate = [Math]::Max(-10, [Math]::Min(10, [int][Math]::Round(($request.rate - 190) / 20)))
        # Volume is applied by the native player after synthesis.
        $speech.SetOutputToWaveFile($request.path)
        $speech.Speak([string]$request.text)
    } else {
        throw 'Unknown speech operation.'
    }
} finally {
    $speech.Dispose()
}
