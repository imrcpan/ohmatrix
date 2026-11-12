using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui.Appearance;
using OhMatrix.Core.Ui.Overlays;
using OhMatrix.Core.Ui.Support;
using OhMatrix.Core.Ui.Widgets;

namespace OhMatrix.Core.Ui;

/// <summary>
/// The page that asks which chats what another app shared is for (<c>SharePage</c>): a layer over the app with the chats to tick, a search, and a
/// second step listing the chosen ones to be sure, where Send sends to each in turn. Chats that could not be sent to stay chosen for another try.
/// </summary>
public sealed class SharePage : Grid {
    private readonly AppController controller;
    private readonly Border bar = new();
    private readonly SearchField filter = new();
    private readonly StackPanel list = new();
    private readonly Dialog confirmDialog = new();
    private readonly HashSet<string> picked = [];
    private HashSet<string> keep = [];
    private bool sending;
    private int failed;

    // Registered once for the type: a handler made in the constructor
    // stays in the property's observers for good and runs once for each
    // control that was ever made.
    static SharePage()
    {
        ThemeScope.ColorsProperty.Changed.AddClassHandler<SharePage>((p, _) =>
            p.Apply());
    }

    public SharePage(AppController controller)
    {
        this.controller = controller;
        RowDefinitions = new RowDefinitions("Auto,Auto,*");
        Children.Add(bar);
        var top = new StackPanel {
            Margin = new Thickness(16, 0, 16, 10),
            Spacing = 10
        };
        top.Children.Add(describe);
        top.Children.Add(filter);
        Grid.SetRow(top, 1);
        Children.Add(top);
        var scroller = new ScrollViewer {
            Content = list,
            HorizontalScrollBarVisibility =
                Avalonia.Controls.Primitives.ScrollBarVisibility.Disabled,
        };
        Grid.SetRow(scroller, 2);
        Children.Add(scroller);
        filter.TextChanged += (_, _) => Apply();
        Lifetime.OwnAll(this, confirmDialog);
        Lifetime.Watch(this, controller, _ => Apply());
        Apply();
    }

    private readonly TextBlock describe = new() {
        FontSize = 14,
        FontFamily = Fonts.System,
        TextTrimming = TextTrimming.CharacterEllipsis,
    };

    public Dialog Confirmation => confirmDialog;
    public IReadOnlyCollection<string> Picked => picked;
    public IReadOnlyCollection<string> Kept => keep;
    public bool Sending => sending;
    public int Failed => failed;


    /// <summary>The chats that can be posted in, in the order of the list.</summary>
    public IReadOnlyList<RoomSummary> Postable =>
        [.. controller.Store.Value.Rooms.Where(r => !r.Invite && !r.IsSpace)];

    public void Toggle(string id)
    {
        if (!picked.Remove(id))
            picked.Add(id);
        Apply();
    }

    private void Close()
    {
        controller.SetIncomingShare(null);
        picked.Clear();
        keep.Clear();
        failed = 0;
        filter.Text = "";
        confirmDialog.Close();
    }

    /// <summary>Gives the share up.</summary>
    public void Cancel() => Close();

    /// <summary>The second step: the chosen chats listed once more, all ticked, so a wrong one can be taken off.</summary>
    public void Confirm()
    {
        if (picked.Count == 0)
            return;
        var window = TopLevel.GetTopLevel(this);
        if (window == null)
            return;
        keep = [.. picked];
        failed = 0;
        ShowConfirm(window);
    }

    private void ShowConfirm(TopLevel window)
    {
        var c = ThemeScope.GetColors(this);
        var chosen = Postable.Where(r => picked.Contains(r.Id)).ToList();
        var rows = new StackPanel();
        foreach (var r in chosen)
            rows.Children.Add(Row(c, r, keep.Contains(r.Id), id => {
                if (sending)
                    return;
                if (!keep.Remove(id))
                    keep.Add(id);
                ShowConfirm(window);
            }));
        var send = new PrimaryButton {
            Title = controller.T("send.files.send"),
            Loading = sending,
            IsEnabled = keep.Count > 0 && !sending,
        };
        send.Click += async (_, _) => await Send();
        var back = new TextButton {
            Title = controller.T("back")
        };
        back.Click += (_, _) => confirmDialog.Close();
        ThemeScope.SetColors(send, c);
        ThemeScope.SetColors(back, c);
        var content = new List<Control> {
            new ScrollViewer {
                Content = rows,
                MaxHeight = 300
            }
        };
        if (failed > 0)
            content.Add(new TextBlock {
                Text = controller.T("forward.failed", ("n", failed)),
                Foreground = new SolidColorBrush(c.Danger),
                FontSize = 14,
                FontFamily = Fonts.System,
                TextAlignment = TextAlignment.Center,
            });
        content.Add(send);
        content.Add(back);
        confirmDialog.Show(window, c, controller.T("forward.confirm"), null,
            [.. content]);
    }

    /// <summary>Sends to each kept chat in turn; the ones that failed stay chosen.</summary>
    public async Task Send()
    {
        var share = controller.Store.Value.Share;
        if (share == null || sending ||
            keep.Count == 0)
            return;
        sending = true;
        var window = TopLevel.GetTopLevel(this);
        if (window != null)
            ShowConfirm(window);
        var left = new HashSet<string>();
        foreach (var id in Postable.Select(r => r.Id).Where(keep.Contains)
                     .ToList()) {
            try {
                await controller.SendShared(id, share);
            } catch (Exception) {
                left.Add(id);
            }
        }

        sending = false;
        if (left.Count == 0) {
            Close();
            return;
        }

        picked.Clear();
        foreach (var id in left)
            picked.Add(id);
        keep = [.. left];
        failed = left.Count;
        var w = TopLevel.GetTopLevel(this);
        if (w != null)
            ShowConfirm(w);
        Apply();
    }

    private Control Row(ColorTokens c, RoomSummary r, bool on,
        Action<string> toggle)
    {
        var grid = new Grid {
            ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto"),
            Margin = new Thickness(8, 2),
            Background = Brushes.Transparent,
            Cursor = new Cursor(StandardCursorType.Hand),
        };
        var avatar = new Avatar(r.Id, r.Name, 44, r.IsSpace) {
            Margin = new Thickness(8, 6, 10, 6)
        };
        controller.Pictures.Attach(avatar, r.AvatarUrl, 44);
        grid.Children.Add(avatar);
        var name = new TextBlock {
            Text = r.Name,
            FontSize = 15,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.Text),
            TextTrimming = TextTrimming.CharacterEllipsis,
            VerticalAlignment = VerticalAlignment.Center,
        };
        Grid.SetColumn(name, 1);
        grid.Children.Add(name);
        var mark = new Border {
            Width = 22,
            Height = 22,
            CornerRadius = new CornerRadius(11),
            BorderThickness = new Thickness(2),
            BorderBrush = new SolidColorBrush(on ? c.Accent : c.TextSecondary),
            Background =
                new SolidColorBrush(on ? c.Accent : Colors.Transparent),
            Margin = new Thickness(0, 0, 8, 0),
            Child = on
                ? new Icon {
                    Glyph = "check",
                    Size = 14,
                    Color = new SolidColorBrush(c.OnAccent)
                }
                : null,
        };
        Grid.SetColumn(mark, 2);
        grid.Children.Add(mark);
        grid.PointerPressed += (_, e) => {
            e.Handled = true;
            toggle(r.Id);
        };
        return grid;
    }

    private void Apply()
    {
        var s = controller.Store.Value;
        IsVisible = s.Share != null;
        if (s.Share == null)
            return;
        var c = ThemeScope.GetColors(this);
        Background = new SolidColorBrush(c.Bg);
        describe.Text = s.Share.Describe(controller.T);
        describe.Foreground = new SolidColorBrush(c.TextSecondary);
        filter.Placeholder = controller.T("search");
        var close = new IconButton("close", controller.T("cancel"), 22) {
            Tint = c.TextSecondary
        };
        close.Click += (_, _) => Cancel();
        var next = new TextButton {
            Title = picked.Count > 0
                ? $"{controller.T("send.files.send")} ({picked.Count})"
                : controller.T("send.files.send"),
            IsEnabled = picked.Count > 0,
        };
        next.Click += (_, _) => Confirm();
        ThemeScope.SetColors(next, c);
        var row = new Grid {
            ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto"),
            Margin = new Thickness(8, 0)
        };
        row.Children.Add(close);
        var title = new TextBlock {
            Text = controller.T("share.title"),
            FontSize = 20,
            FontWeight = FontWeight.Bold,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.Text),
            VerticalAlignment = VerticalAlignment.Center,
            Margin = new Thickness(8, 0),
        };
        Grid.SetColumn(title, 1);
        row.Children.Add(title);
        Grid.SetColumn(next, 2);
        row.Children.Add(next);
        bar.Child = row;
        bar.Height = 56;
        list.Children.Clear();
        var query = filter.Text.Trim();
        foreach (var r in Postable.Where(r =>
                     query.Length == 0 || r.Name.Contains(query,
                         StringComparison.CurrentCultureIgnoreCase)))
            list.Children.Add(Row(c, r, picked.Contains(r.Id), Toggle));
    }
}
