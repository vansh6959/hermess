param([string]$ProcessName)
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public static class W {
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref POINT p);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  public struct RECT { public int Left, Top, Right, Bottom; }
  public struct POINT { public int X, Y; }
}
"@
$p = Get-Process $ProcessName -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { Write-Output "NOTFOUND"; exit 1 }
$h = $p.MainWindowHandle
[void][W]::ShowWindow($h, 9)
[void][W]::BringWindowToTop($h)
[void][W]::SetForegroundWindow($h)
Start-Sleep -Milliseconds 400
$cr = New-Object W+RECT; [void][W]::GetClientRect($h, [ref]$cr)
$wr = New-Object W+RECT; [void][W]::GetWindowRect($h, [ref]$wr)
$pt = New-Object W+POINT; $pt.X = 0; $pt.Y = 0; [void][W]::ClientToScreen($h, [ref]$pt)
"PROCESS=$ProcessName PID=$($p.Id) HWND=$h TITLE=$($p.MainWindowTitle) CLIENT=$($pt.X),$($pt.Y),$($cr.Right),$($cr.Bottom) WINDOW=$($wr.Left),$($wr.Top),$($wr.Right),$($wr.Bottom) ZOOMED=$([W]::IsZoomed($h)) FOREGROUND=$([W]::GetForegroundWindow() -eq $h)"
