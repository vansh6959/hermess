param([string]$ProcessName,[int]$X,[int]$Y)
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public static class IO {
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, IntPtr e);
}
"@
$p = Get-Process $ProcessName -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { Write-Output "NOTFOUND"; exit 1 }
$h = $p.MainWindowHandle
[void][IO]::ShowWindow($h, 9)
[void][IO]::BringWindowToTop($h)
[void][IO]::SetForegroundWindow($h)
Start-Sleep -Milliseconds 250
[void][IO]::SetCursorPos($X, $Y)
Start-Sleep -Milliseconds 80
$t = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
[IO]::mouse_event(0x0002, 0, 0, 0, [IntPtr]::Zero)
Start-Sleep -Milliseconds 45
[IO]::mouse_event(0x0004, 0, 0, 0, [IntPtr]::Zero)
Write-Output "CLICKAT=$t"
