using Avalonia;
using Avalonia.Layout;
using Avalonia.Controls;
using Avalonia.Media;
using OhMatrix.Core.State;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui.Appearance;
using OhMatrix.Core.Ui.Support;
using OhMatrix.Core.Ui.Widgets;

namespace OhMatrix.Core.Ui;

/// <summary>
/// The general pane of the settings window (<c>SettingsPage</c>), as far as it is ported: the groups Notifications and Appearance (zoom, the
/// download location, my messages in the accent colour). The other kinds of settings have their own panes, chosen in the list at the left.
/// </summary>
public sealed class SettingsPage : Grid {
    private readonly AppController controller;
    private readonly ZoomPicker zoom;
    private Control zoomAnchor = new Border();
    private readonly Border bar = new();
    private readonly StackPanel content = new();

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
        // The lists open under their fields and line up with the right of them.
        zoom.Menu.AlignRight = true;
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
        Lifetime.Watch(this, controller, _ => Apply());
        Apply();
    }

    /// <summary>The switch that puts my messages in the accent colour.</summary>
    public Toggle AccentToggle { get; } = new();

    /// <summary>The switch for notifications of new messages.</summary>
    public Toggle NotificationsToggle { get; } = new();

    /// <summary>The switch for showing the text of a message in its notification.</summary>
    public Toggle PreviewToggle { get; } = new();

    public ZoomPicker Zoom => zoom;
    public Control ZoomRow => zoomAnchor;


    /// <summary>Asks for a folder with the system's picker, and keeps the one chosen.</summary>
    public void ChooseDownloadFolder()
    {
        var window = TopLevel.GetTopLevel(this);
        if (window != null)
            _ = ChooseFolder(window);
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

    private void Apply()
    {
        var c = ThemeScope.GetColors(this);
        var s = controller.Store.Value;
        Background = new SolidColorBrush(c.Bg);
        PageBar.Title(bar, c, controller.T("general"));
        content.Children.Clear();

        content.Children.Add(SettingsRows.Caption(c,
            controller.T("notifications")));
        content.Children.Add(Switch(c, "bell", controller.T("notif.messages"),
            NotificationsToggle,
            s.Prefs.Notifications, on => controller.SetPreferences(p => p with {
                Notifications = on
            })));
        if (s.Prefs.Notifications) {
            content.Children.Add(Switch(c, "mailUnread",
                controller.T("notif.preview"),
                PreviewToggle,
                s.Prefs.NotificationPreview, on =>
                    controller.SetPreferences(p => p with {
                        NotificationPreview = on
                    })));
        }

        content.Children.Add(SettingsRows.Note(c,
            controller.T("notif.footer.default")));

        content.Children.Add(SettingsRows.Caption(c,
            controller.T("appearance")));
        var zoomRow = SettingsRows.Dropdown(c, "zoomIn", controller.T("zoom"),
            () => zoom.Open(zoomAnchor),
            ZoomPicker.Percent(s.Prefs.UiScale), out var zoomField);
        zoomAnchor = zoomField;
        content.Children.Add(zoomRow);
        content.Children.Add(SettingsRows.Note(c, controller.T("zoom.footer")));
        // The location is a line of its own: its name, the address in a field
        // across the pane, and the two things to do with it under that.
        var folder = s.Prefs.DownloadFolder is { Length: > 0 } dl ? dl : null;
        var shown = folder ?? controller.T("downloadFolder.default");
        content.Children.Add(SettingsRows.Option(c, "download",
            controller.T("downloadFolder"), null));
        content.Children.Add(SettingsRows.PathField(c, shown, shown));
        var buttons = new StackPanel {
            Orientation = Orientation.Horizontal,
            Spacing = 8,
            Margin =
                new Thickness(SettingsShell.Side, 8, SettingsShell.Side, 4),
        };
        buttons.Children.Add(SettingsRows.Action(c, "edit",
            controller.T("downloadFolder.choose"), ChooseDownloadFolder));
        buttons.Children.Add(SettingsRows.Action(c, "refresh",
            controller.T("downloadFolder.reset"), () =>
                controller.SetPreferences(p => p with {
                    DownloadFolder = null
                }), folder != null));
        content.Children.Add(buttons);
        content.Children.Add(Switch(c, "palette", controller.T("ownAccent"),
            AccentToggle,
            s.Prefs.OwnBubbleAccent,
            on => controller.SetPreferences(p => p with {
                OwnBubbleAccent = on
            })));
        content.Children.Add(SettingsRows.Note(c,
            controller.T("ownAccent.footer")));
        content.Children.Add(new Border {
            Height = 24
        });
    }

    private readonly Dictionary<Toggle, Action<bool>> toggled = [];

    // The switch keeps its handler for good, so what it does now is looked
    // up when it is flipped.
    private Border Switch(ColorTokens c, string glyph, string label,
        Toggle toggle, bool on, Action<bool> change)
    {
        toggle.IsOn = on;
        Avalonia.Automation.AutomationProperties.SetName(toggle, label);
        if (!toggled.ContainsKey(toggle))
            toggle.Changed += v => toggled[toggle](v);
        toggled[toggle] = change;
        return SettingsRows.Switch(c, glyph, label, toggle);
    }
}
