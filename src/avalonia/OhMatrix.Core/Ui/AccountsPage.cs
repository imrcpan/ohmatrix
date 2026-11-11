using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.State;
using OhMatrix.Core.Theming;

namespace OhMatrix.Core.Ui;

/// <summary>
/// The accounts page (<c>AccountsPage</c>), opened from Switch Account on the profile: every account (all of them keep syncing), a way to add
/// one, a menu to sign one out, and a mode to put them in order by dragging.
/// </summary>
public sealed class AccountsPage : Grid {
    public const double RowHeight = 64;

    private readonly AppController controller;
    private readonly Border bar = new();
    private readonly StackPanel content = new();
    private readonly Menu menu = new();
    private readonly Dialog confirm = new();
    private bool reordering;
    private AccountManager? watched;

    // Registered once for the type: a handler made in the constructor
    // stays in the property's observers for good and runs once for each
    // control that was ever made.
    static AccountsPage()
    {
        ThemeScope.ColorsProperty.Changed
            .AddClassHandler<AccountsPage>((p, _) => p.Apply());
    }

    public AccountsPage(AppController controller)
    {
        this.controller = controller;
        RowDefinitions = new RowDefinitions("Auto,*");
        Children.Add(bar);
        var scroller = new ScrollViewer {
            Content = content,
            HorizontalScrollBarVisibility =
                Avalonia.Controls.Primitives.ScrollBarVisibility.Disabled,
        };
        Grid.SetRow(scroller, 1);
        Children.Add(scroller);
        Lifetime.OwnAll(this, menu, confirm);
        Lifetime.Watch(this, controller, _ => Apply());
        Apply();
    }

    public Menu AccountMenu => menu;
    public Dialog SignOutDialog => confirm;
    public bool Reordering => reordering;

    /// <summary>The rows of the accounts, in order.</summary>
    public IReadOnlyList<Control> Rows => rows;

    private readonly List<Control> rows = [];


    public void SetReordering(bool on)
    {
        reordering = on;
        Apply();
    }

    private void Apply()
    {
        var manager = controller.Accounts;
        if (manager != null && !ReferenceEquals(manager, watched)) {
            watched = manager;
            Action changed = () =>
                Avalonia.Threading.Dispatcher.UIThread.Post(Apply);
            manager.Changed += changed;
            Lifetime.OnRelease(this, () => manager.Changed -= changed);
        }

        var c = ThemeScope.GetColors(this);
        Background = new SolidColorBrush(c.Bg);
        PageBar.Fill(bar, c, controller.T("accounts"), controller.T("profile"),
            () => controller.OpenSidebarPage(SidebarPage.Profile), 18);
        content.Children.Clear();
        rows.Clear();
        var list = manager?.Accounts ?? [];
        // Sort sits at the top right, on the line of the title.
        if (list.Count > 1) {
            var sort = new TextButton {
                Title = controller.T(reordering
                    ? "accounts.reorder.done"
                    : "accounts.reorder"),
                HorizontalAlignment = HorizontalAlignment.Right,
                VerticalAlignment = VerticalAlignment.Center,
                Height = 36,
                Padding = new Thickness(12, 0),
                CornerRadius = new CornerRadius(18),
                Margin = new Thickness(0, 0, 10, 0),
            };
            sort.Click += (_, _) => SetReordering(!reordering);
            ThemeScope.SetColors(sort, c);
            var line = new Grid();
            var title = bar.Child;
            bar.Child = null;
            line.Children.Add(title);
            line.Children.Add(sort);
            bar.Child = line;
        } else
            reordering = false;

        if (reordering) {
            BuildReorder(c, list);
            return;
        }

        content.Children.Add(AddRow(c));
        foreach (var account in list) {
            var row = AccountRow(c, account, false);
            rows.Add(row);
            content.Children.Add(row);
        }
    }

    private Control AddRow(ColorTokens c)
    {
        var grid = new Grid {
            ColumnDefinitions = new ColumnDefinitions("Auto,*"),
            Height = RowHeight,
            Margin = new Thickness(18, 0),
            Background = Brushes.Transparent,
            Cursor = new Cursor(StandardCursorType.Hand),
        };
        grid.Children.Add(new Border {
            Width = 44,
            Height = 44,
            CornerRadius = new CornerRadius(22),
            // As on the React Native page: the separator colour on dark
            // themes, a light grey on light ones.
            Background = c.Bg.R + c.Bg.G + c.Bg.B < 384
                ? new SolidColorBrush(c.Separator)
                : new SolidColorBrush(Color.FromArgb(0x1C, 60, 60, 67)),
            Margin = new Thickness(0, 0, 14, 0),
            Child = new Icon {
                Glyph = "userPlus",
                Size = 22,
                Color = new SolidColorBrush(c.TextSecondary),
                // The glyph's weight is on its left (the person), so it
                // is nudged right to look centred.
                Margin = new Thickness(3, 0, 0, 0),
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
            },
        });
        var text = new TextBlock {
            Text = controller.T("addAccount"),
            FontSize = 16,
            FontWeight = FontWeight.SemiBold,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.Text),
            VerticalAlignment = VerticalAlignment.Center,
        };
        Grid.SetColumn(text, 1);
        grid.Children.Add(text);
        grid.PointerPressed += (_, e) => {
            e.Handled = true;
            AddAccount();
        };
        AddRowControl = grid;
        return grid;
    }

    public Control? AddRowControl { get; private set; }

    /// <summary>Shows the sign-in of one more account.</summary>
    public void AddAccount()
    {
        controller.Accounts?.BeginAdd();
    }

    /// <summary>Makes an account the one in use; both it and this one go back to the chat list, so the switch ends on the main page.</summary>
    public void Switch(AccountEntry account)
    {
        var manager = controller.Accounts;
        if (manager == null)
            return;
        if (account.Controller != controller) {
            controller.OpenSidebarPage(SidebarPage.Chats);
            account.Controller.OpenSidebarPage(SidebarPage.Chats);
        }

        manager.SwitchTo(account.UserId);
    }

    private Control AccountRow(ColorTokens c, AccountEntry account, bool grip)
    {
        var state = account.Controller.Store.Value;
        var name = state.Profile?.DisplayName is { Length: > 0 } dn
            ? dn
            : account.UserId;
        var current = account.Controller == controller;
        var grid = new Grid {
            ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto"),
            Height = RowHeight,
            Margin = new Thickness(18, 0),
            Background = Brushes.Transparent,
            Cursor = new Cursor(StandardCursorType.Hand),
        };
        var avatar = new Avatar(account.UserId, name, 44) {
            Margin = new Thickness(0, 0, 14, 0)
        };
        account.Controller.Pictures.Attach(avatar, state.Profile?.AvatarUrl,
            44);
        grid.Children.Add(avatar);
        var text = new StackPanel {
            VerticalAlignment = VerticalAlignment.Center
        };
        text.Children.Add(new TextBlock {
            Text = name,
            FontSize = 16,
            FontWeight = FontWeight.SemiBold,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.Text),
            TextTrimming = TextTrimming.CharacterEllipsis,
        });
        text.Children.Add(new TextBlock {
            Text = account.UserId,
            FontSize = 13,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.TextSecondary),
            TextTrimming = TextTrimming.CharacterEllipsis,
        });
        Grid.SetColumn(text, 1);
        grid.Children.Add(text);
        Control? trailing = null;
        if (grip)
            trailing = new Icon {
                Glyph = "grip",
                Size = 24,
                Color = new SolidColorBrush(c.TextSecondary),
            };
        else if (current)
            trailing = new TextBlock {
                Text = controller.T("account.current"),
                FontSize = 14,
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(c.Accent),
            };
        else if (account.Unread > 0)
            trailing = new Border {
                MinWidth = 22,
                Height = 22,
                CornerRadius = new CornerRadius(11),
                Padding = new Thickness(6, 0),
                Background = new SolidColorBrush(c.Accent),
                Child = new TextBlock {
                    Text = account.Unread > 99
                        ? "99+"
                        : account.Unread.ToString(),
                    FontSize = 13,
                    FontWeight = FontWeight.SemiBold,
                    FontFamily = Fonts.System,
                    Foreground = Brushes.White,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                },
            };
        if (trailing != null) {
            trailing.VerticalAlignment = VerticalAlignment.Center;
            Grid.SetColumn(trailing, 2);
            grid.Children.Add(trailing);
        }

        if (!grip) {
            grid.PointerPressed += (_, e) => {
                e.Handled = true;
                if (e.GetCurrentPoint(grid).Properties.IsRightButtonPressed)
                    OpenMenu(grid, account);
                else
                    Switch(account);
            };
        }

        return grid;
    }

    /// <summary>The menu of an account: sign out of it.</summary>
    public void OpenMenu(Control anchor, AccountEntry account)
    {
        var window = TopLevel.GetTopLevel(this);
        if (window == null)
            return;
        menu.Show(anchor, window, [
            new MenuItem(controller.T("account.signOut"),
                () => AskSignOut(account),
                Icon: "signOut",
                Danger: true)
        ]);
    }

    /// <summary>Asks whether to sign out of an account; the answer is in the buttons of the dialog.</summary>
    public void AskSignOut(AccountEntry account)
    {
        var window = TopLevel.GetTopLevel(this);
        if (window == null)
            return;
        var c = ThemeScope.GetColors(this);
        var name = account.Controller.Store.Value.Profile?.DisplayName is
            { Length: > 0 } dn
            ? dn
            : account.UserId;
        var yes = new PrimaryButton {
            Title = controller.T("signOut")
        };
        var no = new TextButton {
            Title = controller.T("cancel")
        };
        yes.Click += (_, _) => {
            confirm.Close();
            _ = controller.Accounts?.Remove(account.UserId);
        };
        no.Click += (_, _) => confirm.Close();
        ThemeScope.SetColors(yes, c);
        ThemeScope.SetColors(no, c);
        confirm.Show(window, c,
            controller.T("account.signOut.title", ("name", name)),
            controller.T("signOut.body"),
            yes, no);
    }

    /// <summary>Where a row dragged <paramref name="dy"/> from the place of row <paramref name="from"/> would land.</summary>
    public static int DropIndex(int from, double dy, int count)
    {
        return Math.Clamp(from + (int)Math.Round(dy / RowHeight), 0, count - 1);
    }

    private void BuildReorder(ColorTokens c, IReadOnlyList<AccountEntry> list)
    {
        var stack = new StackPanel();
        // Where the dragged row would land: a line of the accent colour at
        // that edge of the list.
        var drop = new Border {
            Height = 2,
            Margin = new Thickness(18, 0),
            Background = new SolidColorBrush(c.Accent),
            VerticalAlignment = VerticalAlignment.Top,
            IsHitTestVisible = false,
            IsVisible = false,
            ZIndex = 3,
        };
        var host = new Grid();
        host.Children.Add(stack);
        host.Children.Add(drop);
        for (var i = 0; i < list.Count; i++) {
            var from = i;
            var row = AccountRow(c, list[i], true);
            double y0 = 0;
            var dragging = false;
            row.PointerPressed += (_, e) => {
                dragging = true;
                y0 = e.GetPosition(host).Y;
                e.Pointer.Capture(row);
                row.ZIndex = 2;
                row.Opacity = 0.9;
            };
            row.PointerMoved += (_, e) => {
                if (!dragging)
                    return;
                var dy = e.GetPosition(host).Y - y0;
                row.RenderTransform = new TranslateTransform(0, dy);
                var at = DropIndex(from, dy, list.Count);
                drop.Margin = new Thickness(18,
                    (at > from ? at + 1 : at) * RowHeight - 1, 18, 0);
                drop.IsVisible = true;
            };
            row.PointerReleased += (_, e) => {
                if (!dragging)
                    return;
                dragging = false;
                drop.IsVisible = false;
                var dy = e.GetPosition(host).Y - y0;
                row.RenderTransform = null;
                row.Opacity = 1;
                e.Pointer.Capture(null);
                var to = DropIndex(from, dy, list.Count);
                if (to != from)
                    _ = controller.Accounts?.Move(list[from].UserId, to - from);
            };
            rows.Add(row);
            stack.Children.Add(row);
        }

        content.Children.Add(host);
        content.Children.Add(new TextBlock {
            Text = controller.T("accounts.reorder.hint"),
            FontSize = 13,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.TextSecondary),
            TextWrapping = TextWrapping.Wrap,
            Margin = new Thickness(20, 8),
        });
    }
}
