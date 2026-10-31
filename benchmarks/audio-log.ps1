param(
  [string]$Out = "$env:TEMP\audio-meter.log",
  [int]$Seconds = 60,
  [int]$IntervalMs = 25
)
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
public class MMDeviceEnumeratorComObject { }
[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDeviceEnumerator {
  int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
  int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
}
[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDevice {
  int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
}
[ComImport, Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IAudioMeterInformation {
  int GetPeakValue(out float pfPeak);
}
public static class Peak {
  public static string Read() {
    try {
      var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorComObject();
      IMMDevice device;
      int hr = enumerator.GetDefaultAudioEndpoint(0, 0, out device);
      if (hr != 0 || device == null) return "err";
      Guid iid = typeof(IAudioMeterInformation).GUID;
      object obj;
      hr = device.Activate(ref iid, 23, IntPtr.Zero, out obj);
      if (hr != 0 || obj == null) return "err";
      float peak;
      hr = ((IAudioMeterInformation)obj).GetPeakValue(out peak);
      if (hr != 0) return "err";
      return peak.ToString("F6");
    } catch { return "err"; }
  }
}
"@
$writer = New-Object System.IO.StreamWriter($Out, $false)
$writer.AutoFlush = $true
$writer.WriteLine("READY")
$end = (Get-Date).AddSeconds($Seconds)
while ((Get-Date) -lt $end) {
  $t = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $writer.WriteLine("$t $([Peak]::Read())")
  Start-Sleep -Milliseconds $IntervalMs
}
$writer.Close()
