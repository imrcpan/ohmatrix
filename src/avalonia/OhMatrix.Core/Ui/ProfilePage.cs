using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.I18n;
using OhMatrix.Core.State;
using OhMatrix.Core.Theming;

namespace OhMatrix.Core.Ui;

/// <summary>
/// The profile page of the left pane (<c>ProfilePage</c>), as far as it is ported: a bar with Back to the chats, the picture, the name and the user
/// id, and the way out, which asks first.
/// </summary>
public sealed class ProfilePage : Grid {
    private readonly AppController controller;
    private readonly Dialog confirm = new();
    private readonly StackPanel content = new();

    private readonly Border bar = new() {
        Height = 56,
        BorderThickness = new Thickness(0, 0, 0, 1)
    };

    public ProfilePage(AppController controller)
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
        controller.Store.Changed += _ => Apply();
        ThemeScope.ColorsProperty.Changed.AddClassHandler<ProfilePage>((p, _) => p.Apply());
        Apply();
    }

    /// <summary>The row that signs out.</summary>
    public Border SignOutRow { get; private set; } = new();

    public Dialog Confirm => confirm;

    private string T(string key, params (string, object)[] values)
    {
        return Strings.T(controller.Store.Value.Locale, key, values);
    }

    /// <summary>Asks whether to sign out; the answer is in the buttons of the dialog.</summary>
    public void AskSignOut()
    {
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        var c = ThemeScope.GetColors(this);
        var yes = new PrimaryButton {
            Title = T("signOut")
        };
        var no = new TextButton {
            Title = T("cancel")
        };
        yes.Click += (_, _) => {
            confirm.Close();
            _ = controller.Logout();
        };
        no.Click += (_, _) => confirm.Close();
        ThemeScope.SetColors(yes, c);
        ThemeScope.SetColors(no, c);
        confirm.Show(window, c, T("signOut.title"), T("signOut.body"), yes, no);
    }

    private static Border NavRow(Theming.ColorTokens c, string glyph, string label, Action open,
        double top)
    {
        var grid = new Grid {
            ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto")
        };
        grid.Children.Add(new Icon {
            Glyph = glyph,
            Size = 22,
            Color = new SolidColorBrush(c.Accent),
            Margin = new Thickness(0, 0, 12, 0),
            VerticalAlignment = VerticalAlignment.Center,
        });
        var text = new TextBlock {
            Text = label,
            FontSize = 16,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.Text),
            VerticalAlignment = VerticalAlignment.Center,
        };
        Grid.SetColumn(text, 1);
        grid.Children.Add(text);
        var chevron = new Icon {
            Glyph = "chevronRight",
            Size = 18,
            Color = new SolidColorBrush(c.TextTertiary),
            VerticalAlignment = VerticalAlignment.Center,
        };
        Grid.SetColumn(chevron, 2);
        grid.Children.Add(chevron);
        var row = new Border {
            Margin = new Thickness(12, top, 12, 0),
            Padding = new Thickness(14, 0),
            Height = 48,
            CornerRadius = new CornerRadius(Radius.Control),
            Background = new SolidColorBrush(c.BgSecondary),
            Cursor = new Cursor(StandardCursorType.Hand),
            Child = grid,
        };
        row.PointerPressed += (_, e) => {
            e.Handled = true;
            open();
        };
        Avalonia.Automation.AutomationProperties.SetName(row, label);
        return row;
    }

    private void Apply()
    {
        var c = ThemeScope.GetColors(this);
        var s = controller.Store.Value;
        Background = new SolidColorBrush(c.Bg);
        bar.BorderBrush = new SolidColorBrush(c.Separator);
        PageBar.Fill(bar, c, T("profile"), T("chats"),
            () => controller.OpenSidebarPage(SidebarPage.Chats));

        var id = s.UserId ?? "";
        var shown = s.Profile?.DisplayName is { Length: > 0 } dn
            ? dn
            : id.TrimStart('@').Split(':')[0];
        content.Children.Clear();
        var head = new StackPanel {
            HorizontalAlignment = HorizontalAlignment.Center,
            Spacing = 2,
            Margin = new Thickness(0, 12, 0, 4),
        };
        var mine = new Avatar(id, shown.Length == 0 ? "?" : shown, 72) {
            HorizontalAlignment = HorizontalAlignment.Center
        };
        controller.Pictures.Attach(mine, s.Profile?.AvatarUrl, 72);
        head.Children.Add(mine);
        head.Children.Add(new TextBlock {
            Text = shown,
            FontSize = 22,
            FontWeight = FontWeight.Bold,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.Text),
            HorizontalAlignment = HorizontalAlignment.Center,
            Margin = new Thickness(0, 8, 0, 0),
        });
        head.Children.Add(new TextBlock {
            Text = id,
            FontSize = 15,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.TextSecondary),
            HorizontalAlignment = HorizontalAlignment.Center,
        });
        content.Children.Add(head);

        content.Children.Add(NavRow(c, "palette", T("theme"),
            () => controller.OpenSidebarPage(SidebarPage.Theme), 20));
        content.Children.Add(NavRow(c, "globe", T("language"),
            () => controller.OpenSidebarPage(SidebarPage.Language), 12));
        var row = new Border {
            Margin = new Thickness(12, 12, 12, 0),
            Padding = new Thickness(14, 0),
            Height = 48,
            CornerRadius = new CornerRadius(Radius.Control),
            Background = new SolidColorBrush(c.BgSecondary),
            Cursor = new Cursor(StandardCursorType.Hand),
            Child = new TextBlock {
                Text = T("signOut"),
                FontSize = 16,
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(c.Danger),
                VerticalAlignment = VerticalAlignment.Center,
            },
        };
        row.PointerPressed += (_, e) => {
            e.Handled = true;
            AskSignOut();
        };
        Avalonia.Automation.AutomationProperties.SetName(row, T("signOut"));
        SignOutRow = row;
        content.Children.Add(row);
    }
}
