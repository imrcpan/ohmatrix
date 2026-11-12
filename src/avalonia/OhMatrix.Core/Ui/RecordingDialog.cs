using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.Audio;
using OhMatrix.Core.State;
using OhMatrix.Core.Ui.Appearance;
using OhMatrix.Core.Ui.Support;

namespace OhMatrix.Core.Ui;

/// <summary>
/// Recording a voice message or a short clip (<c>useVoiceRecording</c> and <c>VideoRecorderDialog</c>): the microphone (and camera) opens and
/// recording starts at once, a running clock is shown, and Send or Discard end it. A recording under half a second is not sent.
/// </summary>
public sealed class RecordingDialog {
    private readonly AppController controller;
    private readonly Dialog dialog = new();

    private readonly TextBlock clock = new() {
        FontSize = 28,
        FontFamily = Fonts.System,
        HorizontalAlignment = HorizontalAlignment.Center,
    };

    private readonly Avalonia.Threading.DispatcherTimer ticker = new() {
        Interval = TimeSpan.FromMilliseconds(200)
    };

    private MediaRecorder? recorder;
    private PrimaryButton? sendButton;

    public RecordingDialog(AppController controller)
    {
        this.controller = controller;
        Lifetime.OnRelease(this, Dispose);
        ticker.Tick += (_, _) => {
            if (recorder != null)
                clock.Text = Format.Duration(recorder.Elapsed);
        };
        dialog.OnClose = Discard;
    }

    public Dialog Dialog => dialog;
    public bool Recording => recorder is { Running: true };
    public PrimaryButton? SendButton => sendButton;

    /// <summary>Whether this machine can record sound, or a clip.</summary>
    public static bool Available(bool video) => MediaRecorder.Available(video);

    /// <summary>Opens the dialog and starts recording; why it could not start is shown in the dialog.</summary>
    public void Open(TopLevel window, bool video)
    {
        // Thrown away with its page: the microphone is not opened for nobody.
        if (retired)
            return;
        Discard();
        var c = ThemeScope.GetColors(window);
        var rec = new MediaRecorder(video);
        var notice = new TextBlock {
            FontSize = 14,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.Danger),
            TextWrapping = TextWrapping.Wrap,
            TextAlignment = TextAlignment.Center,
            IsVisible = false,
        };
        clock.Foreground = new SolidColorBrush(c.Danger);
        clock.Text = "● 0:00";
        sendButton = new PrimaryButton {
            Title = controller.T("record.send")
        };
        var cancel = new TextButton {
            Title = controller.T("record.cancel")
        };
        ThemeScope.SetColors(sendButton, c);
        ThemeScope.SetColors(cancel, c);
        sendButton.Click += async (_, _) => await Finish(rec);
        cancel.Click += (_, _) => dialog.Close();
        try {
            rec.Start();
            recorder = rec;
            ticker.Start();
        } catch (Exception) {
            rec.Cancel();
            notice.Text = controller.T(MediaRecorder.Available(video)
                ? "record.noDevice"
                : "record.unsupported");
            notice.IsVisible = true;
            sendButton.IsEnabled = false;
            clock.Text = "";
        }

        dialog.Show(window, c,
            controller.T(video ? "record.video" : "record.voice"), null,
            clock, notice,
            sendButton, cancel);
    }

    /// <summary>Ends the recording and sends it to the chat.</summary>
    public async Task Finish(MediaRecorder rec)
    {
        if (!ReferenceEquals(rec, recorder))
            return;
        recorder = null;
        ticker.Stop();
        var done = await rec.Stop();
        dialog.OnClose = null;
        dialog.Close();
        dialog.OnClose = Discard;
        if (done == null)
            return;
        Ops.Start("send recording");
        try {
            if (done.Duration >= TimeSpan.FromMilliseconds(500))
                await controller.SendAttachment(done.Path);
            Ops.Done("send recording");
        } catch (Exception e) {
            Ops.Fail("send recording", e);
            controller.ShowNotice(controller.T("record.unsupported"),
                NoticeKind.Error);
        } finally {
            try {
                File.Delete(done.Path);
            } catch (IOException) {
                // A file in the temporary folder that stays is only a little disk.
            }
        }
    }

    // The page that opened the dialog is thrown away: the recording stops
    // and the dialog, which hangs on the window and not on the page, goes.
    // Closing it by code does not call OnClose, so nothing else discards.
    private void Dispose()
    {
        dialog.OnClose = null;
        retired = true;
        Discard();
        dialog.Retire();
    }

    private bool retired;

    /// <summary>Throws a recording in progress away.</summary>
    public void Discard()
    {
        ticker.Stop();
        recorder?.Cancel();
        recorder = null;
    }
}
