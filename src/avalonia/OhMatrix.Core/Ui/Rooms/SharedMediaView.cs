using Avalonia.Platform.Storage;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.I18n;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui.Appearance;
using OhMatrix.Core.Ui.Media;
using OhMatrix.Core.Ui.Support;
using OhMatrix.Core.Ui.Widgets;

namespace OhMatrix.Core.Ui.Rooms;

/// <summary>
/// The whole gallery of a room (<c>SharedMediaPage</c>), a page of the info panel: tabs by kind. Each tab reaches back through the room's
/// history a page at a time, shows pictures and videos as a grid and audio and files as a list, and opens them as the chat does.
/// </summary>
public sealed class SharedMediaView : StackPanel {
    private const int PageSize = 24;

    private sealed class Tab {
        public List<TimelineItem> Items { get; } = [];
        public int? Next { get; set; }
        public bool Loaded { get; set; }
        public bool Loading { get; set; }
        public bool Failed { get; set; }
    }

    private readonly AppController controller;
    private readonly string roomId;
    private readonly ImageViewer viewer;
    private readonly VideoViewer video = new();
    private readonly Dictionary<MediaKind, Tab> tabs = [];
    private readonly Func<string, string> t;
    private MediaKind kind = MediaKind.Image;

    // Registered once for the type: a handler made in the constructor
    // stays in the property's observers for good and runs once for each
    // control that was ever made.
    static SharedMediaView()
    {
        ThemeScope.ColorsProperty.Changed.AddClassHandler<SharedMediaView>((v,
            _) => v.Render());
    }

    public SharedMediaView(AppController controller, string roomId,
        ImageViewer viewer)
    {
        this.controller = controller;
        this.roomId = roomId;
        this.viewer = viewer;
        var locale = controller.Store.Value.Prefs.Locale;
        t = key => Strings.T(locale, key);
        Render();
        _ = More(kind);
    }

    /// <summary>The kind of the tab shown.</summary>
    public MediaKind Kind => kind;

    /// <summary>The items loaded for the tab shown.</summary>
    public IReadOnlyList<TimelineItem> Shown => TabOf(kind).Items;

    public Panel Tiles { get; private set; } = new WrapPanel();

    public void Select(MediaKind k)
    {
        kind = k;
        Render();
        if (!TabOf(k).Loaded)
            _ = More(k);
    }

    /// <summary>Asks for the next page of a tab and shows it; a failure is shown as a line to press.</summary>
    public async Task More(MediaKind k)
    {
        var tab = TabOf(k);
        if (tab.Loading)
            return;
        tab.Loading = true;
        tab.Failed = false;
        Render();
        try {
            var page =
                await controller.SharedMedia(roomId, k, tab.Items.Count,
                    PageSize);
            var seen = tab.Items.Select(i => i.Id).ToHashSet();
            tab.Items.AddRange(page.Items.Where(i => seen.Add(i.Id)));
            tab.Next = page.Next;
            tab.Loaded = true;
        } catch (Exception) {
            tab.Failed = true;
        } finally {
            tab.Loading = false;
        }

        Avalonia.Threading.Dispatcher.UIThread.Post(Render);
    }

    private Tab TabOf(MediaKind k)
    {
        if (!tabs.TryGetValue(k, out var tab))
            tabs[k] = tab = new Tab();
        return tab;
    }

    private static readonly (MediaKind Kind, string Label)[] Kinds = [
        (MediaKind.Image, "media.photos"),
        (MediaKind.Video, "media.videos"),
        (MediaKind.Audio, "media.audio"),
        (MediaKind.File, "media.files"),
    ];

    private void Render()
    {
        var c = ThemeScope.GetColors(this);
        var tab = TabOf(kind);
        Children.Clear();
        var strip = new Grid {
            ColumnDefinitions = new ColumnDefinitions("*,*,*,*"),
            Margin = new Thickness(18, 6),
        };
        for (var i = 0; i < Kinds.Length; i++) {
            var (k, label) = Kinds[i];
            var on = k == kind;
            var button = new Button {
                Content = new TextBlock {
                    Text = t(label),
                    FontSize = 13,
                    FontWeight = FontWeight.SemiBold,
                    FontFamily = Fonts.System,
                    Foreground =
                        new SolidColorBrush(on ? c.OnAccent : c.TextSecondary),
                    HorizontalAlignment = HorizontalAlignment.Center,
                },
                Background =
                    new SolidColorBrush(on ? c.Accent : Colors.Transparent),
                CornerRadius = new CornerRadius(8),
                Height = 30,
                Padding = new Thickness(0),
                HorizontalAlignment = HorizontalAlignment.Stretch,
                HorizontalContentAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(2, 0),
            };
            button.Click += (_, _) => Select(k);
            Grid.SetColumn(button, i);
            strip.Children.Add(button);
        }

        Children.Add(strip);
        Tiles = new WrapPanel {
            Margin = new Thickness(18, 10)
        };
        foreach (var item in tab.Items) {
            if (kind is MediaKind.Image or MediaKind.Video)
                Tiles.Children.Add(Tile(c, item));
            else
                Children.Add(Row(c, item));
        }

        if (Tiles.Children.Count > 0)
            Children.Insert(1, Tiles);
        if (tab.Loaded && tab.Items.Count == 0 && !tab.Loading && !tab.Failed)
            Children.Add(Note(c, t("media.none")));
        if (tab.Failed) {
            var retry = new TextButton {
                Title = t("media.failed")
            };
            retry.Click += (_, _) => _ = More(kind);
            Children.Add(retry);
        }

        if (tab.Loading)
            Children.Add(Note(c, t("media.requesting")));
        if (tab.Next != null && !tab.Loading && !tab.Failed) {
            var more = new TextButton {
                Title = t("media.more"),
                HorizontalAlignment = HorizontalAlignment.Center,
            };
            more.Click += (_, _) => _ = More(kind);
            Children.Add(more);
        }
    }

    private static TextBlock Note(ColorTokens c, string text)
    {
        return new TextBlock {
            Text = text,
            FontSize = 15,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.TextSecondary),
            Margin = new Thickness(20, 12),
            HorizontalAlignment = HorizontalAlignment.Center,
        };
    }

    private Control Tile(ColorTokens c, TimelineItem item)
    {
        var cell = new Border {
            Width = 88,
            Height = 88,
            Margin = new Thickness(2),
            CornerRadius = new CornerRadius(8),
            ClipToBounds = true,
            Background = new SolidColorBrush(c.BgSecondary),
            Cursor =
                new Avalonia.Input.Cursor(
                    Avalonia.Input.StandardCursorType.Hand),
        };
        var picture = item.Image;
        if (picture != null) {
            var image = new Image {
                Stretch = Stretch.UniformToFill
            };
            controller.Pictures.Attach(image, picture.Source, 176, 176);
            cell.Child = image;
            cell.PointerPressed += (_, e) => {
                e.Handled = true;
                var window = TopLevel.GetTopLevel(this);
                if (window != null)
                    viewer.Show(window, controller.Pictures, picture.Source,
                        picture.FileName,
                        image.Source,
                        () => controller.SavePicture(window, picture.Source,
                            picture.FileName));
            };
        } else {
            cell.Child = new Icon {
                Glyph = "play",
                Size = 28,
                Color = new SolidColorBrush(c.TextSecondary),
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
            };
            cell.PointerPressed += (_, e) => {
                e.Handled = true;
                _ = Open(item);
            };
        }

        return cell;
    }

    private Control Row(ColorTokens c, TimelineItem item)
    {
        var file = item.File!;
        var row = new Grid {
            ColumnDefinitions = new ColumnDefinitions("Auto,*"),
            Margin = new Thickness(18, 0),
            MinHeight = 60,
            Background = Brushes.Transparent,
            Cursor =
                new Avalonia.Input.Cursor(
                    Avalonia.Input.StandardCursorType.Hand),
        };
        row.Children.Add(new Border {
            Width = 44,
            Height = 44,
            CornerRadius = new CornerRadius(8),
            Background = new SolidColorBrush(c.BgSecondary),
            Margin = new Thickness(0, 0, 12, 0),
            Child = new Icon {
                Glyph = file.Kind == FileKind.Audio ? "play" : "file",
                Size = 20,
                Color = new SolidColorBrush(c.TextSecondary),
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
            },
        });
        var text = new StackPanel {
            VerticalAlignment = VerticalAlignment.Center
        };
        text.Children.Add(new TextBlock {
            Text = file.Name,
            FontSize = 16,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.Text),
            TextTrimming = TextTrimming.CharacterEllipsis,
        });
        var size = file.Size > 0 ? " · " + Format.Bytes(file.Size) : "";
        text.Children.Add(new TextBlock {
            Text = item.SenderName + size,
            FontSize = 13,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.TextSecondary),
            TextTrimming = TextTrimming.CharacterEllipsis,
        });
        Grid.SetColumn(text, 1);
        row.Children.Add(text);
        row.PointerPressed += (_, e) => {
            e.Handled = true;
            _ = Open(item);
        };
        return row;
    }

    /// <summary>Opens a video in the app's player where there is one, any other file with the system's program for it.</summary>
    public async Task Open(TimelineItem item)
    {
        var file = item.File;
        if (file == null || TopLevel.GetTopLevel(this) is not
                { } window)
            return;
        try {
            if (file.Kind == FileKind.Video && Audio.MediaPlayer.Available) {
                await video.Show(window, file, controller.DownloadFile);
                return;
            }

            var path = await controller.DownloadFile(file);
            if (path == null)
                return;
            var stored =
                await window.StorageProvider.TryGetFileFromPathAsync(path);
            if (stored != null)
                await window.Launcher.LaunchFileAsync(stored);
        } catch (Exception) {
            // The file stays unopened; pressing it again tries again.
        }
    }
}
