using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Platform.Storage;
using Avalonia.Threading;
using OhMatrix.Core.I18n;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;
using OhMatrix.Core.Theming;

namespace OhMatrix.Core.Ui;

/// <summary>
/// The open chat (<c>ChatPane</c>): the bar with the picture, name and member count (and Back when the list is not beside it), the messages with
/// their date dividers, and the input to write in. The view stays at the bottom while new messages come, unless the person has scrolled up.
/// </summary>
public sealed class ChatPane : Grid {
    public const double HeaderHeight = 64;

    private readonly AppController controller;
    private readonly TimeProvider time;
    private readonly Action? onBack;

    private readonly Border header = new() {
        Height = HeaderHeight,
        BorderThickness = new Thickness(0, 0, 0, 1)
    };

    private readonly StackPanel list = new() {
        Margin = new Thickness(12, 8)
    };

    private readonly ScrollViewer scroller = new() {
        HorizontalScrollBarVisibility = Avalonia.Controls.Primitives.ScrollBarVisibility.Disabled,
    };

    private readonly Border composer = new();

    private readonly Menu actions = new() {
        Width = 180
    };

    private readonly IconButton attach = new("attach", "Attach", 24, 38);

    private readonly Menu attachMenu = new() {
        Up = true,
        Width = 200,
    };

    private readonly Dialog deleteDialog = new();
    private string? editingId;
    private readonly StackPanel composerStack = new();
    private readonly Border replyHost = new();

    private readonly TextBox input = new() {
        AcceptsReturn = true,
        TextWrapping = TextWrapping.Wrap,
        FontSize = 16,
        FontFamily = Fonts.System,
        BorderThickness = new Thickness(0),
        Padding = new Thickness(0),
        Background = Brushes.Transparent,
        MaxHeight = 160,
        VerticalAlignment = VerticalAlignment.Center,
        MinHeight = 0,
    };

    private readonly Border inputBox = new() {
        MinHeight = 38,
        CornerRadius = new CornerRadius(19),
        Padding = new Thickness(14, 8),
    };

    private readonly Border send = new() {
        Width = 38,
        Height = 38,
        CornerRadius = new CornerRadius(19),
        Cursor = new Cursor(StandardCursorType.Hand),
        VerticalAlignment = VerticalAlignment.Bottom,
    };

    private readonly Icon sendIcon = new() {
        Glyph = "send",
        Size = 20,
        HorizontalAlignment = HorizontalAlignment.Center,
        VerticalAlignment = VerticalAlignment.Center,
    };

    private IReadOnlyList<TimelineItem>? shownItems;
    private string? shownRoom;
    private bool stickToBottom = true;
    private bool loadingOlder;

    public ChatPane(AppController controller, Action? onBack = null, TimeProvider? time = null)
    {
        this.controller = controller;
        this.onBack = onBack;
        this.time = time ?? TimeProvider.System;
        RowDefinitions = new RowDefinitions("Auto,*,Auto");
        scroller.Content = list;
        Grid.SetRow(scroller, 1);
        Grid.SetRow(composer, 2);
        Children.Add(header);
        Children.Add(scroller);
        Children.Add(composer);

        var bar = new Grid {
            ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto"),
            Margin = new Thickness(10, 8)
        };
        inputBox.Child = input;
        Grid.SetColumn(inputBox, 1);
        attach.VerticalAlignment = VerticalAlignment.Bottom;
        attach.Margin = new Thickness(0, 0, 10, 0);
        attach.Click += (_, _) => OpenAttach();
        bar.Children.Add(attach);
        Grid.SetColumn(send, 2);
        send.Margin = new Thickness(10, 0, 0, 0);
        send.Child = sendIcon;
        bar.Children.Add(inputBox);
        bar.Children.Add(send);
        composerStack.Children.Add(replyHost);
        composerStack.Children.Add(bar);
        composer.Child = composerStack;

        send.PointerPressed += (_, e) => {
            e.Handled = true;
            Submit();
        };
        input.KeyDown += (_, e) => {
            if (e.Key == Key.Enter && !e.KeyModifiers.HasFlag(KeyModifiers.Shift)) {
                e.Handled = true;
                Submit();
            }
        };
        input.PropertyChanged += (_, e) => {
            if (e.Property == TextBox.TextProperty)
                Apply();
        };
        scroller.ScrollChanged += (_, _) => OnScroll();
        controller.Store.Changed += _ => Apply();
        ThemeScope.ColorsProperty.Changed.AddClassHandler<ChatPane>((p, _) => p.Rebuild());
        SizeChanged += (_, _) => Rebuild();
        Apply();
    }

    public StackPanel Messages => list;
    public TextBox Input => input;
    public Border Header => header;

    /// <summary>Sends what is in the input.</summary>
    public void Submit()
    {
        var text = input.Text ?? "";
        if (text.Trim().Length == 0)
            return;
        input.Text = "";
        stickToBottom = true;
        _ = controller.Send(text);
    }

    private string T(string key, params (string, object)[] values)
    {
        return Strings.T(controller.Store.Value.Locale, key, values);
    }

    private void OnScroll()
    {
        var atBottom = scroller.Offset.Y >= scroller.Extent.Height - scroller.Viewport.Height - 40;
        stickToBottom = atBottom;
        // Near the top: older messages are asked for.
        if (scroller.Offset.Y < 80 && !loadingOlder &&
            scroller.Extent.Height > scroller.Viewport.Height) {
            loadingOlder = true;
            var before = scroller.Extent.Height;
            _ = controller.LoadOlder().ContinueWith(_ => Dispatcher.UIThread.Post(() => {
                loadingOlder = false;
                // Keep what was being read where it was while the older lines are put above it.
                scroller.Offset =
                    new Vector(0, scroller.Offset.Y + scroller.Extent.Height - before);
            }));
        }
    }

    private void Apply()
    {
        var c = ThemeScope.GetColors(this);
        Background = new SolidColorBrush(c.ChatBg);
        composer.Background = new SolidColorBrush(c.Bg);
        inputBox.Background = new SolidColorBrush(c.BgSecondary);
        input.Foreground = new SolidColorBrush(c.Text);
        input.CaretBrush = new SolidColorBrush(c.Text);
        input.SelectionBrush = new SolidColorBrush(c.Accent, 0.4);
        input.PlaceholderText = T("message");
        input.Resources["TextControlPlaceholderForeground"] = new SolidColorBrush(c.TextSecondary);
        input.Resources["TextControlPlaceholderForegroundFocused"] =
            new SolidColorBrush(c.TextSecondary);
        input.Resources["TextControlBackgroundFocused"] = Brushes.Transparent;
        input.Resources["TextControlBackgroundPointerOver"] = Brushes.Transparent;
        input.Resources["TextControlBorderBrushFocused"] = Brushes.Transparent;
        input.Resources["TextControlBorderBrushPointerOver"] = Brushes.Transparent;
        var ready = (input.Text ?? "").Trim().Length > 0;
        send.Background = new SolidColorBrush(ready ? c.Accent : c.Separator);
        sendIcon.Color = new SolidColorBrush(ready ? c.OnAccent : c.TextSecondary);
        Avalonia.Automation.AutomationProperties.SetName(send, T("send.files.send"));
        Avalonia.Automation.AutomationProperties.SetName(attach, T("attach.label"));

        var s = controller.Store.Value;
        replyHost.Child = ReplyBanner(c, s);
        // Starting to edit puts the text of the message in the field, once.
        if (s.Editing?.Id != editingId) {
            editingId = s.Editing?.Id;
            if (s.Editing is { } e)
                input.Text = e.Body;
        }

        if (!ReferenceEquals(shownItems, s.Timeline) || shownRoom != s.SelectedRoomId) {
            shownRoom = s.SelectedRoomId;
            Rebuild();
        } else
            BuildHeader(c, s);
    }

    /// <summary>Who is typing, in words (<c>typingLabel</c>).</summary>
    public string TypingLabel(IReadOnlyList<string> names, bool direct)
    {
        if (names.Count == 0)
            return "";
        if (direct)
            return T("typing.short");
        return names.Count switch {
            1 => T("typing.one", ("a", names[0])),
            2 => T("typing.two", ("a", names[0]), ("b", names[1])),
            _ => T("typing.many", ("a", names[0]), ("n", names.Count - 1)),
        };
    }

    private void BuildHeader(ColorTokens c, AppState s)
    {
        header.Background = new SolidColorBrush(c.Bg);
        header.BorderBrush = new SolidColorBrush(c.Separator);
        var room = s.Rooms.FirstOrDefault(r => r.Id == s.SelectedRoomId);
        var row = new StackPanel {
            Orientation = Orientation.Horizontal,
            Spacing = 10,
            Margin = new Thickness(onBack is null ? 20 : 8, 0, 12, 0),
            VerticalAlignment = VerticalAlignment.Center,
        };
        if (onBack is not null) {
            var back = new IconButton("back", T("back"), 26);
            back.Click += (_, _) => onBack();
            row.Children.Add(back);
        }

        if (room is not null) {
            var avatar = new Avatar(room.Id, room.Name, 38, room.IsSpace);
            controller.Pictures.Attach(avatar, room.AvatarUrl, 38);
            row.Children.Add(avatar);
            var words = new StackPanel {
                VerticalAlignment = VerticalAlignment.Center
            };
            words.Children.Add(new TextBlock {
                Text = room.Name,
                FontSize = 17,
                FontWeight = FontWeight.SemiBold,
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(c.Text),
                TextTrimming = TextTrimming.CharacterEllipsis,
            });
            var typing = s.Typing;
            words.Children.Add(new TextBlock {
                Text = typing.Count > 0 ? TypingLabel(typing, room.IsDirect)
                    : room.IsDirect ? T("directChat")
                    : room.MemberCount == 1 ? T("member.one")
                    : T("members", ("n", room.MemberCount)),
                FontSize = 14,
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(typing.Count > 0 ? c.Accent : c.TextSecondary),
            });
            row.Children.Add(words);
        }

        var bar = new Grid {
            ColumnDefinitions = new ColumnDefinitions("*,Auto")
        };
        bar.Children.Add(row);
        var info = new IconButton("info", T("chatInfo"), 24) {
            Margin = new Thickness(0, 0, 12, 0),
            Tint = s.RoomInfoOpen ? c.Accent : null,
        };
        info.Click += (_, _) => controller.OpenRoomInfo(!controller.Store.Value.RoomInfoOpen);
        Grid.SetColumn(info, 1);
        bar.Children.Add(info);
        header.Child = bar;
    }

    private void Rebuild()
    {
        var c = ThemeScope.GetColors(this);
        var s = controller.Store.Value;
        shownItems = s.Timeline;
        BuildHeader(c, s);
        var room = s.Rooms.FirstOrDefault(r => r.Id == s.SelectedRoomId);
        var group = room is not null && !room.IsDirect;
        var width = Bounds.Width > 0 ? Bounds.Width : 800;
        var maxBubble = Math.Min(560, (width - 24) * 0.8);
        var now = time.GetUtcNow();
        list.Children.Clear();
        var items = s.Timeline;
        for (var i = 0; i < items.Count; i++) {
            var item = items[i];
            if (item.Kind == TimelineKind.Date) {
                list.Children.Add(DateChip(c, Format.DayLabel(item.Ts, now, s.Locale, k => T(k))));
                continue;
            }

            var above = i > 0 && SameRun(items[i - 1], item);
            var below = i + 1 < items.Count && SameRun(item, items[i + 1]);
            var bubble = new Bubble(
                c,
                item.Body,
                Format.Clock(item.Ts, s.Locale),
                item.IsOwn,
                group ? item.SenderName : null,
                item.SenderId,
                above,
                below,
                item.Sending,
                item.Failed,
                item.Edited ? T("edited") : null,
                s.Prefs.OwnBubbleAccent,
                item.Reply,
                item.Image,
                controller.Pictures,
                item.File
            );
            bubble.PointerPressed += (_, e) => {
                if (e.GetCurrentPoint(bubble).Properties.IsRightButtonPressed) {
                    e.Handled = true;
                    OpenActions(bubble, item);
                }
            };
            var column = new StackPanel {
                MaxWidth = maxBubble,
                HorizontalAlignment =
                    item.IsOwn ? HorizontalAlignment.Right : HorizontalAlignment.Left,
                Margin = new Thickness(0, above ? 2 : 6, 0, 0),
            };
            column.Children.Add(bubble);
            if (item.Reactions.Count > 0)
                column.Children.Add(Chips(c, item, s.Prefs.OwnBubbleAccent));
            list.Children.Add(column);
        }

        if (stickToBottom)
            Dispatcher.UIThread.Post(() => scroller.ScrollToEnd(), DispatcherPriority.Background);
    }

    /// <summary>The menu of a message: answer it, or react to it.</summary>
    public void OpenActions(Control anchor, TimelineItem item)
    {
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        var items = new List<MenuItem> {
            new(T("reply"), () => controller.SetReplyTo(item), Icon: "reply"),
        };
        if (item.IsOwn && item.EventId is not null && !item.Failed) {
            items.Add(new MenuItem(T("edit"), () => controller.StartEdit(item), Icon: "edit"));
            items.Add(new MenuItem(T("delete"), () => AskDelete(window, item), Icon: "trash",
                Danger: true));
        }

        foreach (var emoji in QuickReactions) {
            var mine = item.Reactions.Any(r => r.Key == emoji && r.Mine);
            items.Add(new MenuItem(emoji, () => _ = controller.ToggleReaction(item.Id, emoji),
                Checked: mine));
        }

        actions.Show(anchor, window, items);
    }

    public Menu Actions => actions;
    public Menu AttachMenu => attachMenu;

    /// <summary>The menu of the paperclip: a photo or a file, picked from disk and sent to the chat.</summary>
    public void OpenAttach()
    {
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        attachMenu.Show(
            attach,
            window,
            [
                new MenuItem(T("attach.image"), () => _ = PickAndSend(window, true), Icon: "image"),
                new MenuItem(T("attach.file"), () => _ = PickAndSend(window, false), Icon: "file"),
            ]
        );
    }

    private async Task PickAndSend(TopLevel window, bool images)
    {
        var provider = window.StorageProvider;
        if (!provider.CanOpen)
            return;
        var files = await provider.OpenFilePickerAsync(
            new Avalonia.Platform.Storage.FilePickerOpenOptions {
                AllowMultiple = true,
                FileTypeFilter =
                    images ? [Avalonia.Platform.Storage.FilePickerFileTypes.ImageAll] : null,
            });
        foreach (var file in files) {
            if (file.TryGetLocalPath() is { } path) {
                try {
                    await controller.SendAttachment(path);
                } catch (Exception) {
                    // The file stays unsent; the person can try again.
                }
            }
        }
    }

    public Dialog DeleteDialog => deleteDialog;

    private void AskDelete(TopLevel window, TimelineItem item)
    {
        var c = ThemeScope.GetColors(this);
        var yes = new PrimaryButton {
            Title = T("delete")
        };
        var no = new TextButton {
            Title = T("cancel")
        };
        ThemeScope.SetColors(yes, c);
        ThemeScope.SetColors(no, c);
        yes.Click += (_, _) => {
            deleteDialog.Close();
            _ = controller.DeleteMessage(item.Id);
        };
        no.Click += (_, _) => deleteDialog.Close();
        deleteDialog.Show(window, c, T("delete.title"), T("delete.body"), yes, no);
    }

    public static readonly string[] QuickReactions = ["👍", "❤️", "😂", "🎉", "😮", "😢"];

    private Control Chips(ColorTokens c, TimelineItem item, bool accent)
    {
        var own = item.IsOwn && accent;
        var baseColor = own ? c.BubbleOut : c.BubbleIn;
        var ink = own ? c.BubbleOutText : c.BubbleInText;
        var strong = ThemeColor.Mix(baseColor, ink, 0.2);
        var panel = new WrapPanel {
            Margin = new Thickness(0, 3, 0, 0),
            HorizontalAlignment = item.IsOwn ? HorizontalAlignment.Right : HorizontalAlignment.Left,
        };
        foreach (var r in item.Reactions) {
            var row = new StackPanel {
                Orientation = Orientation.Horizontal,
                Spacing = 4
            };
            row.Children.Add(new TextBlock {
                Text = r.Key,
                FontSize = 14,
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(ink),
                VerticalAlignment = VerticalAlignment.Center,
            });
            if (r.Count > 1 || !r.Mine) {
                row.Children.Add(new TextBlock {
                    Text = r.Count.ToString(),
                    FontSize = 13,
                    FontWeight = r.Mine ? FontWeight.Bold : FontWeight.SemiBold,
                    FontFamily = Fonts.System,
                    Foreground = new SolidColorBrush(ink),
                    VerticalAlignment = VerticalAlignment.Center,
                });
            }

            var chip = new Border {
                Height = 26,
                Padding = new Thickness(9, 0),
                CornerRadius = new CornerRadius(13),
                Margin = new Thickness(0, 0, 4, 4),
                Background = new SolidColorBrush(r.Mine ? strong : baseColor),
                Cursor = new Cursor(StandardCursorType.Hand),
                Child = row,
            };
            var key = r.Key;
            chip.PointerPressed += (_, e) => {
                e.Handled = true;
                _ = controller.ToggleReaction(item.Id, key);
            };
            Avalonia.Automation.AutomationProperties.SetName(chip, $"{r.Key} {r.Count}");
            panel.Children.Add(chip);
        }

        return panel;
    }

    private Control? ReplyBanner(ColorTokens c, AppState s)
    {
        var editing = s.Editing;
        if (s.ReplyTo is not { } to && editing is null)
            return null;
        to = editing ?? s.ReplyTo!;
        var grid = new Grid {
            ColumnDefinitions = new ColumnDefinitions("Auto,Auto,*,Auto"),
            Margin = new Thickness(12, 8, 12, 0),
        };
        var icon = new Icon {
            Glyph = editing is null ? "reply" : "edit",
            Size = 20,
            Color = new SolidColorBrush(c.Accent),
            Margin = new Thickness(0, 0, 10, 0),
            VerticalAlignment = VerticalAlignment.Center,
        };
        var bar = new Border {
            Width = 2,
            CornerRadius = new CornerRadius(1),
            Background = new SolidColorBrush(c.Accent),
            Margin = new Thickness(0, 0, 10, 0),
        };
        Grid.SetColumn(bar, 1);
        var words = new StackPanel();
        words.Children.Add(new TextBlock {
            Text = editing is not null ? T("edit.title") : to.IsOwn ? T("you") : to.SenderName,
            FontSize = 14,
            FontWeight = FontWeight.SemiBold,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.Accent),
            TextTrimming = TextTrimming.CharacterEllipsis,
        });
        words.Children.Add(new TextBlock {
            Text = to.Body,
            FontSize = 14,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.TextSecondary),
            TextTrimming = TextTrimming.CharacterEllipsis,
        });
        Grid.SetColumn(words, 2);
        var cancel = new IconButton("close", T("cancel"), 18, 28) {
            Tint = c.TextSecondary
        };
        cancel.Click += (_, _) => {
            if (editing is not null) {
                controller.StartEdit(null);
                input.Text = "";
            } else
                controller.SetReplyTo(null);
        };
        Grid.SetColumn(cancel, 3);
        grid.Children.Add(icon);
        grid.Children.Add(bar);
        grid.Children.Add(words);
        grid.Children.Add(cancel);
        return grid;
    }

    private static bool SameRun(TimelineItem a, TimelineItem b)
    {
        return a.Kind == TimelineKind.Message && b.Kind == TimelineKind.Message &&
               a.SenderId == b.SenderId && a.IsOwn == b.IsOwn &&
               Math.Abs(b.Ts - a.Ts) < 5 * 60_000;
    }

    private static Control DateChip(ColorTokens c, string label)
    {
        return new Border {
            Background = new SolidColorBrush(c.ServiceChip),
            CornerRadius = new CornerRadius(999),
            Padding = new Thickness(12, 4),
            Margin = new Thickness(0, 10, 0, 4),
            HorizontalAlignment = HorizontalAlignment.Center,
            Child = new TextBlock {
                Text = label,
                FontSize = 13,
                FontWeight = FontWeight.Medium,
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(c.ServiceChipText),
            },
        };
    }
}
