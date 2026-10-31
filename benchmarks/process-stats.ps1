param([string]$ProcessName)
$procs = @(Get-Process $ProcessName -ErrorAction SilentlyContinue)
$cpu = if ($procs.Count -gt 0) { ($procs | Measure-Object CPU -Sum).Sum } else { 0 }
$ram = if ($procs.Count -gt 0) { ($procs | Measure-Object WorkingSet64 -Sum).Sum } else { 0 }
$private = if ($procs.Count -gt 0) { ($procs | Measure-Object PrivateMemorySize64 -Sum).Sum } else { 0 }
@{
  at = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  processCount = $procs.Count
  cpuSeconds = [Math]::Round([double]$cpu, 2)
  workingSetMb = [Math]::Round([double]$ram / 1MB, 1)
  privateMb = [Math]::Round([double]$private / 1MB, 1)
} | ConvertTo-Json -Compress
