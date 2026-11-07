using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.I18n;
using OhMatrix.Core.State;
using OhMatrix.Core.Theming;

namespace OhMatrix.Core.Ui;

/// <summary>
/// The settings page (<c>SettingsPage</c>), as far as it is ported: a bar with Back to the profile and the groups Appearance (language, zoom,
/// theme, my messages in the accent colour), Account (sign out, which asks first) and About (the repository and the version).
/// </summary>
public sealed class SettingsPage : Grid {
    public const string Repository = "https://github.com/imrcpan/ohmatrix";

    private readonly AppController controller;
    private readonly Dialog confirm = new();
    private readonly ZoomPicker zoom;
    private Control zoomAnchor = new Border();
    private readonly StackPanel content = new();

    private readonly Border bar = new() {
        Height = 56,
        BorderThickness = new Thickness(0, 0, 0, 1)
    };

    public SettingsPage(AppController controller)
    {
        this.controller = controller;
        zoom = new ZoomPicker(controller, this, false);
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
        ThemeScope.ColorsProperty.Changed.AddClassHandler<SettingsPage>((p, _) => p.Apply());
        Apply();
    }

    /// <summary>The row that signs out.</summary>
    public Border SignOutRow { get; private set; } = new();

    /// <summary>The switch that puts my messages in the accent colour.</summary>
    public Toggle AccentToggle { get; } = new();

    /// <summary>The switch for notifications of new messages.</summary>
    public Toggle NotificationsToggle { get; } = new();

    /// <summary>The switch for showing the text of a message in its notification.</summary>
    public Toggle PreviewToggle { get; } = new();

    public Dialog Confirm => confirm;
    public ZoomPicker Zoom => zoom;
    public Control ZoomRow => zoomAnchor;

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

    private void Group(ColorTokens c, string title)
    {
        content.Children.Add(new TextBlock {
            Text = title,
            FontSize = 13,
            FontWeight = FontWeight.SemiBold,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.TextSecondary),
            Margin = new Thickness(26, 18, 12, 0),
        });
    }

    private void OpenRepository()
    {
        if (TopLevel.GetTopLevel(this)?.Launcher is { } launcher)
            _ = launcher.LaunchUriAsync(new Uri(Repository));
    }

    private void Apply()
    {
        var c = ThemeScope.GetColors(this);
        var s = controller.Store.Value;
        Background = new SolidColorBrush(c.Bg);
        bar.BorderBrush = new SolidColorBrush(c.Separator);
        PageBar.Fill(bar, c, T("settings"), T("profile"),
            () => controller.OpenSidebarPage(SidebarPage.Profile));
        content.Children.Clear();

        Group(c, T("notifications"));
        content.Children.Add(ToggleRow(c, T("notif.messages"), NotificationsToggle,
            s.Prefs.Notifications, on => controller.SetPreferences(p => p with {
                Notifications = on
            }), 6));
        if (s.Prefs.Notifications) {
            content.Children.Add(ToggleRow(c, T("notif.preview"), PreviewToggle,
                s.Prefs.NotificationPreview, on => controller.SetPreferences(p => p with {
                    NotificationPreview = on
                }), 12));
        }

        content.Children.Add(new TextBlock {
            Text = T("notif.footer.default"),
            FontSize = 13,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.TextSecondary),
            TextWrapping = TextWrapping.Wrap,
            Margin = new Thickness(26, 6, 20, 0),
        });

        Group(c, T("appearance"));
        var language = Strings.Languages.FirstOrDefault(l => l.Id == s.Locale)
                       ?? Strings.Languages[0];
        content.Children.Add(ProfilePage.NavRow(c, "globe", T("language"),
            () => controller.OpenSidebarPage(SidebarPage.Language), 6, language.Label));
        var zoomRow = ProfilePage.NavRow(c, "zoomIn", T("zoom"), () => zoom.Open(zoomAnchor), 12,
            ZoomPicker.Percent(s.Prefs.UiScale));
        zoomAnchor = zoomRow;
        content.Children.Add(zoomRow);
        var themeName = s.Prefs.Theme == Themes.System
            ? T("theme.system")
            : Themes.Get(s.Prefs.Theme)?.LabelFor(s.Locale) ?? s.Prefs.Theme;
        content.Children.Add(ProfilePage.NavRow(c, "palette", T("theme"),
            () => controller.OpenSidebarPage(SidebarPage.Theme), 12, themeName));
        content.Children.Add(ToggleRow(c, T("ownAccent"), AccentToggle, s.Prefs.OwnBubbleAccent,
            on => controller.SetPreferences(p => p with {
                OwnBubbleAccent = on
            }), 12));

        Group(c, T("advanced"));
        content.Children.Add(ProfilePage.NavRow(c, "gear", T("advanced.options"),
            () => controller.OpenSidebarPage(SidebarPage.Advanced), 6));

        Group(c, T("account"));
        content.Children.Add(ProfilePage.NavRow(c, "device", T("sessions"),
            () => controller.OpenSidebarPage(SidebarPage.Sessions), 6));
        var row = new Border {
            Margin = new Thickness(12, 12, 12, 0),
            Padding = new Thickness(14, 0),
            Height = 48,
            CornerRadius = new CornerRadius(Radius.Control),
            Background = new SolidColorBrush(c.BgSecondary),
            Cursor = new Avalonia.Input.Cursor(Avalonia.Input.StandardCursorType.Hand),
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

        Group(c, T("about"));
        content.Children.Add(ProfilePage.NavRow(c, "external", "GitHub", OpenRepository, 6,
            Repository.Replace("https://github.com/", "")));
        content.Children.Add(ProfilePage.NavRow(c, "about", "OhMatrix", () => {
        }, 12,
            $"{T("version")} {Version}", false));
        content.Children.Add(new Border {
            Height = 24
        });
    }

    /// <summary>The version of the app.</summary>
    public static string Version =>
        typeof(SettingsPage).Assembly.GetName().Version?.ToString(3) ?? "dev";

    private readonly Dictionary<Toggle, Action<bool>> toggled = [];

    private Control ToggleRow(ColorTokens c, string label, Toggle toggle, bool on,
        Action<bool> change, double top)
    {
        toggle.IsOn = on;
        toggle.VerticalAlignment = VerticalAlignment.Center;
        Avalonia.Automation.AutomationProperties.SetName(toggle, label);
        if (!toggled.ContainsKey(toggle))
            toggle.Changed += v => toggled[toggle](v);
        toggled[toggle] = change;
        var grid = new Grid {
            ColumnDefinitions = new ColumnDefinitions("*,Auto")
        };
        grid.Children.Add(new TextBlock {
            Text = label,
            FontSize = 16,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.Text),
            VerticalAlignment = VerticalAlignment.Center,
        });
        Grid.SetColumn(toggle, 1);
        if (toggle.Parent is Panel old)
            old.Children.Remove(toggle);
        grid.Children.Add(toggle);
        return new Border {
            Margin = new Thickness(12, top, 12, 0),
            Padding = new Thickness(14, 0),
            Height = 48,
            CornerRadius = new CornerRadius(Radius.Control),
            Background = new SolidColorBrush(c.BgSecondary),
            Child = grid,
        };
    }
}
