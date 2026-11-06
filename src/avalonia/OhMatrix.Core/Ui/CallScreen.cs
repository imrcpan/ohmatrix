using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using Avalonia.Platform;
using Avalonia.Threading;
using OhMatrix.Core.Calls;
using OhMatrix.Core.I18n;
using OhMatrix.Core.State;
using OhMatrix.Core.Theming;

namespace OhMatrix.Core.Ui;

/// <summary>
/// The call over the whole window (<c>CallScreen</c> of the React Native app): the person's picture and name, what the call is doing (calling,
/// the clock, how it ended) and round buttons: accept and decline while it rings, otherwise the microphone, the camera for a video call, and end.
/// </summary>
public sealed class CallScreen : Grid {
    private static readonly Color Backdrop = Color.Parse("#111418");
    private static readonly Color Danger = Color.Parse("#E5484D");
    private static readonly Color Accept = Color.Parse("#30A46C");

    private readonly AppController controller;
    private readonly TimeProvider time;

    private readonly Border avatarHolder = new() {
        HorizontalAlignment = HorizontalAlignment.Center
    };

    private readonly TextBlock name = new() {
        FontSize = 26,
        FontWeight = FontWeight.Bold,
        FontFamily = Fonts.System,
        Foreground = Brushes.White,
        HorizontalAlignment = HorizontalAlignment.Center,
        TextTrimming = TextTrimming.CharacterEllipsis,
    };

    private readonly TextBlock status = new() {
        FontSize = 17,
        FontFamily = Fonts.System,
        Foreground = new SolidColorBrush(Color.FromArgb(200, 255, 255, 255)),
        HorizontalAlignment = HorizontalAlignment.Center,
    };

    private readonly StackPanel buttons = new() {
        Orientation = Orientation.Horizontal,
        HorizontalAlignment = HorizontalAlignment.Center,
        VerticalAlignment = VerticalAlignment.Bottom,
        Margin = new Thickness(0, 0, 0, 48),
    };

    private readonly DispatcherTimer clock = new() {
        Interval = TimeSpan.FromMilliseconds(500)
    };

    private readonly Image remote = new() {
        Stretch = Stretch.Uniform,
        IsVisible = false,
        IsHitTestVisible = false,
    };

    private readonly DispatcherTimer frames = new() {
        Interval = TimeSpan.FromMilliseconds(33)
    };

    private WriteableBitmap? picture;
    private bool pictureShown;
    private readonly StackPanel middle;
    private string? shownRoom;

    public CallScreen(AppController controller, TimeProvider? time = null)
    {
        this.controller = controller;
        this.time = time ?? TimeProvider.System;
        Background = new SolidColorBrush(Backdrop);
        IsVisible = false;
        middle = new StackPanel {
            VerticalAlignment = VerticalAlignment.Center,
            Spacing = 12,
            Margin = new Thickness(24, 0, 24, 80),
        };
        middle.Children.Add(avatarHolder);
        middle.Children.Add(name);
        middle.Children.Add(status);
        Children.Add(remote);
        Children.Add(middle);
        Children.Add(buttons);
        controller.Store.Changed += _ => Apply();
        clock.Tick += (_, _) => Apply();
        frames.Tick += (_, _) => TakeFrame();
        Apply();
    }

    /// <summary>The round buttons, by the key of their label in the language file.</summary>
    public IReadOnlyDictionary<string, Border> Buttons { get; private set; } =
        new Dictionary<string, Border>();

    public string Status => status.Text ?? "";

    public string PeerName => name.Text ?? "";

    /// <summary>True once a picture of the other side is on screen.</summary>
    public bool ShowsVideo => remote.IsVisible;

    /// <summary>Copies the newest picture of the other side into the bitmap shown behind the buttons.</summary>
    public void TakeFrame()
    {
        if (!controller.TakeCallFrame((data, width, height) => {
                if (picture is null || picture.PixelSize.Width != width
                                    || picture.PixelSize.Height != height) {
                    picture = new WriteableBitmap(new PixelSize(width, height), new Vector(96, 96),
                        PixelFormat.Bgra8888, AlphaFormat.Opaque);
                    remote.Source = picture;
                }

                using var frame = picture.Lock();
                unsafe {
                    for (var y = 0; y < height; y++)
                        Buffer.MemoryCopy((byte*)data + y * width * 4,
                            (byte*)frame.Address + y * frame.RowBytes, frame.RowBytes, width * 4);
                }

                pictureShown = true;
            }))
            return;
        remote.InvalidateVisual();
        remote.IsVisible = pictureShown;
        middle.IsVisible = !pictureShown;
    }

    private string T(string key, params (string, object)[] values)
    {
        return Strings.T(controller.Store.Value.Locale, key, values);
    }

    private static string ClockText(TimeSpan t)
    {
        var s = Math.Max(0, (int)t.TotalSeconds);
        return s >= 3600
            ? $"{s / 3600}:{s / 60 % 60:00}:{s % 60:00}"
            : $"{s / 60:00}:{s % 60:00}";
    }

    private string StatusOf(CallInfo call)
    {
        if (call.Phase == CallPhase.Ended) {
            return T(call.EndReason switch {
                EndReason.Rejected => "call.end.rejected",
                EndReason.Cancelled => "call.end.cancelled",
                EndReason.Busy => "call.end.busy",
                EndReason.Unanswered => "call.end.unanswered",
                EndReason.Failed => "call.end.failed",
                EndReason.NoMedia => "call.end.nomedia",
                _ => "call.end.hangup",
            });
        }

        if (call.Phase == CallPhase.Connected) {
            return call.Poor
                ? T("call.poor")
                : ClockText(time.GetUtcNow() - (call.ConnectedAt ?? time.GetUtcNow()));
        }

        if (call.Incoming && call.Phase == CallPhase.Ringing)
            return T(call.Video ? "call.incoming.video" : "call.incoming.voice");
        return T(call.Phase == CallPhase.Ringing ? "call.calling" : "call.connecting");
    }

    private Border Round(string key, string glyph, Action press, Color? tone = null,
        bool off = false, double turn = 0)
    {
        var background = tone is { } t
            ? t
            : off
                ? Colors.White
                : Color.FromArgb(46, 255, 255, 255);
        var ink = tone is not null ? Colors.White : off ? Color.Parse("#1C1C1E") : Colors.White;
        var disc = new Border {
            Width = 64,
            Height = 64,
            CornerRadius = new CornerRadius(32),
            Background = new SolidColorBrush(background),
            Cursor = new Cursor(StandardCursorType.Hand),
            Child = new Icon {
                Glyph = glyph,
                Size = 28,
                Color = new SolidColorBrush(ink),
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                RenderTransform = new RotateTransform(turn),
            },
        };
        disc.PointerPressed += (_, e) => {
            e.Handled = true;
            press();
        };
        Avalonia.Automation.AutomationProperties.SetName(disc, T(key));
        var cell = new StackPanel {
            Width = 112,
            Spacing = 8
        };
        cell.Children.Add(disc);
        cell.Children.Add(new TextBlock {
            Text = T(key),
            FontSize = 13,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(Color.FromArgb(220, 255, 255, 255)),
            HorizontalAlignment = HorizontalAlignment.Center,
            TextTrimming = TextTrimming.CharacterEllipsis,
        });
        buttons.Children.Add(cell);
        return disc;
    }

    private void Apply()
    {
        var s = controller.Store.Value;
        var call = s.Call;
        IsVisible = call is not null;
        if (call is null) {
            clock.Stop();
            frames.Stop();
            remote.IsVisible = false;
            shownRoom = null;
            Buttons = new Dictionary<string, Border>();
            return;
        }

        if (call.Phase == CallPhase.Connected)
            clock.Start();
        else
            clock.Stop();
        // A video call shows the other side's picture behind the name and buttons once it arrives.
        if (call is { Video: true, Phase: CallPhase.Connected })
            frames.Start();
        else {
            frames.Stop();
            pictureShown = false;
            remote.IsVisible = false;
            middle.IsVisible = true;
        }

        var room = s.Rooms.FirstOrDefault(r => r.Id == call.RoomId);
        var who = room?.Name ?? call.Peer;
        name.Text = who;
        status.Text = StatusOf(call);
        if (shownRoom != call.RoomId) {
            shownRoom = call.RoomId;
            var avatar = new Avatar(call.RoomId, who, 128);
            controller.Pictures.Attach(avatar, room?.AvatarUrl, 128);
            avatarHolder.Child = avatar;
        }

        buttons.Children.Clear();
        var shown = new Dictionary<string, Border>();
        if (call.Phase != CallPhase.Ended) {
            if (call.Incoming && call.Phase == CallPhase.Ringing) {
                shown["call.decline"] = Round("call.decline", "fluentCall",
                    () => _ = controller.HangupCall(), Danger, turn: 135);
                shown["call.accept"] = Round("call.accept", "fluentCall",
                    () => _ = controller.AnswerCall(), Accept);
            } else {
                shown["call.mic"] = Round(call.Muted ? "call.micOff" : "call.micOn", "mic",
                    () => controller.SetCallMuted(!call.Muted), off: call.Muted);
                if (call.Video) {
                    shown["call.camera"] = Round(
                        call.CameraOff ? "call.cameraOff" : "call.cameraOn",
                        "video", () => controller.SetCallCameraOff(!call.CameraOff),
                        off: call.CameraOff);
                }

                shown["call.hangup"] = Round("call.hangup", "fluentCall",
                    () => _ = controller.HangupCall(), Danger, turn: 135);
            }
        }

        Buttons = shown;
    }
}
