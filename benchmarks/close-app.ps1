param([string]$ProcessName)
$procs = @(Get-Process $ProcessName -ErrorAction SilentlyContinue)
foreach ($p in ($procs | Where-Object { $_.MainWindowHandle -ne 0 })) {
  try { [void]$p.CloseMainWindow() } catch {}
}
Start-Sleep -Milliseconds 3500
Get-Process $ProcessName -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
$deadline = (Get-Date).AddSeconds(12)
while ((Get-Date) -lt $deadline) {
  $left = @(Get-Process $ProcessName -ErrorAction SilentlyContinue)
  if ($left.Count -eq 0) { break }
  Start-Sleep -Milliseconds 200
}
$left = @(Get-Process $ProcessName -ErrorAction SilentlyContinue)
"CLOSED remaining=$($left.Count)"
