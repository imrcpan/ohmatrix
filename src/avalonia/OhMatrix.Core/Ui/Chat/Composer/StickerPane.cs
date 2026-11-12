using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Platform.Storage;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui.Appearance;
using OhMatrix.Core.Ui.Media;
using OhMatrix.Core.Ui.Overlays;
using OhMatrix.Core.Ui.Support;
using OhMatrix.Core.Ui.Widgets;
using Menu = OhMatrix.Core.Ui.Overlays.Menu;
using MenuItem = OhMatrix.Core.Ui.Overlays.MenuItem;

namespace OhMatrix.Core.Ui.Chat.Composer;

/// <summary>
/// The stickers tab of the picker (<c>StickerPane</c>): a bar with the name of the group on show and its settings, the grid of stickers (a first tile
/// adds one), and the groups as icon tabs along the bottom. A press on a sticker sends it. The settings are: Select (to delete), and for a group
/// Reorder, Rename, Set cover and Delete group. A file that is not a picture of a kind the pack takes, or is over 3 MB, is refused with a notice.
/// </summary>
public sealed class StickerPane : Grid {
    public const double Tile = 72;
    public const double Gap = 4;
    public const double Pad = 8;
    public const int MaxCols = 5;
    private const double GroupIcon = 48;

    public enum PaneMode {
        Browse,
        Choose,
        Reorder,
    }

    private readonly AppController controller;
    private readonly Action close;

    private readonly Border bar = new() {
        MinHeight = 36,
        Padding = new Thickness(6, 6, 6, 0)
    };

    private readonly WrapPanel grid = new() {
        Margin = new Thickness(Pad - Gap / 2)
    };

    private readonly Border tabs = new() {
        BorderThickness = new Thickness(0, 1, 0, 0),
        Padding = new Thickness(4)
    };

    private readonly Menu settings = new();
    private readonly Dialog dialog = new();
    private readonly PromptDialog prompt = new();
    private readonly HashSet<string> chosen = [];
    private string? view;
    private Control? gear;

    // Registered once for the type: a handler made in the constructor
    // stays in the property's observers for good and runs once for each
    // control that was ever made.
    static StickerPane()
    {
        ThemeScope.ColorsProperty.Changed.AddClassHandler<StickerPane>((p, _) =>
            p.Apply());
    }

    public StickerPane(AppController controller, Action close)
    {
        this.controller = controller;
        this.close = close;
        Height = 360;
        RowDefinitions = new RowDefinitions("Auto,*,Auto");
        Children.Add(bar);
        var scroller = new ScrollViewer {
            Content = grid,
            HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
        };
        Grid.SetRow(scroller, 1);
        Children.Add(scroller);
        Grid.SetRow(tabs, 2);
        Children.Add(tabs);
        Lifetime.OwnAll(this, settings, dialog, prompt);
        Lifetime.Watch(this, controller, state => {
            if (Differs(state))
                Apply();
        });
        Apply();
    }

    /// <summary>What the person is doing: looking, choosing stickers to delete, or moving the ones of a group.</summary>
    public PaneMode Mode { get; private set; }

    /// <summary>The tiles of the stickers (and the add tile when browsing), as laid out now.</summary>
    public IReadOnlyList<Control> Tiles => grid.Children;

    public StackPanel? Tabs =>
        (tabs.Child as ScrollViewer)?.Content as StackPanel;

    public Dialog Dialog => dialog;
    public PromptDialog Prompt => prompt;
    public Menu Settings => settings;

    /// <summary>The names chosen while choosing.</summary>
    public IReadOnlyCollection<string> Chosen => chosen;

    /// <summary>The id of the group on show.</summary>
    public string CurrentId => Current().Group.Id;

    /// <summary>The width of a picker that has <paramref name="cols"/> columns.</summary>
    public static double WidthOf(int cols)
    {
        return cols * (Tile + Gap) - Gap + 2 * Pad;
    }

    /// <summary>As many columns as fit in <paramref name="available"/> px, at most <see cref="MaxCols"/>.</summary>
    public static int Columns(double available)
    {
        return Math.Max(1,
            Math.Min(MaxCols,
                (int)Math.Floor((available - 2 * Pad + Gap) / (Tile + Gap))));
    }


    private (IReadOnlyList<StickerGroup> Groups, StickerGroup Group, int Index)
        Current()
    {
        var s = controller.Store.Value;
        var groups = StickerPack.WithDefault(s.StickerGroups, s.Stickers);
        var want = view ?? s.Prefs.StickerGroup ?? StickerPack.DefaultGroup;
        // A group that is gone (deleted on another device) is not left on show.
        var index = Math.Max(0, groups.ToList().FindIndex(g => g.Id == want));
        return (groups, groups[index], index);
    }

    /// <summary>What a group is called: its name, or "Group n" while it has none.</summary>
    public string Label(StickerGroup g, int index)
    {
        return g.Name.Length > 0
            ? g.Name
            : g.Id == StickerPack.DefaultGroup
                ? controller.T("sticker.group.default")
                : controller.T("sticker.group.n", ("n", index));
    }

    /// <summary>Shows a group, and keeps it as the one to open next time.</summary>
    public void Show(string id)
    {
        view = id;
        controller.SetPreferences(p => p with {
            StickerGroup = id
        });
        Stop();
    }

    private async Task Save(IReadOnlyList<StickerGroup> next)
    {
        Ops.Start("save sticker groups");
        try {
            await controller.SetStickerGroups(next);
            Ops.Done("save sticker groups");
        } catch (Exception e) {
            Ops.Fail("save sticker groups", e);
            controller.ShowNotice(
                controller.T("sticker.group.failed",
                    ("reason", Failure.Reason(e, k => controller.T(k)))),
                NoticeKind.Error);
        }
    }

    private Task Change(Func<StickerGroup, StickerGroup> patch)
    {
        var (groups, group, _) = Current();
        return Save(
            groups.Select(g => g.Id == group.Id ? patch(g) : g).ToList());
    }

    /// <summary>Goes back to looking.</summary>
    public void Stop()
    {
        Mode = PaneMode.Browse;
        chosen.Clear();
        Apply();
    }

    public void Choose(string shortcode)
    {
        if (!chosen.Remove(shortcode))
            chosen.Add(shortcode);
        Apply();
    }

    public void SetMode(PaneMode mode)
    {
        Mode = mode;
        chosen.Clear();
        Apply();
    }

    /// <summary>Adds the picture files to my pack, one after another so the order is the one chosen and a failure does not stop the rest.</summary>
    public async Task Add(IReadOnlyList<string> paths)
    {
        if (paths.Count == 0)
            return;
        var (groups, group, _) = Current();
        var added = new List<string>();
        var failed = 0;
        var reason = "";
        Ops.Start("add stickers", paths.Count + " files");
        controller.ShowNotice(
            paths.Count > 1
                ? controller.T("sticker.uploading.n", ("n", paths.Count),
                    ("i", 1))
                : controller.T("sticker.uploading"), NoticeKind.Progress);
        for (var i = 0; i < paths.Count; i++) {
            if (paths.Count > 1)
                controller.ShowNotice(
                    controller.T("sticker.uploading.n", ("n", paths.Count),
                        ("i", i + 1)),
                    NoticeKind.Progress);
            try {
                added.Add(await controller.AddSticker(paths[i]));
            } catch (Exception e) {
                Ops.Fail("add stickers", e, Path.GetFileName(paths[i]));
                failed++;
                if (reason.Length == 0)
                    reason = Failure.Reason(e, k => controller.T(k));
            }
        }

        // Added while a group is on show, they go into that group.
        var fresh = added.Where(code => !group.Stickers.Contains(code))
            .ToList();
        if (fresh.Count > 0)
            await Save(groups.Select(g => g.Id == group.Id
                ? g with {
                    Stickers = [.. g.Stickers, .. fresh]
                }
                : g with {
                    Stickers = g.Stickers.Where(x => !fresh.Contains(x))
                        .ToList()
                }).ToList());
        if (failed == 0)
            Ops.Done("add stickers", added.Count + " added");
        if (failed == 1 && paths.Count == 1)
            controller.ShowNotice(
                controller.T("sticker.add.failed", ("reason", reason)),
                NoticeKind.Error);
        else if (failed == 0)
            controller.ShowNotice(controller.T("sticker.add.done",
                ("n", added.Count)));
        else
            controller.ShowNotice(
                controller.T("sticker.add.some", ("n", failed),
                    ("total", paths.Count),
                    ("reason", reason)),
                NoticeKind.Error);
    }

    private async Task Pick()
    {
        var window = TopLevel.GetTopLevel(this);
        if (window == null)
            return;
        var provider = window.StorageProvider;
        if (!provider.CanOpen)
            return;
        var files = await provider.OpenFilePickerAsync(
            new Avalonia.Platform.Storage.FilePickerOpenOptions {
                AllowMultiple = true,
                FileTypeFilter =
                    [Avalonia.Platform.Storage.FilePickerFileTypes.ImageAll],
            });
        await Add(files.Select(f => f.TryGetLocalPath()).OfType<string>()
            .ToList());
    }

    /// <summary>Sends a sticker to the open chat and shuts the picker.</summary>
    public void Send(string shortcode)
    {
        close();
        _ = SendNow(shortcode);
    }

    private async Task SendNow(string shortcode)
    {
        Ops.Start("send sticker", shortcode);
        try {
            await controller.SendSticker(shortcode);
            Ops.Done("send sticker", shortcode);
        } catch (Exception e) {
            Ops.Fail("send sticker", e, shortcode);
            controller.ShowNotice(
                controller.T("sticker.send.failed",
                    ("reason", Failure.Reason(e, k => controller.T(k)))),
                NoticeKind.Error);
        }
    }

    /// <summary>Takes the chosen stickers out of my pack.</summary>
    public async Task RemoveChosen()
    {
        var codes = chosen.ToList();
        Stop();
        if (codes.Count == 0)
            return;
        Ops.Start("remove stickers", codes.Count + " stickers");
        try {
            await controller.RemoveStickers(codes);
            Ops.Done("remove stickers");
        } catch (Exception e) {
            Ops.Fail("remove stickers", e);
            controller.ShowNotice(
                controller.T("sticker.remove.failed",
                    ("reason", Failure.Reason(e, k => controller.T(k)))),
                NoticeKind.Error);
        }
    }

    /// <summary>Deletes the group on show with its stickers (the stickers go first, which also takes them out of every group).</summary>
    public async Task DeleteGroup()
    {
        var (groups, group, _) = Current();
        Show(StickerPack.DefaultGroup);
        if (group.Id == StickerPack.DefaultGroup)
            return;
        Ops.Start("delete sticker group", group.Id);
        try {
            if (group.Stickers.Count > 0)
                await controller.RemoveStickers(group.Stickers);
            var rest = Current().Groups.Where(x => x.Id != group.Id).ToList();
            await Save(rest);
            Ops.Done("delete sticker group", group.Id);
        } catch (Exception e) {
            Ops.Fail("delete sticker group", e, group.Id);
            controller.ShowNotice(
                controller.T("sticker.remove.failed",
                    ("reason", Failure.Reason(e, k => controller.T(k)))),
                NoticeKind.Error);
        }
    }

    /// <summary>Moves the sticker at <paramref name="from"/> in the group on show to where the one at <paramref name="to"/> is.</summary>
    public Task Move(int from, int to)
    {
        return Change(g => g with {
            Stickers = StickerPack.MoveItem(g.Stickers, from, to)
        });
    }

    private TopLevel? Window => TopLevel.GetTopLevel(this);

    private void AskName()
    {
        var window = Window;
        if (window == null)
            return;
        var (_, group, _) = Current();
        prompt.Show(window, ThemeScope.GetColors(this),
            controller.Store.Value.Locale,
            controller.T("sticker.name.title"),
            controller.T("sticker.name.body"),
            [new PromptField(controller.T("sticker.name.label"), "hash", true)],
            controller.T("save"),
            values => Change(g => g with {
                Name = values[0].Trim()
            }));
        prompt.Fields[0].Text = group.Name;
    }

    private void AskNewGroup()
    {
        var window = Window;
        if (window == null)
            return;
        var (groups, _, _) = Current();
        prompt.Show(window, ThemeScope.GetColors(this),
            controller.Store.Value.Locale,
            controller.T("sticker.group.new"),
            controller.T("sticker.name.body"),
            [new PromptField(controller.T("sticker.name.label"), "hash", true)],
            controller.T("sticker.group.create"),
            async values => {
                // A new group has no cover of its own: it shows its first sticker, or a smiling face until it has one.
                var id = StickerPack.NewGroupId(groups);
                await controller.SetStickerGroups(
                [
                    .. groups, new StickerGroup(id, values[0].Trim(), null, [])
                ]);
                Show(id);
            });
        prompt.Fields[0].Text =
            controller.T("sticker.group.n", ("n", groups.Count));
    }

    private Control Warning(string a, string b, string c)
    {
        var colors = ThemeScope.GetColors(this);
        var text = new TextBlock {
            FontSize = 15,
            LineHeight = 21,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(colors.TextSecondary),
            TextAlignment = TextAlignment.Center,
            TextWrapping = TextWrapping.Wrap,
        };
        text.Inlines!.Add(new Avalonia.Controls.Documents.Run(a));
        text.Inlines.Add(new Avalonia.Controls.Documents.Run(b) {
            FontWeight = FontWeight.Bold,
            Foreground = new SolidColorBrush(colors.Danger)
        });
        text.Inlines.Add(new Avalonia.Controls.Documents.Run(c));
        return text;
    }

    private static TextButton Cancel(string title, Action press)
    {
        var button = new TextButton {
            Title = title
        };
        button.Click += (_, _) => press();
        return button;
    }

    private static PrimaryButton Primary(string title, Action press)
    {
        var button = new PrimaryButton {
            Title = title
        };
        button.Click += (_, _) => press();
        return button;
    }

    /// <summary>Asks to delete the group, twice.</summary>
    public void AskDeleteGroup()
    {
        var window = Window;
        if (window == null)
            return;
        var colors = ThemeScope.GetColors(this);
        var (_, group, index) = Current();
        var title = Label(group, index);
        dialog.Show(window, colors, controller.T("sticker.group.delete.title"),
            null,
            Warning(controller.T("sticker.group.delete.a"),
                controller.T("sticker.group.delete.b",
                    ("n", group.Stickers.Count)),
                controller.T("sticker.group.delete.c")),
            Primary(controller.T("sticker.group.delete"), () => {
                dialog.Close();
                dialog.Modal = true;
                dialog.Show(window, colors,
                    controller.T("sticker.group.delete.title2"),
                    null,
                    Warning(controller.T("sticker.group.delete.2a"),
                        controller.T("sticker.group.delete.2b", ("name", title),
                            ("n", group.Stickers.Count)),
                        controller.T("sticker.group.delete.2c")),
                    Primary(controller.T("sticker.group.delete.yes"), () => {
                        dialog.Close();
                        dialog.Modal = false;
                        _ = DeleteGroup();
                    }), Cancel(controller.T("cancel"), () => {
                        dialog.Close();
                        dialog.Modal = false;
                    }));
            }), Cancel(controller.T("cancel"), dialog.Close));
    }

    private void AskRemove()
    {
        var window = Window;
        if (window == null)
            return;
        dialog.Show(window, ThemeScope.GetColors(this),
            controller.T("sticker.remove.title"),
            controller.T("sticker.remove.body"),
            Primary(controller.T("sticker.remove"), () => {
                dialog.Close();
                _ = RemoveChosen();
            }), Cancel(controller.T("cancel"), dialog.Close));
    }

    /// <summary>The cover of the group on show: one of my stickers, a picture from the device, or an emoji.</summary>
    public void AskCover(string step = "menu")
    {
        var window = Window;
        if (window == null)
            return;
        var colors = ThemeScope.GetColors(this);
        var s = controller.Store.Value;

        void Pick(StickerIcon icon)
        {
            dialog.Close();
            _ = Change(g => g with {
                Icon = icon
            });
        }

        Control body;
        if (step == "pack") {
            var wrap = new WrapPanel();
            foreach (var sticker in s.Stickers) {
                var tile = StickerImage(colors, sticker, 56);
                tile.PointerPressed += (_, e) => {
                    e.Handled = true;
                    Pick(StickerIcon.OfImage(sticker.Url, sticker.MimeType));
                };
                wrap.Children.Add(tile);
            }

            body = new ScrollViewer {
                Height = 220,
                Content = s.Stickers.Count == 0
                    ? new TextBlock {
                        Text = controller.T("sticker.empty"),
                        TextWrapping = TextWrapping.Wrap,
                        Foreground = new SolidColorBrush(colors.TextSecondary)
                    }
                    : wrap
            };
        } else if (step == "emoji") {
            var wrap = new WrapPanel();
            foreach (var emoji in EmojiData.Groups.SelectMany(g => g.Emojis)) {
                var tile = new Border {
                    Width = 40,
                    Height = 40,
                    Background = Brushes.Transparent,
                    Cursor = new Cursor(StandardCursorType.Hand),
                    Child = new TextBlock {
                        Text = emoji,
                        FontSize = 24,
                        HorizontalAlignment = HorizontalAlignment.Center,
                        VerticalAlignment = VerticalAlignment.Center
                    },
                };
                tile.PointerPressed += (_, e) => {
                    e.Handled = true;
                    Pick(StickerIcon.OfEmoji(emoji));
                };
                wrap.Children.Add(tile);
            }

            body = new ScrollViewer {
                Height = 220,
                Content = wrap
            };
        } else {
            var stack = new StackPanel();
            stack.Children.Add(Cancel(controller.T("sticker.cover.pack"),
                () => AskCover("pack")));
            stack.Children.Add(Cancel(controller.T("sticker.cover.upload"),
                () => _ = FromDevice()));
            stack.Children.Add(Cancel(controller.T("sticker.cover.emoji"),
                () => AskCover("emoji")));
            body = stack;
        }

        dialog.Show(window, colors, controller.T("sticker.cover.title"), null,
            body);

        async Task FromDevice()
        {
            var path = await FilePicker.PickImage(window);
            if (path == null)
                return;
            Ops.Start("upload sticker group icon", Path.GetFileName(path));
            try {
                var icon = await controller.UploadGroupIcon(path);
                Ops.Done("upload sticker group icon");
                Pick(icon);
            } catch (Exception e) {
                Ops.Fail("upload sticker group icon", e);
                controller.ShowNotice(
                    controller.T("sticker.add.failed",
                        ("reason", Failure.Reason(e, k => controller.T(k)))),
                    NoticeKind.Error);
            }
        }
    }

    private Border StickerImage(ColorTokens colors, Sticker sticker,
        double size)
    {
        var image = new Image {
            Stretch = Stretch.Uniform
        };
        controller.Pictures.Attach(image, sticker.Url, (int)size, (int)size);
        var tile = new Border {
            Width = size,
            Height = size,
            CornerRadius = new CornerRadius(10),
            Padding = new Thickness(4),
            Margin = new Thickness(Gap / 2),
            Background = Brushes.Transparent,
            Cursor = new Cursor(StandardCursorType.Hand),
            Child = image,
        };
        Avalonia.Automation.AutomationProperties.SetName(tile,
            sticker.Shortcode);
        tile.PointerEntered += (_, _) =>
            tile.Background = new SolidColorBrush(colors.Hover);
        tile.PointerExited += (_, _) => tile.Background = Brushes.Transparent;
        return tile;
    }

    private void OpenSettings()
    {
        var window = Window;
        if (window == null || gear == null)
            return;
        settings.AlignRight = true;
        settings.Width = 220;
        settings.Show(gear, window, SettingsItems());
    }

    private List<MenuItem> SettingsItems()
    {
        var (_, group, _) = Current();
        var isDefault = group.Id == StickerPack.DefaultGroup;
        var items = new List<MenuItem>();
        if (group.Stickers.Count > 0)
            items.Add(new MenuItem(controller.T("sticker.select"),
                () => SetMode(PaneMode.Choose),
                Icon: "multiSelect"));
        if (group.Stickers.Count > 1)
            items.Add(new MenuItem(controller.T("sticker.reorder"),
                () => SetMode(PaneMode.Reorder),
                Icon: "sort"));
        items.Add(new MenuItem(controller.T("sticker.name.set"), AskName,
            Icon: "edit"));
        // The default group keeps its cover and cannot be deleted: the stickers that no group has have to be somewhere.
        if (!isDefault) {
            items.Add(new MenuItem(controller.T("sticker.cover.set"),
                () => AskCover(),
                Icon: "image"));
            items.Add(new MenuItem(controller.T("sticker.group.delete"),
                AskDeleteGroup,
                Icon: "trash",
                Danger: true));
        }

        return items;
    }

    /// <summary>The entries of the settings menu, by label.</summary>
    public IReadOnlyList<string> SettingsLabels =>
        SettingsItems().Select(i => i.Label).ToList();

    private Control BarButton(ColorTokens c, string label, Action press,
        bool enabled,
        bool accent, bool danger = false)
    {
        var text = new TextBlock {
            Text = label,
            FontSize = 15,
            FontWeight = FontWeight.SemiBold,
            FontFamily = Fonts.System,
            VerticalAlignment = VerticalAlignment.Center,
            Foreground = new SolidColorBrush(!enabled ? c.TextTertiary
                : danger ? c.Danger
                : accent ? c.Accent
                : c.Text),
        };
        var button = new Border {
            Height = 30,
            Padding = new Thickness(12, 0),
            CornerRadius = new CornerRadius(15),
            Background = Brushes.Transparent,
            Cursor = enabled ? new Cursor(StandardCursorType.Hand) : null,
            Child = text,
        };
        if (enabled) {
            button.PointerEntered += (_, _) =>
                button.Background = new SolidColorBrush(c.Hover);
            button.PointerExited += (_, _) =>
                button.Background = Brushes.Transparent;
            button.PointerPressed += (_, e) => {
                e.Handled = true;
                press();
            };
        }

        Avalonia.Automation.AutomationProperties.SetName(button, label);
        return button;
    }

    // What the pane shows comes from these parts of the state; the store
    // changes for many other reasons (every message, every typing mark),
    // and the tiles are not made again for those.
    private IReadOnlyList<Sticker>? seenStickers;
    private IReadOnlyList<StickerGroup>? seenGroups;
    private string? seenGroup;
    private string? seenLocale;
    private FontFamily? seenFont;

    private bool Differs(AppState state)
    {
        return !ReferenceEquals(seenStickers, state.Stickers) ||
               !ReferenceEquals(seenGroups, state.StickerGroups) ||
               seenGroup != state.Prefs.StickerGroup ||
               seenLocale != state.Locale ||
               !Equals(seenFont, Fonts.System);
    }

    private void Apply()
    {
        var c = ThemeScope.GetColors(this);
        var s = controller.Store.Value;
        seenStickers = s.Stickers;
        seenGroups = s.StickerGroups;
        seenGroup = s.Prefs.StickerGroup;
        seenLocale = s.Locale;
        seenFont = Fonts.System;
        Background = new SolidColorBrush(c.Bg);
        tabs.BorderBrush = new SolidColorBrush(c.Separator);
        var (groups, group, index) = Current();
        var isDefault = group.Id == StickerPack.DefaultGroup;
        var shown = group.Stickers
            .Select(code => s.Stickers.FirstOrDefault(x => x.Shortcode == code))
            .OfType<Sticker>().ToList();

        // The bar.
        var row = new Grid {
            ColumnDefinitions = new ColumnDefinitions("*,Auto")
        };
        if (Mode == PaneMode.Browse) {
            row.Children.Add(new TextBlock {
                Text = Label(group, index),
                FontSize = 16,
                FontWeight = FontWeight.Bold,
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(c.Text),
                Margin = new Thickness(8, 0, 0, 0),
                TextTrimming = TextTrimming.CharacterEllipsis,
                VerticalAlignment = VerticalAlignment.Center,
            });
            var button = new Border {
                Width = 34,
                Height = 30,
                CornerRadius = new CornerRadius(15),
                Background = Brushes.Transparent,
                Cursor = new Cursor(StandardCursorType.Hand),
                Child = new Icon {
                    Glyph = "gear",
                    Size = 20,
                    Color = new SolidColorBrush(c.TextSecondary),
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                },
            };
            gear = button;
            button.PointerEntered += (_, _) =>
                button.Background = new SolidColorBrush(c.Hover);
            button.PointerExited += (_, _) =>
                button.Background = Brushes.Transparent;
            button.PointerPressed += (_, e) => {
                e.Handled = true;
                OpenSettings();
            };
            Avalonia.Automation.AutomationProperties.SetName(button,
                controller.T("sticker.settings"));
            Grid.SetColumn(button, 1);
            row.Children.Add(button);
        } else {
            row.Children.Add(BarButton(c, controller.T("sticker.done"), Stop,
                true, true));
            if (Mode == PaneMode.Choose) {
                var delete = BarButton(c, controller.T("sticker.delete"),
                    AskRemove,
                    chosen.Count > 0, false,
                    true);
                Grid.SetColumn(delete, 1);
                row.Children.Add(delete);
            } else {
                var hint = new TextBlock {
                    Text = controller.T("sticker.reorder.hint"),
                    FontSize = 15,
                    FontWeight = FontWeight.Bold,
                    FontFamily = Fonts.System,
                    Foreground = new SolidColorBrush(c.Text),
                    Margin = new Thickness(0, 0, 8, 0),
                    VerticalAlignment = VerticalAlignment.Center,
                };
                Grid.SetColumn(hint, 1);
                row.Children.Add(hint);
            }
        }

        bar.Child = row;

        // The grid.
        grid.Children.Clear();
        if (Mode == PaneMode.Browse) {
            var add = new Border {
                Width = Tile,
                Height = Tile,
                Margin = new Thickness(Gap / 2),
                CornerRadius = new CornerRadius(10),
                Background = new SolidColorBrush(c.BgSecondary),
                Cursor = new Cursor(StandardCursorType.Hand),
                Child = new Icon {
                    Glyph = "plus",
                    Size = 28,
                    Color = new SolidColorBrush(c.TextSecondary),
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                },
            };
            add.PointerPressed += (_, e) => {
                e.Handled = true;
                _ = Pick();
            };
            Avalonia.Automation.AutomationProperties.SetName(add,
                controller.T("sticker.new"));
            grid.Children.Add(add);
        }

        for (var i = 0; i < shown.Count; i++) {
            var sticker = shown[i];
            var tile = StickerImage(c, sticker, Tile);
            var at = i;
            if (Mode == PaneMode.Choose) {
                var on = chosen.Contains(sticker.Shortcode);
                if (on)
                    tile.Background = new SolidColorBrush(c.Bg.R < 128
                        ? Color.FromRgb(
                            (byte)((c.Bg.R + c.Accent.R * 0.18) / 1.18),
                            (byte)((c.Bg.G + c.Accent.G * 0.18) / 1.18),
                            (byte)((c.Bg.B + c.Accent.B * 0.18) / 1.18))
                        : Color.FromRgb(
                            (byte)(c.Bg.R * 0.82 + c.Accent.R * 0.18),
                            (byte)(c.Bg.G * 0.82 + c.Accent.G * 0.18),
                            (byte)(c.Bg.B * 0.82 + c.Accent.B * 0.18)));
                var picture = tile.Child!;
                tile.Child = null;
                tile.Child = new Grid {
                    Children = {
                        picture,
                        new Border {
                            Width = 20,
                            Height = 20,
                            CornerRadius = new CornerRadius(10),
                            BorderThickness = new Thickness(2),
                            BorderBrush =
                                new SolidColorBrush(
                                    on ? c.Accent : c.TextTertiary),
                            Background =
                                new SolidColorBrush(on ? c.Accent : c.Bg),
                            HorizontalAlignment = HorizontalAlignment.Right,
                            VerticalAlignment = VerticalAlignment.Top,
                            Margin = new Thickness(0, -1, -1, 0),
                            Child = on
                                ? new Icon {
                                    Glyph = "check",
                                    Size = 12,
                                    Color = new SolidColorBrush(c.OnAccent),
                                    HorizontalAlignment =
                                        HorizontalAlignment.Center,
                                    VerticalAlignment =
                                        VerticalAlignment.Center,
                                }
                                : null,
                        },
                    },
                };
            }

            if (Mode == PaneMode.Reorder) {
                var arrows = new StackPanel {
                    Orientation = Orientation.Horizontal,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Bottom,
                    Spacing = 4,
                };
                if (at > 0)
                    arrows.Children.Add(Arrow(c, "back",
                        () => _ = Move(at, at - 1)));
                if (at < shown.Count - 1)
                    arrows.Children.Add(Arrow(c, "chevronRight",
                        () => _ = Move(at, at + 1)));
                var picture = tile.Child!;
                tile.Child = null;
                tile.Child = new Grid {
                    Children = {
                        picture,
                        arrows
                    }
                };
            }

            tile.PointerPressed += (_, e) => {
                e.Handled = true;
                if (Mode == PaneMode.Choose)
                    Choose(sticker.Shortcode);
                else if (Mode == PaneMode.Browse)
                    Send(sticker.Shortcode);
            };
            grid.Children.Add(tile);
        }

        if (shown.Count == 0)
            grid.Children.Add(new TextBlock {
                Text =
                    isDefault
                        ? controller.T("sticker.empty")
                        : controller.T("sticker.group.empty"),
                FontSize = 13,
                LineHeight = 18,
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(c.TextSecondary),
                TextWrapping = TextWrapping.Wrap,
                Width = WidthOf(MaxCols) - 2 * Pad,
                Margin = new Thickness(8, 12, 8, 0),
            });

        BuildTabs(c, groups, group, s.Stickers);
    }

    private static Border Arrow(ColorTokens c, string glyph, Action press)
    {
        var arrow = new Border {
            Width = 24,
            Height = 24,
            CornerRadius = new CornerRadius(12),
            Background = new SolidColorBrush(c.Accent),
            Cursor = new Cursor(StandardCursorType.Hand),
            Child = new Icon {
                Glyph = glyph,
                Size = 14,
                Color = new SolidColorBrush(c.OnAccent),
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
            },
        };
        arrow.PointerPressed += (_, e) => {
            e.Handled = true;
            press();
        };
        return arrow;
    }

    private void BuildTabs(ColorTokens c, IReadOnlyList<StickerGroup> groups,
        StickerGroup current,
        IReadOnlyList<Sticker> pack)
    {
        var row = new StackPanel {
            Orientation = Orientation.Horizontal,
            Spacing = 2
        };

        Border Tab(string label, bool selected, Action press, Control child)
        {
            var tab = new Border {
                Width = 62,
                Height = 58,
                CornerRadius = new CornerRadius(12),
                Background =
                    new SolidColorBrush(selected
                        ? c.BgSecondary
                        : Colors.Transparent),
                Cursor = new Cursor(StandardCursorType.Hand),
                Child = child,
            };
            if (!selected) {
                tab.PointerEntered += (_, _) =>
                    tab.Background = new SolidColorBrush(c.Hover);
                tab.PointerExited += (_, _) =>
                    tab.Background = Brushes.Transparent;
            }

            tab.PointerPressed += (_, e) => {
                e.Handled = true;
                press();
            };
            Avalonia.Automation.AutomationProperties.SetName(tab, label);
            return tab;
        }

        for (var i = 0; i < groups.Count; i++) {
            var g = groups[i];
            Control face = g.Id == StickerPack.DefaultGroup
                ? new Icon {
                    Glyph = "sticker",
                    Size = GroupIcon - 6,
                    Color = new SolidColorBrush(c.TextSecondary),
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                }
                : IconOf(StickerPack.CoverOf(g, pack), GroupIcon);
            var id = g.Id;
            row.Children.Add(Tab(Label(g, i), id == current.Id, () => Show(id),
                face));
        }

        if (groups.Count - 1 < StickerPack.GroupsMax)
            row.Children.Add(Tab(controller.T("sticker.group.new"), false,
                AskNewGroup,
                new Icon {
                    Glyph = "plus",
                    Size = GroupIcon - 14,
                    Color = new SolidColorBrush(c.TextSecondary),
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                }));
        tabs.Child = new ScrollViewer {
            Content = row,
            HorizontalScrollBarVisibility = ScrollBarVisibility.Hidden,
            VerticalScrollBarVisibility = ScrollBarVisibility.Disabled,
        };
    }

    /// <summary>My sticker groups as tiles to choose one from (the default group first), each with its cover and its name.</summary>
    public Control GroupChoice(Action<string> pick)
    {
        var c = ThemeScope.GetColors(this);
        var s = controller.Store.Value;
        var groups = StickerPack.WithDefault(s.StickerGroups, s.Stickers);
        var wrap = new WrapPanel {
            HorizontalAlignment = HorizontalAlignment.Center
        };
        for (var i = 0; i < groups.Count; i++) {
            var g = groups[i];
            Control face = g.Id == StickerPack.DefaultGroup
                ? new Icon {
                    Glyph = "sticker",
                    Size = GroupIcon - 6,
                    Color = new SolidColorBrush(c.TextSecondary),
                    HorizontalAlignment = HorizontalAlignment.Center,
                }
                : IconOf(StickerPack.CoverOf(g, s.Stickers), GroupIcon);
            var name = Label(g, i);
            var tile = new Border {
                Width = 84,
                Margin = new Thickness(4),
                Padding = new Thickness(0, 8),
                CornerRadius = new CornerRadius(12),
                Background = new SolidColorBrush(c.BgSecondary),
                Cursor = new Cursor(StandardCursorType.Hand),
                Child = new StackPanel {
                    Spacing = 4,
                    Children = {
                        face,
                        new TextBlock {
                            Text = name,
                            FontSize = 13,
                            FontFamily = Fonts.System,
                            Foreground = new SolidColorBrush(c.Text),
                            MaxWidth = 76,
                            TextAlignment = TextAlignment.Center,
                            TextTrimming = TextTrimming.CharacterEllipsis,
                            HorizontalAlignment = HorizontalAlignment.Center,
                        },
                    },
                },
            };
            var id = g.Id;
            tile.PointerPressed += (_, e) => {
                e.Handled = true;
                pick(id);
            };
            Avalonia.Automation.AutomationProperties.SetName(tile, name);
            wrap.Children.Add(tile);
        }

        return wrap;
    }

    /// <summary>A group's icon: its emoji, or its picture.</summary>
    public Control IconOf(StickerIcon icon, double size)
    {
        if (icon.IsEmoji)
            return new TextBlock {
                Text = icon.Emoji,
                FontSize = size - 2,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
            };
        var image = new Image {
            Stretch = Stretch.UniformToFill
        };
        controller.Pictures.Attach(image, icon.Url, (int)size, (int)size);
        return new Border {
            Width = size,
            Height = size,
            CornerRadius = new CornerRadius(size / 4),
            ClipToBounds = true,
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center,
            Child = image,
        };
    }
}
