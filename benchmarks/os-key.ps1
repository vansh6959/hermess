param([string]$Text,[switch]$SelectAll,[switch]$Enter)
Add-Type -AssemblyName System.Windows.Forms
if ($SelectAll) { [System.Windows.Forms.SendKeys]::SendWait('^a'); Start-Sleep -Milliseconds 80 }
if ($Text) { Set-Clipboard -Value $Text; Start-Sleep -Milliseconds 80; [System.Windows.Forms.SendKeys]::SendWait('^v'); Start-Sleep -Milliseconds 120 }
if ($Enter) { [System.Windows.Forms.SendKeys]::SendWait('{ENTER}') }
Write-Output "SENT"
