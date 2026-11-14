using Avalonia;
using Avalonia.Controls;
using Shape = Avalonia.Controls.Shapes.Path;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.Audio;
using OhMatrix.Core.State;
using OhMatrix.Core.Ui.Appearance;
using OhMatrix.Core.Ui.Overlays;
using OhMatrix.Core.Ui.Support;
using OhMatrix.Core.Ui.Widgets;
using OhMatrix.Infra.Logging;

namespace OhMatrix.Core.Ui.Chat.Composer;

/// <summary>
/// Recording a voice message or a short clip (<c>useVoiceRecording</c> and <c>VideoRecorderDialog</c>): the microphone (and camera) opens and
/// recording starts at once, a running clock is shown, and Send or Discard end it. A recording under half a second is not sent.
/// </summary>
public sealed class RecordingDialog {
    private static readonly Logger logger = Logger.GetDefault();

    private readonly AppController controller;
    private readonly Dialog dialog = new();

    private readonly TextBlock clock = new() {
        FontSize = 28,
        HorizontalAlignment = HorizontalAlignment.Center,
    };

    private readonly LevelMeter meter = new() {
        HorizontalAlignment = HorizontalAlignment.Center
    };

    private readonly Avalonia.Threading.DispatcherTimer ticker = new() {
        Interval = TimeSpan.FromMilliseconds(100)
    };

    private MediaRecorder? recorder;
    private PrimaryButton? sendButton;

    public RecordingDialog(AppController controller)
    {
        this.controller = controller;
        Lifetime.OnRelease(this, Dispose);
        ticker.Tick += (_, _) => {
            if (recorder == null)
                return;
            clock.Text = Format.Duration(recorder.Elapsed);
            meter.Add(recorder.Level());
        };
        dialog.OnClose = Discard;
    }

    public Dialog Dialog => dialog;
    public bool Recording => recorder is { Running: true };
    public PrimaryButton? SendButton => sendButton;

    /// <summary>Whether this machine can record sound, or a clip.</summary>
    public static bool Available(bool video) => MediaRecorder.Available(video);

    /// <summary>Opens the dialog and starts recording; why it could not start is shown in the dialog.</summary>
    public void Open(TopLevel window, bool video, Control? scope = null)
    {
        // Thrown away with its page: the microphone is not opened for nobody.
        if (retired)
            return;
        Discard();
        // The theme is set on the page, not on the window.
        var c = ThemeScope.GetColors(scope ?? window);
        var rec = new MediaRecorder(video);
        var notice = new TextBlock {
            FontSize = 14,
            Foreground = new SolidColorBrush(c.Danger),
            TextWrapping = TextWrapping.Wrap,
            TextAlignment = TextAlignment.Center,
            IsVisible = false,
        };
        clock.Foreground = new SolidColorBrush(video ? c.Danger : c.Text);
        clock.Text = video ? "● 0:00" : Format.Duration(TimeSpan.Zero);
        meter.Color = new SolidColorBrush(c.Accent);
        meter.Clear();
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
        } catch (Exception e) {
            logger.Exception("start a recording", e);
            rec.Cancel();
            notice.Text = controller.T(MediaRecorder.Available(video)
                ? "record.noDevice"
                : "record.unsupported");
            notice.IsVisible = true;
            sendButton.IsEnabled = false;
            clock.Text = "";
        }

        dialog.Glyph = video ? "video" : "mic";
        if (video) {
            dialog.Modal = false;
            dialog.Show(window, c, controller.T("record.video"),
                controller.T("record.body"),
                clock, notice,
                sendButton, cancel);
            return;
        }

        // A voice message: a large microphone with the loudness and the time
        // under it, and the two buttons as wide as the dialog, half each. A
        // press outside does not close it, as a recording is not to be lost
        // by one.
        var mic = Microphone(new SolidColorBrush(c.Accent));
        var buttons = new Grid {
            ColumnDefinitions = new ColumnDefinitions("*,*"),
            ColumnSpacing = 8,
            Margin = new Thickness(0, 6, 0, 4),
        };
        buttons.Children.Add(sendButton);
        Grid.SetColumn(cancel, 1);
        buttons.Children.Add(cancel);
        dialog.Modal = true;
        dialog.Show(window, c, controller.T("record.voice"),
            controller.T("record.body"),
            mic, clock, meter, notice, buttons);
    }

    // The large microphone: a capsule, the arc round it and its stand, drawn
    // on a 512 grid with a line of 32, round at the ends.
    private static Control Microphone(IBrush color)
    {
        Shape Line(string data) => new() {
            Data = Geometry.Parse(data),
            Stroke = color,
            StrokeThickness = 32,
            StrokeLineCap = PenLineCap.Round,
            StrokeJoin = PenLineJoin.Round,
        };

        var canvas = new Canvas {
            Width = 512,
            Height = 512
        };
        canvas.Children.Add(Line("M192 448h128"));
        canvas.Children.Add(Line(
            "M384 208v32c0 70.4-57.6 128-128 128h0c-70.4 0-128-57.6-128-128v-32"));
        canvas.Children.Add(Line("M256 368v80"));
        canvas.Children.Add(new Shape {
            Data = Geometry.Parse(
                "M256 320a78.83 78.83 0 0 1-56.55-24.1A80.89 80.89 0 0 1 176 239V128a79.69 79.69 0 0 1 80-80c44.86 0 80 35.14 80 80v111c0 44.66-35.89 81-80 81z"),
            Fill = color,
        });
        return new Viewbox {
            Width = 88,
            Height = 88,
            HorizontalAlignment = HorizontalAlignment.Center,
            Margin = new Thickness(0, 8, 0, 0),
            Child = canvas,
        };
    }

    /// <summary>Ends the recording and sends it to the chat.</summary>
    public async Task Finish(MediaRecorder rec)
    {
        if (!ReferenceEquals(rec, recorder))
            return;
        recorder = null;
        ticker.Stop();
        // The dialog goes at once; the file is closed behind it.
        dialog.OnClose = null;
        dialog.Close();
        dialog.OnClose = Discard;
        var done = await rec.Stop();
        if (done == null)
            return;
        Ops.Start("send recording");
        try {
            if (done.Duration >= TimeSpan.FromMilliseconds(500)) {
                if (done.MimeType.StartsWith("audio/",
                        StringComparison.Ordinal))
                    await controller.SendVoice(done.Path, done.Duration,
                        done.Waveform ?? []);
                else
                    await controller.SendAttachment(done.Path);
            }

            Ops.Done("send recording");
        } catch (Exception e) {
            Ops.Fail("send recording", e);
            controller.ShowNotice(controller.T("record.unsupported"),
                NoticeKind.Error);
        } finally {
            try {
                File.Delete(done.Path);
            } catch (IOException e) {
                logger.Exception("delete a recording", e);
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
