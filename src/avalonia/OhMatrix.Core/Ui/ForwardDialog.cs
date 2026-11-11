using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.I18n;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;
using OhMatrix.Core.Theming;

namespace OhMatrix.Core.Ui;

/// <summary>
/// Forwarding messages, in two steps (<c>ForwardDialog</c>). First the chats to send them to are ticked (any number, with a filter box). Forward
/// then asks once more, listing only the ones ticked, all still ticked, so a wrong one can be taken off; Forward there sends. If some chats could not
/// be sent to, the dialog stays with them and says how many.
/// </summary>
public sealed class ForwardDialog : IOverlay {
    private readonly AppController controller;
    private readonly Dialog dialog = new();
    private readonly SearchField filter = new();
    private readonly StackPanel list = new();
    private HashSet<string> picked = [];
    private HashSet<string> keep = [];
    private IReadOnlyList<TimelineItem> items = [];
    private Action? sent;
    private TopLevel? window;
    private bool confirming;
    private bool sending;
    private int failed;

    public ForwardDialog(AppController controller)
    {
        this.controller = controller;
        filter.TextChanged += (_, _) => RefreshList();
    }

    public Dialog Dialog => dialog;
    public bool IsOpen => dialog.IsOpen;
    public bool Confirming => confirming;
    public SearchField Filter => filter;
    public IReadOnlyCollection<string> Picked => picked;
    public IReadOnlyCollection<string> Kept => keep;
    public int Failed => failed;

    /// <summary>The rows of chats as drawn now (their ids are in their names).</summary>
    public IReadOnlyList<Control> Rows => list.Children;

    private string T(string key, params (string, object)[] values)
    {
        return Strings.T(controller.Store.Value.Locale, key, values);
    }

    /// <summary>Opens for <paramref name="messages"/> of the open chat; <paramref name="onSent"/> runs when all went through.</summary>
    public void Show(TopLevel top, IReadOnlyList<TimelineItem> messages,
        Action? onSent = null)
    {
        window = top;
        items = messages;
        sent = onSent;
        picked = [];
        keep = [];
        confirming = false;
        failed = 0;
        filter.Text = "";
        Build();
    }

    private IReadOnlyList<RoomSummary> Postable()
    {
        return controller.Store.Value.Rooms.Where(r => !r.Invite).ToList();
    }

    /// <summary>Ticks or unticks a chat in the step that is on.</summary>
    public void Toggle(string id)
    {
        var set = confirming ? keep : picked;
        if (!set.Remove(id))
            set.Add(id);
        Build();
    }

    /// <summary>The first step is over: the second asks again, with the chats ticked.</summary>
    public void Confirm()
    {
        if (picked.Count == 0)
            return;
        keep = [.. picked];
        failed = 0;
        confirming = true;
        Build();
    }

    public void Back()
    {
        confirming = false;
        Build();
    }

    public void Close()
    {
        dialog.Close();
        confirming = false;
    }

    /// <summary>Sends the messages to the chats kept; what failed stays for another try.</summary>
    public async Task Send()
    {
        var targets = Postable()
            .Where(r => picked.Contains(r.Id) && keep.Contains(r.Id)).ToList();
        if (targets.Count == 0 || sending)
            return;
        sending = true;
        Build();
        var left = new HashSet<string>();
        foreach (var room in targets) {
            try {
                foreach (var item in items)
                    await controller.ForwardMessage(item, room.Id);
            } catch (Exception) {
                left.Add(room.Id);
            }
        }

        sending = false;
        if (left.Count == 0) {
            Close();
            controller.ShowNotice(T("forward.done"));
            sent?.Invoke();
            return;
        }

        // What was sent is done with: only the chats that failed stay, ticked, for another try.
        picked = left;
        keep = [.. left];
        failed = left.Count;
        Build();
    }

    private Control Row(ColorTokens c, RoomSummary room, bool checkedOn,
        bool disabled)
    {
        var avatar = new Avatar(room.Id, room.Name, 36, room.IsSpace) {
            VerticalAlignment = VerticalAlignment.Center
        };
        controller.Pictures.Attach(avatar, room.AvatarUrl, 36);
        var box = new Border {
            Width = 22,
            Height = 22,
            CornerRadius = new CornerRadius(11),
            BorderThickness = new Thickness(2),
            BorderBrush =
                new SolidColorBrush(checkedOn ? c.Accent : c.TextTertiary),
            Background = checkedOn
                ? new SolidColorBrush(c.Accent)
                : Brushes.Transparent,
            VerticalAlignment = VerticalAlignment.Center,
            Child = checkedOn
                ? new Icon {
                    Glyph = "check",
                    Size = 14,
                    Color = new SolidColorBrush(c.OnAccent),
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                }
                : null,
        };
        var grid = new Grid {
            ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto")
        };
        grid.Children.Add(avatar);
        var name = new TextBlock {
            Text = room.Name,
            FontSize = 15,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.Text),
            TextTrimming = TextTrimming.CharacterEllipsis,
            Margin = new Thickness(10, 0),
            VerticalAlignment = VerticalAlignment.Center,
        };
        Grid.SetColumn(name, 1);
        grid.Children.Add(name);
        Grid.SetColumn(box, 2);
        grid.Children.Add(box);
        var row = new Border {
            Padding = new Thickness(8, 6),
            CornerRadius = new CornerRadius(10),
            Background = Brushes.Transparent,
            Cursor = disabled ? null : new Cursor(StandardCursorType.Hand),
            Opacity = disabled ? 0.6 : 1,
            Child = grid,
        };
        if (!disabled) {
            row.PointerEntered += (_, _) =>
                row.Background = new SolidColorBrush(c.Hover);
            row.PointerExited += (_, _) => row.Background = Brushes.Transparent;
            var id = room.Id;
            row.PointerPressed += (_, e) => {
                e.Handled = true;
                Toggle(id);
            };
        }

        Avalonia.Automation.AutomationProperties.SetName(row, room.Name);
        return row;
    }

    // Typing in the filter changes only the rows, so the field keeps the focus.
    private void RefreshList()
    {
        if (window is null || confirming || !dialog.IsOpen)
            return;
        var c = ThemeScope.GetColors(window);
        FillPicks(c, Postable());
    }

    private void FillPicks(ColorTokens c, IReadOnlyList<RoomSummary> postable)
    {
        list.Children.Clear();
        var query = filter.Text.Trim();
        var shown = postable.Where(r => query.Length == 0
                                        || r.Name.Contains(query,
                                            StringComparison
                                                .CurrentCultureIgnoreCase))
            .ToList();
        foreach (var room in shown)
            list.Children.Add(Row(c, room, picked.Contains(room.Id), false));
        if (shown.Count == 0)
            list.Children.Add(new TextBlock {
                Text = T("forward.empty"),
                FontSize = 14,
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(c.TextSecondary),
                TextAlignment = TextAlignment.Center,
                Margin = new Thickness(0, 12),
            });
    }

    private void Build()
    {
        if (window is null)
            return;
        var c = ThemeScope.GetColors(window);
        var postable = Postable();
        list.Children.Clear();
        var content = new List<Control>();
        var primary = new PrimaryButton();
        var other = new TextButton();
        ThemeScope.SetColors(primary, c);
        ThemeScope.SetColors(other, c);
        if (confirming) {
            foreach (var room in postable.Where(r => picked.Contains(r.Id)))
                list.Children.Add(Row(c, room, keep.Contains(room.Id),
                    sending));
            content.Add(new ScrollViewer {
                MaxHeight = 300,
                Content = list
            });
            if (failed > 0)
                content.Add(new TextBlock {
                    Text = T("forward.failed", ("n", failed)),
                    FontSize = 14,
                    FontFamily = Fonts.System,
                    Foreground = new SolidColorBrush(c.Danger),
                    TextAlignment = TextAlignment.Center,
                    TextWrapping = TextWrapping.Wrap,
                });
            primary.Title = T("forward");
            primary.Loading = sending;
            primary.Disabled = keep.Count == 0;
            primary.Click += (_, _) => _ = Send();
            other.Title = T("back");
            other.Click += (_, _) => Back();
        } else {
            filter.Placeholder = T("search");
            ThemeScope.SetColors(filter, c);
            FillPicks(c, postable);
            content.Add(filter);
            content.Add(new ScrollViewer {
                MaxHeight = 300,
                Content = list
            });
            primary.Title = picked.Count > 0
                ? $"{T("forward")} ({picked.Count})"
                : T("forward");
            primary.Disabled = picked.Count == 0;
            primary.Click += (_, _) => Confirm();
            other.Title = T("cancel");
            other.Click += (_, _) => Close();
        }

        content.Add(primary);
        content.Add(other);
        dialog.Modal = confirming;
        dialog.Show(window, c,
            confirming ? T("forward.confirm") : T("forward.title"), null,
            [.. content]);
    }
}
