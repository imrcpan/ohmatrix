using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using Avalonia.Platform;
using Avalonia.Threading;
using OhMatrix.Core.Audio;
using OhMatrix.Core.Model;
using OhMatrix.Core.Theming;

namespace OhMatrix.Core.Ui;

/// <summary>
/// The video of a message in the app: over a near-black backdrop, the picture fitted to the window with a play or pause button, a bar to see
/// and change where it is, and the time. A press on the picture plays or pauses; Esc, the cross or a press outside closes it.
/// </summary>
public sealed class VideoViewer : IOverlay {
    private OverlayLayer? layer;
    private MediaPlayer? player;
    private WriteableBitmap? bitmap;

    private readonly Grid shade = new() {
        Background = new SolidColorBrush(Color.FromArgb(250, 0, 0, 0)),
        Focusable = true,
        ClipToBounds = true,
    };

    private readonly Image picture = new() {
        Stretch = Stretch.Uniform,
        Margin = new Thickness(0, 56, 0, 80),
    };

    private readonly TextBlock title = new() {
        FontSize = 16,
        FontWeight = FontWeight.Medium,
        FontFamily = Fonts.System,
        Foreground = Brushes.White,
        TextTrimming = TextTrimming.CharacterEllipsis,
        VerticalAlignment = VerticalAlignment.Top,
        Margin = new Thickness(20, 12, 60, 0),
        Height = 36,
    };

    private readonly TextBlock status = new() {
        FontSize = 15,
        FontFamily = Fonts.System,
        Foreground = Brushes.White,
        HorizontalAlignment = HorizontalAlignment.Center,
        VerticalAlignment = VerticalAlignment.Center,
    };

    private readonly IconButton toggle = new("play", "Play", 24, 44) {
        Tint = Colors.White,
    };

    private readonly Border track = new() {
        Height = 18,
        Background = Brushes.Transparent,
        Cursor = new Cursor(StandardCursorType.Hand),
        VerticalAlignment = VerticalAlignment.Center,
    };

    private readonly Border fill = new() {
        Height = 4,
        CornerRadius = new CornerRadius(2),
        Background = Brushes.White,
        HorizontalAlignment = HorizontalAlignment.Left,
        IsHitTestVisible = false,
    };

    private readonly TextBlock time = new() {
        FontSize = 14,
        FontFamily = Fonts.System,
        Foreground = Brushes.White,
        VerticalAlignment = VerticalAlignment.Center,
        Margin = new Thickness(12, 0, 0, 0),
    };

    private readonly DispatcherTimer timer = new() {
        Interval = TimeSpan.FromMilliseconds(33)
    };

    private int session;

    public VideoViewer()
    {
        shade.Children.Add(picture);
        shade.Children.Add(status);
        shade.Children.Add(title);
        var close = new IconButton("close", "Close", 26) {
            Tint = Colors.White,
            HorizontalAlignment = HorizontalAlignment.Right,
            VerticalAlignment = VerticalAlignment.Top,
            Margin = new Thickness(0, 12, 12, 0),
        };
        close.Click += (_, _) => Close();
        ThemeScope.SetColors(close, Themes.Resolve("dark", null).Colors);
        ThemeScope.SetColors(toggle, Themes.Resolve("dark", null).Colors);
        shade.Children.Add(close);

        var bar = new Grid {
            ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto"),
            VerticalAlignment = VerticalAlignment.Bottom,
            Margin = new Thickness(20, 0, 20, 20),
            Height = 44,
        };
        var line = new Grid {
            VerticalAlignment = VerticalAlignment.Center,
            Margin = new Thickness(12, 0, 0, 0)
        };
        line.Children.Add(new Border {
            Height = 4,
            CornerRadius = new CornerRadius(2),
            Background = new SolidColorBrush(Color.FromArgb(90, 255, 255, 255)),
            VerticalAlignment = VerticalAlignment.Center,
        });
        line.Children.Add(fill);
        line.Children.Add(track);
        Grid.SetColumn(line, 1);
        Grid.SetColumn(time, 2);
        bar.Children.Add(toggle);
        bar.Children.Add(line);
        bar.Children.Add(time);
        shade.Children.Add(bar);

        toggle.Click += (_, _) => Toggle();
        picture.PointerPressed += (_, e) => {
            e.Handled = true;
            Toggle();
        };
        track.PointerPressed += (_, e) => {
            e.Handled = true;
            if (player is { DurationMs: > 0 } p && track.Bounds.Width > 0)
                p.Seek((long)(p.DurationMs * e.GetPosition(track).X /
                              track.Bounds.Width));
        };
        shade.PointerPressed += (_, e) => {
            if (e.Source == shade)
                Close();
        };
        shade.KeyDown += (_, e) => {
            if (e.Key == Key.Escape)
                Close();
            else if (e.Key == Key.Space)
                Toggle();
        };
        timer.Tick += (_, _) => Tick();
    }

    public bool IsOpen => shade.Parent is not null;

    /// <summary>What the play button shows now: "play" or "pause".</summary>
    public string Glyph => toggle.Glyph;

    public Image Picture => picture;

    public long Position => player?.PositionMs ?? 0;

    /// <summary>Opens the video: it is fetched, then played from the start.</summary>
    public async Task Show(TopLevel window, FileAttachment file,
        Func<FileAttachment, Task<string?>> fetch)
    {
        Close();
        layer = OverlayLayer.GetOverlayLayer(window);
        if (layer is null)
            return;
        var mine = ++session;
        title.Text = file.Name;
        picture.Source = null;
        bitmap = null;
        status.Text = "…";
        shade.Width = window.ClientSize.Width;
        shade.Height = window.ClientSize.Height;
        layer.Children.Add(shade);
        shade.Focus();
        string? path = null;
        try {
            path = await fetch(file);
        } catch (Exception) {
            // Nothing to play: the viewer closes below.
        }

        // Closed, or another video opened, while it was being fetched.
        if (mine != session || !IsOpen)
            return;
        var next = path is null ? null : new MediaPlayer(path, true);
        if (next is null || !next.Play()) {
            next?.Dispose();
            Close();
            return;
        }

        player = next;
        status.Text = "";
        timer.Start();
    }

    private void Toggle()
    {
        if (player is null)
            return;
        if (player.State == PlayState.Playing)
            player.Pause();
        else
            player.Play();
        Tick();
    }

    /// <summary>Takes the newest frame, if there is one, and shows where the video is.</summary>
    public void Tick()
    {
        if (player is not { } p)
            return;
        p.Video?.TryTakeFrame((data, width, height) => {
            if (bitmap is null || bitmap.PixelSize.Width != width ||
                bitmap.PixelSize.Height != height) {
                bitmap = new WriteableBitmap(new PixelSize(width, height),
                    new Vector(96, 96),
                    PixelFormat.Bgra8888, AlphaFormat.Opaque);
                picture.Source = bitmap;
            }

            using var frame = bitmap.Lock();
            for (var y = 0; y < height; y++) {
                unsafe {
                    Buffer.MemoryCopy((byte*)data + y * width * 4,
                        (byte*)frame.Address + y * frame.RowBytes,
                        frame.RowBytes, width * 4);
                }
            }

            picture.InvalidateVisual();
        });
        var playing = p.State == PlayState.Playing;
        toggle.Glyph = playing ? "pause" : "play";
        var length = p.DurationMs;
        var at = p.State == PlayState.Ended ? length : p.PositionMs;
        fill.Width = length > 0
            ? track.Bounds.Width * Math.Min(1.0, (double)at / length)
            : 0;
        time.Text = $"{Format.Duration(TimeSpan.FromMilliseconds(at))} / "
                    + Format.Duration(TimeSpan.FromMilliseconds(length));
    }

    public void Close()
    {
        session++;
        timer.Stop();
        layer?.Children.Remove(shade);
        player?.Dispose();
        player = null;
    }
}
