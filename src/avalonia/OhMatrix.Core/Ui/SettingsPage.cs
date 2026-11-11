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

    // Registered once for the type: a handler made in the constructor
    // stays in the property's observers for good and runs once for each
    // control that was ever made.
    static SettingsPage()
    {
        ThemeScope.ColorsProperty.Changed
            .AddClassHandler<SettingsPage>((p, _) => p.Apply());
    }

    public SettingsPage(AppController controller)
    {
        this.controller = controller;
        zoom = new ZoomPicker(controller, this, false);
        Lifetime.Own(this, zoom);
        RowDefinitions = new RowDefinitions("Auto,*");
        Children.Add(bar);
        var scroller = new ScrollViewer {
            Content = content,
            HorizontalScrollBarVisibility =
                Avalonia.Controls.Primitives.ScrollBarVisibility.Disabled,
        };
        Grid.SetRow(scroller, 1);
        Children.Add(scroller);
        Lifetime.OwnAll(this, confirm, DownloadMenu);
        Lifetime.Watch(this, controller, _ => Apply());
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


    public Border? DownloadRow { get; private set; }
    public Menu DownloadMenu { get; } = new();

    /// <summary>The menu of the download location: the Downloads folder of the system, or a folder chosen.</summary>
    public void OpenDownloadMenu()
    {
        var window = TopLevel.GetTopLevel(this);
        if (window == null || DownloadRow == null)
            return;
        var folder = controller.Store.Value.Prefs.DownloadFolder;
        DownloadMenu.Show(DownloadRow, window, [
            new MenuItem(controller.T("downloadFolder.default"), () =>
                controller.SetPreferences(p => p with {
                    DownloadFolder = null
                }), Checked: string.IsNullOrEmpty(folder)),
            new MenuItem(controller.T("downloadFolder.choose"),
                () => _ = ChooseFolder(window),
                Checked: !string.IsNullOrEmpty(folder)),
        ]);
    }

    private async Task ChooseFolder(TopLevel window)
    {
        var picked = await window.StorageProvider.OpenFolderPickerAsync(
            new Avalonia.Platform.Storage.FolderPickerOpenOptions());
        if (picked.Count == 0)
            return;
        var path = Avalonia.Platform.Storage.StorageProviderExtensions
            .TryGetLocalPath(picked[0]);
        if (path != null)
            controller.SetPreferences(p => p with {
                DownloadFolder = path
            });
    }

    /// <summary>Asks whether to sign out; the answer is in the buttons of the dialog.</summary>
    public void AskSignOut()
    {
        var window = TopLevel.GetTopLevel(this);
        if (window == null)
            return;
        var c = ThemeScope.GetColors(this);
        var yes = new PrimaryButton {
            Title = controller.T("signOut")
        };
        var no = new TextButton {
            Title = controller.T("cancel")
        };
        yes.Click += (_, _) => {
            confirm.Close();
            _ = controller.Logout();
        };
        no.Click += (_, _) => confirm.Close();
        ThemeScope.SetColors(yes, c);
        ThemeScope.SetColors(no, c);
        confirm.Show(window, c, controller.T("signOut.title"),
            controller.T("signOut.body"), yes, no);
    }

    /// <summary>The small explanation under a setting.</summary>
    private void Footer(ColorTokens c, string text)
    {
        content.Children.Add(new TextBlock {
            Text = text,
            FontSize = 13,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.TextSecondary),
            TextWrapping = TextWrapping.Wrap,
            Margin = new Thickness(26, 6, 20, 0),
        });
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
        var launcher = TopLevel.GetTopLevel(this)?.Launcher;
        if (launcher != null)
            _ = launcher.LaunchUriAsync(new Uri(Repository));
    }

    private void Apply()
    {
        var c = ThemeScope.GetColors(this);
        var s = controller.Store.Value;
        Background = new SolidColorBrush(c.Bg);
        bar.BorderBrush = new SolidColorBrush(c.Separator);
        PageBar.Fill(bar, c, controller.T("settings"), controller.T("profile"),
            () => controller.OpenSidebarPage(SidebarPage.Profile));
        content.Children.Clear();

        Group(c, controller.T("notifications"));
        content.Children.Add(ToggleRow(c, controller.T("notif.messages"),
            NotificationsToggle,
            s.Prefs.Notifications, on => controller.SetPreferences(p => p with {
                Notifications = on
            }), 6));
        if (s.Prefs.Notifications) {
            content.Children.Add(ToggleRow(c, controller.T("notif.preview"),
                PreviewToggle,
                s.Prefs.NotificationPreview, on =>
                    controller.SetPreferences(p => p with {
                        NotificationPreview = on
                    }), 12));
        }

        content.Children.Add(new TextBlock {
            Text = controller.T("notif.footer.default"),
            FontSize = 13,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.TextSecondary),
            TextWrapping = TextWrapping.Wrap,
            Margin = new Thickness(26, 6, 20, 0),
        });

        Group(c, controller.T("appearance"));
        var language = Strings.Languages.FirstOrDefault(l => l.Id == s.Locale)
                       ?? Strings.Languages[0];
        content.Children.Add(ProfilePage.NavRow(c, "globe",
            controller.T("language"),
            () => controller.OpenSidebarPage(SidebarPage.Language), 6,
            language.Label));
        var zoomRow = ProfilePage.NavRow(c, "zoomIn", controller.T("zoom"),
            () => zoom.Open(zoomAnchor), 12,
            ZoomPicker.Percent(s.Prefs.UiScale));
        zoomAnchor = zoomRow;
        content.Children.Add(zoomRow);
        Footer(c, controller.T("zoom.footer"));
        content.Children.Add(ProfilePage.NavRow(c, "font", controller.T("font"),
            () => controller.OpenSidebarPage(SidebarPage.Font), 12,
            s.Prefs.Font ?? controller.T("font.system")));
        DownloadRow = ProfilePage.NavRow(c, "download",
            controller.T("downloadFolder"),
            OpenDownloadMenu, 12,
            s.Prefs.DownloadFolder is { Length: > 0 } dl
                ? Path.GetFileName(dl.TrimEnd('/', '\\'))
                : controller.T("downloadFolder.default"));
        content.Children.Add(DownloadRow);
        var themeName = s.Prefs.Theme == Themes.System
            ? controller.T("theme.system")
            : Themes.Get(s.Prefs.Theme)?.LabelFor(s.Locale) ?? s.Prefs.Theme;
        content.Children.Add(ProfilePage.NavRow(c, "palette",
            controller.T("theme"),
            () => controller.OpenSidebarPage(SidebarPage.Theme), 12,
            themeName));
        content.Children.Add(ToggleRow(c, controller.T("ownAccent"),
            AccentToggle,
            s.Prefs.OwnBubbleAccent,
            on => controller.SetPreferences(p => p with {
                OwnBubbleAccent = on
            }), 12));
        Footer(c, controller.T("ownAccent.footer"));

        Group(c, controller.T("advanced"));
        content.Children.Add(ProfilePage.NavRow(c, "gear",
            controller.T("advanced.options"),
            () => controller.OpenSidebarPage(SidebarPage.Advanced), 6));

        Group(c, controller.T("account"));
        content.Children.Add(ProfilePage.NavRow(c, "device",
            controller.T("sessions"),
            () => controller.OpenSidebarPage(SidebarPage.Sessions), 6));
        var row = new Border {
            Margin = new Thickness(12, 12, 12, 0),
            Padding = new Thickness(14, 0),
            Height = 48,
            CornerRadius = new CornerRadius(Radius.Control),
            Background = new SolidColorBrush(c.BgSecondary),
            Cursor =
                new Avalonia.Input.Cursor(
                    Avalonia.Input.StandardCursorType.Hand),
            Child = new TextBlock {
                Text = controller.T("signOut"),
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
        Avalonia.Automation.AutomationProperties.SetName(row,
            controller.T("signOut"));
        SignOutRow = row;
        content.Children.Add(row);

        Group(c, controller.T("about"));
        Footer(c, controller.T("about.feedback"));
        content.Children.Add(ProfilePage.NavRow(c, "external", "GitHub",
            OpenRepository, 6,
            Repository.Replace("https://github.com/", "")));
        content.Children.Add(ProfilePage.NavRow(c, "about", "OhMatrix", () => {
            }, 12,
            $"{controller.T("version")} {Version}", false));
        content.Children.Add(new Border {
            Height = 24
        });
    }

    /// <summary>The version of the app.</summary>
    public static string Version =>
        typeof(SettingsPage).Assembly.GetName().Version?.ToString(3) ?? "dev";

    private readonly Dictionary<Toggle, Action<bool>> toggled = [];

    private Control ToggleRow(ColorTokens c, string label, Toggle toggle,
        bool on,
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
