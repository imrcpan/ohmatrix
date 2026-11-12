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
using Spinner = OhMatrix.Core.Ui.Widgets.Spinner;

namespace OhMatrix.Core.Ui.Settings;

/// <summary>
/// The sessions of the account (<c>SessionsPage</c>): this device, the other sessions with when they were last active, and a way to sign one or all
/// of the others out after the password is entered.
/// </summary>
public sealed class SessionsPage : Grid {
    private readonly AppController controller;

    private readonly Border bar = new() {
        Height = 56,
        BorderThickness = new Thickness(0, 0, 0, 1)
    };

    private readonly StackPanel content = new();
    private readonly PromptDialog confirm = new();
    private IReadOnlyList<DeviceInfo>? devices;
    private bool wasOpen;
    private TimeProvider time = TimeProvider.System;

    // Registered once for the type: a handler made in the constructor
    // stays in the property's observers for good and runs once for each
    // control that was ever made.
    static SessionsPage()
    {
        ThemeScope.ColorsProperty.Changed
            .AddClassHandler<SessionsPage>((p, _) => p.Apply());
    }

    public SessionsPage(AppController controller)
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
        Lifetime.Watch(this, controller, _ => Apply());
        Apply();
    }

    public PromptDialog Confirm => confirm;

    /// <summary>The sessions shown, this one first.</summary>
    public IReadOnlyList<DeviceInfo> Devices => devices ?? [];

    /// <summary>Asks the server for the sessions again.</summary>
    public async Task Reload()
    {
        try {
            devices = await controller.ListDevices();
        } catch (Exception) {
            devices = [];
        }

        Apply();
    }


    /// <summary>Asks for the password to sign these sessions out.</summary>
    public void AskSignOut(IReadOnlyList<string> ids, bool all)
    {
        var window = TopLevel.GetTopLevel(this);
        if (window == null)
            return;
        confirm.Show(window, ThemeScope.GetColors(this),
            controller.Store.Value.Locale,
            controller.T(all ? "sessions.confirm.all" : "sessions.confirm.one"),
            controller.T("sessions.confirm.body"),
            [new PromptField(controller.T("password"), "lock", false, true)],
            controller.T("sessions.signOut"),
            async v => {
                try {
                    await controller.RemoveDevices(ids, v[0]);
                } catch (EngineException e) when (e.Code ==
                                                  EngineErrorCode.Forbidden) {
                    throw new InvalidOperationException(
                        controller.T("sessions.wrongPassword"));
                }

                await Reload();
            });
    }

    private string LastActive(DeviceInfo d)
    {
        var ts = d.LastSeenTs;
        if (ts == null)
            return controller.T("sessions.neverSeen");
        var when = Format.Relative(ts.Value, time.GetUtcNow(),
            controller.Store.Value.Locale);
        var text = controller.T("sessions.lastActive", ("when", when));
        return d.LastSeenIp != null ? text + " · " + d.LastSeenIp : text;
    }

    private void Apply()
    {
        var c = ThemeScope.GetColors(this);
        var s = controller.Store.Value;
        var open = s.SidebarPage == SidebarPage.Sessions;
        if (open && !wasOpen) {
            wasOpen = true;
            devices = null;
            _ = Reload();
        } else if (!open)
            wasOpen = false;

        Background = new SolidColorBrush(c.Bg);
        bar.BorderBrush = new SolidColorBrush(c.Separator);
        PageBar.Title(bar, c, controller.T("sessions"));
        content.Children.Clear();
        if (devices == null) {
            content.Children.Add(new Spinner {
                Size = 28,
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 24),
            });
            return;
        }

        var current = devices.FirstOrDefault(d => d.Current);
        var others = devices.Where(d => !d.Current).ToList();
        if (current != null) {
            content.Children.Add(SettingsRows.Caption(c,
                controller.T("sessions.thisDevice")));
            content.Children.Add(Card(c, current, null));
            // Whether this session is verified by the keys of the account;
            // when it is not, it can be verified from another session.
            var security = controller.Store.Value.Security;
            if (controller.CanVerify && security == SecurityState.Ready)
                content.Children.Add(SettingsRows.Option(c, "lock",
                    controller.T("verify.state.yes"), null));
            else if (controller.CanVerify &&
                     security == SecurityState.NeedsRecovery)
                content.Children.Add(SettingsRows.Option(c, "lock",
                    controller.T("verify.session"),
                    () => _ = controller.RequestVerification(),
                    controller.T("verify.state.no")));
        }

        content.Children.Add(SettingsRows.Caption(c,
            controller.T("sessions.others")));
        if (others.Count == 0) {
            content.Children.Add(SettingsRows.Note(c,
                controller.T("sessions.empty")));
        }

        foreach (var d in others)
            content.Children.Add(Card(c, d, () => AskSignOut([d.Id], false)));
        // The note, then the way out of all the others, as on the React
        // Native page.
        content.Children.Add(SettingsRows.Note(c,
            controller.T("sessions.footer")));
        if (others.Count > 0)
            content.Children.Add(SettingsRows.Option(c, "signOut",
                controller.T("sessions.signOutAll"),
                () => AskSignOut([.. others.Select(d => d.Id)], true),
                arrow: false, danger: true));
        content.Children.Add(new Border {
            Height = 24
        });
    }

    private Border Card(ColorTokens c, DeviceInfo d, Action? press)
    {
        var grid = new Grid {
            ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto")
        };
        grid.Children.Add(new Icon {
            Glyph = "device",
            Size = SettingsShell.RowIcon,
            Color = new SolidColorBrush(c.TextSecondary),
            Margin = new Thickness(0, 0, 12, 0),
            VerticalAlignment = VerticalAlignment.Center,
        });
        var words = new StackPanel {
            VerticalAlignment = VerticalAlignment.Center
        };
        words.Children.Add(new TextBlock {
            Text = d.Name,
            FontSize = SettingsShell.RowFont,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.Text),
            TextTrimming = TextTrimming.CharacterEllipsis,
        });
        words.Children.Add(new TextBlock {
            Text = LastActive(d),
            FontSize = SettingsShell.NoteFont,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.TextSecondary),
            TextTrimming = TextTrimming.CharacterEllipsis,
        });
        Grid.SetColumn(words, 1);
        grid.Children.Add(words);
        var card = new Border {
            Padding = new Thickness(SettingsShell.Side, 6),
            MinHeight = 48,
            Background = Brushes.Transparent,
            Child = grid,
        };
        if (press != null) {
            NavRows.Hover(card, c);
            card.Cursor = new Cursor(StandardCursorType.Hand);
            card.PointerPressed += (_, e) => {
                e.Handled = true;
                press();
            };
        }

        Avalonia.Automation.AutomationProperties.SetName(card, d.Name);
        return card;
    }
}
