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

    private void Apply()
    {
        var c = ThemeScope.GetColors(this);
        var s = controller.Store.Value;
        Background = new SolidColorBrush(c.Bg);
        bar.BorderBrush = new SolidColorBrush(c.Separator);
        var back = new IconButton("back", T("chats"), 26);
        back.Click += (_, _) => controller.OpenSidebarPage(SidebarPage.Chats);
        var title = new TextBlock {
            Text = T("profile"),
            FontSize = 17,
            FontWeight = FontWeight.SemiBold,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.Text),
            VerticalAlignment = VerticalAlignment.Center,
        };
        var barRow = new StackPanel {
            Orientation = Orientation.Horizontal,
            Spacing = 6,
            Margin = new Thickness(8, 0),
            VerticalAlignment = VerticalAlignment.Center,
        };
        barRow.Children.Add(back);
        barRow.Children.Add(title);
        bar.Child = barRow;

        var id = s.UserId ?? "";
        var shown = id.TrimStart('@').Split(':')[0];
        content.Children.Clear();
        var head = new StackPanel {
            HorizontalAlignment = HorizontalAlignment.Center,
            Spacing = 2,
            Margin = new Thickness(0, 12, 0, 4),
        };
        head.Children.Add(new Avatar(id, shown.Length == 0 ? "?" : shown, 72) {
            HorizontalAlignment = HorizontalAlignment.Center
        });
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

        var row = new Border {
            Margin = new Thickness(12, 20, 12, 0),
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
