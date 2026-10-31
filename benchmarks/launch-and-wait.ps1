param(
  [ValidateSet('spotify','hermes')][string]$App,
  [int]$TimeoutMs = 60000
)
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public static class Win {
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
if ($App -eq 'spotify') {
  $exe = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\Spotify.exe'
  $args = @('--remote-debugging-port=9223')
  $procName = 'Spotify'
  $wd = $env:LOCALAPPDATA
} else {
  $exe = 'C:\Users\Vansh\OneDrive\Desktop\hermes\release\Hermes-win32-x64\Hermes.exe'
  $args = @('--remote-debugging-port=9222')
  $procName = 'Hermes'
  $wd = 'C:\Users\Vansh\OneDrive\Desktop\hermes\release\Hermes-win32-x64'
  $env:ELECTRON_RUN_AS_NODE = ''
}
$launchAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
Start-Process -FilePath $exe -ArgumentList $args -WorkingDirectory $wd
$windowAt = $null
$windowPid = $null
$windowHwnd = $null
$windowTitle = ''
$rect = @()
$deadline = $launchAt + $TimeoutMs
while ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() -lt $deadline) {
  $p = Get-Process $procName -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  if ($p) {
    $r = New-Object Win+RECT
    if ([Win]::GetWindowRect($p.MainWindowHandle, [ref]$r) -and [Win]::IsWindowVisible($p.MainWindowHandle) -and ($r.Right - $r.Left) -gt 200 -and ($r.Bottom - $r.Top) -gt 100) {
      $windowAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
      $windowPid = $p.Id
      $windowHwnd = $p.MainWindowHandle.ToInt64()
      $windowTitle = $p.MainWindowTitle
      $rect = @($r.Left, $r.Top, $r.Right, $r.Bottom)
      break
    }
  }
  Start-Sleep -Milliseconds 20
}
$procs = @(Get-Process $procName -ErrorAction SilentlyContinue)
$cpu = if ($procs.Count -gt 0) { ($procs | Measure-Object CPU -Sum).Sum } else { 0 }
$ram = if ($procs.Count -gt 0) { ($procs | Measure-Object WorkingSet64 -Sum).Sum } else { 0 }
$private = if ($procs.Count -gt 0) { ($procs | Measure-Object PrivateMemorySize64 -Sum).Sum } else { 0 }
@{
  app = $App
  launchAt = $launchAt
  windowAt = $windowAt
  windowMs = if ($windowAt) { $windowAt - $launchAt } else { $null }
  pid = $windowPid
  hwnd = $windowHwnd
  title = $windowTitle
  rect = $rect
  processCount = $procs.Count
  cpuSeconds = [Math]::Round([double]$cpu, 2)
  workingSetMb = [Math]::Round([double]$ram / 1MB, 1)
  privateMb = [Math]::Round([double]$private / 1MB, 1)
} | ConvertTo-Json -Compress
