using System.Diagnostics;
using OhMatrix.Core.State;
using OhMatrix.Infra.Logging;

namespace OhMatrix.Desktop;

/// <summary>
/// Tells of new messages through the notifications of the desktop: <c>notify-send</c> on Linux, <c>osascript</c> on macOS and a balloon of the
/// notification area on Windows. The text is passed as arguments or environment variables, never as part of a script. A message of the chat that is
/// open in the window the person is looking at is not announced.
/// </summary>
internal sealed class DesktopNotifier(
    Func<bool> windowActive,
    Action<string>? open = null)
    : INotifier {
    private static readonly Logger logger = Logger.GetDefault();

    public void Notify(Notification notification)
    {
        if (notification.RoomIsOpen && windowActive())
            return;
        try {
            var start = Make(notification.Title, notification.Body);
            if (start == null)
                return;
            // On Linux the program waits for the notification to be closed and says which action was pressed: a press on it opens the chat.
            if (open != null && OperatingSystem.IsLinux())
                _ = Await(start, notification.RoomId);
            else
                Process.Start(start)?.Dispose();
        } catch (Exception e) {
            logger.Caught("show a notification", e);
            // No notification program: the message is in the chat list all the same.
        }
    }

    private async Task Await(ProcessStartInfo start, string roomId)
    {
        try {
            start.RedirectStandardOutput = true;
            using var process = Process.Start(start);
            if (process == null)
                return;
            var answer = await process.StandardOutput.ReadLineAsync();
            if (answer?.Trim() == "default")
                open!(roomId);
        } catch (Exception e) {
            logger.Caught("read the answer of a notification", e);
            // No notification program, or it ended without an answer.
        }
    }

    private static ProcessStartInfo? Make(string title, string body)
    {
        ProcessStartInfo info;
        if (OperatingSystem.IsLinux()) {
            info = new ProcessStartInfo("notify-send");
            info.ArgumentList.Add("--app-name=OhMatrix");
            info.ArgumentList.Add("--action=default=Open");
            info.ArgumentList.Add("--wait");
            info.ArgumentList.Add("--");
            info.ArgumentList.Add(title);
            info.ArgumentList.Add(body);
        } else if (OperatingSystem.IsMacOS()) {
            info = new ProcessStartInfo("osascript");
            info.ArgumentList.Add("-e");
            info.ArgumentList.Add("on run argv");
            info.ArgumentList.Add("-e");
            info.ArgumentList.Add(
                "display notification (item 1 of argv) with title (item 2 of argv)");
            info.ArgumentList.Add("-e");
            info.ArgumentList.Add("end run");
            info.ArgumentList.Add(body);
            info.ArgumentList.Add(title);
        } else if (OperatingSystem.IsWindows()) {
            info = new ProcessStartInfo("powershell");
            info.ArgumentList.Add("-NoProfile");
            info.ArgumentList.Add("-WindowStyle");
            info.ArgumentList.Add("Hidden");
            info.ArgumentList.Add("-Command");
            info.ArgumentList.Add(
                "Add-Type -AssemblyName System.Windows.Forms; $n = New-Object System.Windows.Forms.NotifyIcon; "
                + "$n.Icon = [System.Drawing.SystemIcons]::Information; $n.Visible = $true; "
                + "$n.ShowBalloonTip(5000, $env:OHM_TITLE, $env:OHM_BODY, 'None'); Start-Sleep -Seconds 6; $n.Dispose()");
            info.Environment["OHM_TITLE"] = title;
            info.Environment["OHM_BODY"] = body;
        } else
            return null;

        info.UseShellExecute = false;
        info.CreateNoWindow = true;
        return info;
    }
}
