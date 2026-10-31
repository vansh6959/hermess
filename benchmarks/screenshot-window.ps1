param([string]$ProcessName,[string]$Out)
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public static class Shot {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
$p = Get-Process $ProcessName -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { Write-Output "NOSHOT"; exit 0 }
[void][Shot]::ShowWindow($p.MainWindowHandle, 9)
[void][Shot]::SetForegroundWindow($p.MainWindowHandle)
Start-Sleep -Milliseconds 350
$r = New-Object Shot+RECT
[void][Shot]::GetWindowRect($p.MainWindowHandle, [ref]$r)
$w = [Math]::Max(1, $r.Right - $r.Left)
$h = [Math]::Max(1, $r.Bottom - $r.Top)
$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)
try {
  $g.CopyFromScreen($r.Left, $r.Top, 0, 0, $bmp.Size)
} catch {
  Start-Sleep -Milliseconds 500
  try { $g.CopyFromScreen($r.Left, $r.Top, 0, 0, $bmp.Size) } catch { $g.Dispose(); $bmp.Dispose(); Write-Output "NOSHOT"; exit 0 }
}
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
"SHOT=$Out"
