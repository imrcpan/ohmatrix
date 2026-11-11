using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;

namespace OhMatrix.Core.Ui;

/// <summary>
/// The profile page of the left pane (<c>ProfilePage</c>), as far as it is ported: a bar with Back to the chats, the picture, the name and the user
/// id, and the way out, which asks first.
/// </summary>
public sealed class ProfilePage : Grid {
    private readonly AppController controller;
    private readonly StackPanel content = new();

    private readonly Border bar = new() {
        Height = 56
    };

    // Registered once for the type: a handler made in the constructor
    // stays in the property's observers for good and runs once for each
    // control that was ever made.
    static ProfilePage()
    {
        ThemeScope.ColorsProperty.Changed.AddClassHandler<ProfilePage>((p, _) =>
            p.Apply());
    }

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
        Lifetime.OwnAll(this, NamePrompt, StatusPrompt, Viewer);
        Lifetime.Watch(this, controller, _ => Apply());
        Apply();
    }

    public PromptDialog NamePrompt { get; } = new();

    /// <summary>The row that changes the name.</summary>
    public Border NameRow { get; private set; } = new();


    /// <summary>Asks for a picture file and makes it my picture; the path can be given to skip the dialog.</summary>
    public async Task ChangePhoto(string? path = null)
    {
        if (path == null) {
            var window = TopLevel.GetTopLevel(this);
            if (window == null)
                return;
            path = await FilePicker.PickImage(window);
        }

        if (path == null)
            return;
        try {
            await controller.SetAvatar(path);
        } catch (Exception) {
            // The picture stays as it was; choosing again tries again.
        }
    }

    private void ChangePhoto()
    {
        _ = ChangePhoto(null);
    }

    /// <summary>The row that changes the status.</summary>
    public Border StatusRow { get; private set; } = new();

    public PromptDialog StatusPrompt { get; } = new();

    /// <summary>Asks for a new status line (up to 100 characters); a server without statuses says so.</summary>
    public void AskStatus()
    {
        var window = TopLevel.GetTopLevel(this);
        if (window == null)
            return;
        var s = controller.Store.Value;
        StatusPrompt.Show(window, ThemeScope.GetColors(this), s.Locale,
            controller.T("status.edit"), "",
            [
                new PromptField(controller.T("status.placeholder"), "smile",
                    true)
            ],
            controller.T("save"), async v => {
                try {
                    await controller.SetStatus(v[0].Length > 100
                        ? v[0][..100]
                        : v[0]);
                } catch (EngineException e) when (e.Code ==
                                                  EngineErrorCode.Unsupported) {
                    throw new InvalidOperationException(
                        controller.T("status.unsupported"));
                }
            });
        StatusPrompt.Fields[0].Text = s.Profile?.Status ?? "";
    }

    /// <summary>Asks for a new name.</summary>
    public void AskName()
    {
        var window = TopLevel.GetTopLevel(this);
        if (window == null)
            return;
        var s = controller.Store.Value;
        NamePrompt.Show(window, ThemeScope.GetColors(this), s.Locale,
            controller.T("editName"), "",
            [new PromptField(controller.T("name"))], controller.T("save"),
            values => controller.SetDisplayName(values[0]));
        NamePrompt.Fields[0].Text = s.Profile?.DisplayName ?? "";
    }

    public ImageViewer Viewer { get; } = new();

    internal static Border NavRow(Theming.ColorTokens c, string glyph,
        string label, Action open,
        double top, string? value = null, bool chevron = true,
        bool danger = false, bool flat = false, bool selectable = false)
    {
        var grid = new Grid {
            ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto")
        };
        grid.Children.Add(new Icon {
            Glyph = glyph,
            Size = 21,
            Color = new SolidColorBrush(danger ? c.Danger : c.TextSecondary),
            Margin = new Thickness(0, 0, 14, 0),
            VerticalAlignment = VerticalAlignment.Center,
        });
        var text = new TextBlock {
            Text = label,
            FontSize = 16,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(danger ? c.Danger : c.Text),
            TextTrimming = TextTrimming.CharacterEllipsis,
            VerticalAlignment = VerticalAlignment.Center,
        };
        Fonts.Center(text);
        Grid.SetColumn(text, 1);
        grid.Children.Add(text);
        if (value != null) {
            // A value that is not a setting can be selected to copy it.
            var shown =
                selectable ? new SelectableTextBlock() : new TextBlock();
            shown.Text = value;
            shown.FontSize = 15;
            shown.FontFamily = Fonts.System;
            shown.Foreground = new SolidColorBrush(c.TextSecondary);
            shown.Margin = new Thickness(12, 0, 6, 0);
            shown.TextAlignment = TextAlignment.Right;
            shown.TextTrimming = TextTrimming.CharacterEllipsis;
            shown.VerticalAlignment = VerticalAlignment.Center;
            Fonts.Center(shown);
            Grid.SetColumn(shown, 2);
            grid.Children.Add(shown);
            // The name keeps its room and the value takes what is left.
            grid.ColumnDefinitions =
                new ColumnDefinitions("Auto,Auto,*,Auto");
        }

        if (chevron) {
            var arrow = new Icon {
                Glyph = "chevronRight",
                Size = 16,
                Color = new SolidColorBrush(c.TextTertiary),
                VerticalAlignment = VerticalAlignment.Center,
            };
            Grid.SetColumn(arrow, value == null ? 2 : 3);
            grid.Children.Add(arrow);
        }

        // Flat: the rows follow each other with no gap, and have no
        // background of their own (the page behind them shows).
        var row = new Border {
            Margin = flat ? new Thickness(0) : new Thickness(12, top, 12, 0),
            Padding = new Thickness(flat ? 26 : 14, 0),
            Height = 48,
            CornerRadius = flat
                ? new CornerRadius(0)
                : new CornerRadius(Radius.Control),
            Background = flat
                ? Brushes.Transparent
                : new SolidColorBrush(c.BgSecondary),
            Cursor = chevron ? new Cursor(StandardCursorType.Hand) : null,
            Child = grid,
        };
        row.PointerPressed += (_, e) => {
            e.Handled = true;
            open();
        };
        if (flat)
            Hover(row, c);
        Avalonia.Automation.AutomationProperties.SetName(row, label);
        return row;
    }

    /// <summary>The row takes the colour of a hovered row while the pointer is over it.</summary>
    internal static void Hover(Border row, Theming.ColorTokens c)
    {
        var over = new SolidColorBrush(c.Hover);
        row.PointerEntered += (_, _) => row.Background = over;
        row.PointerExited += (_, _) => row.Background = Brushes.Transparent;
    }

    // The title, and the cross at the top right of the card that closes it:
    // no back arrow and no line under the bar.
    private void FillBar(Theming.ColorTokens c)
    {
        var close = new IconButton("close", controller.T("cancel"), 22, 36) {
            VerticalAlignment = VerticalAlignment.Center,
            Margin = new Thickness(0, 0, 10, 0),
        };
        close.Click += (_, _) => controller.OpenSidebarPage(SidebarPage.Chats);
        var title = new TextBlock {
            Text = controller.T("profile"),
            FontSize = 18,
            FontWeight = FontWeight.Bold,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.Text),
            VerticalAlignment = VerticalAlignment.Center,
            Margin = new Thickness(26, 0, 0, 0),
        };
        Fonts.Center(title);
        var row = new Grid {
            ColumnDefinitions = new ColumnDefinitions("*,Auto")
        };
        row.Children.Add(title);
        Grid.SetColumn(close, 1);
        row.Children.Add(close);
        bar.BorderThickness = new Thickness(0);
        bar.Child = row;
    }

    // The pill under the name (the React Native page's): a thin outline
    // that fills on hover and while pressed.
    private Control SwitchAccount(Theming.ColorTokens c)
    {
        var label = controller.T("switchAccount");
        var hover = new SolidColorBrush(c.Hover);
        var press = new SolidColorBrush(c.Separator);
        var pill = new Border {
            Padding = new Thickness(14, 4),
            CornerRadius = new CornerRadius(100),
            BorderThickness = new Thickness(1),
            BorderBrush = new SolidColorBrush(c.Separator),
            Background = Brushes.Transparent,
            Cursor = new Cursor(StandardCursorType.Hand),
            HorizontalAlignment = HorizontalAlignment.Center,
            Child = new TextBlock {
                Text = label,
                FontSize = 13,
                FontWeight = FontWeight.Medium,
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(c.Text),
            },
        };
        pill.PointerEntered += (_, _) => pill.Background = hover;
        pill.PointerExited += (_, _) => pill.Background = Brushes.Transparent;
        pill.PointerPressed += (_, e) => {
            e.Handled = true;
            pill.Background = press;
            controller.OpenSidebarPage(SidebarPage.Accounts);
        };
        Avalonia.Automation.AutomationProperties.SetName(pill, label);
        // The Account group brings its own space above it, of which the pill
        // takes some back.
        pill.Margin = new Thickness(0, 14, 0, -6);
        return pill;
    }

    private void Apply()
    {
        var c = ThemeScope.GetColors(this);
        var s = controller.Store.Value;
        Background = new SolidColorBrush(c.Bg);
        FillBar(c);

        var id = s.UserId ?? "";
        var shown = s.Profile?.DisplayName is { Length: > 0 } dn
            ? dn
            : id.TrimStart('@').Split(':')[0];
        content.Children.Clear();
        var head = new StackPanel {
            HorizontalAlignment = HorizontalAlignment.Center,
            Spacing = 2,
            Margin = new Thickness(0, 0, 0, 4),
        };
        var mine = new Avatar(id, shown.Length == 0 ? "?" : shown, 72) {
            HorizontalAlignment = HorizontalAlignment.Center
        };
        controller.Pictures.Attach(mine, s.Profile?.AvatarUrl, 72);
        if (s.Profile?.AvatarUrl is { Length: > 0 } own) {
            mine.Cursor = new Cursor(StandardCursorType.Hand);
            mine.PointerPressed += (_, e) => {
                e.Handled = true;
                var window = TopLevel.GetTopLevel(this);
                if (window != null)
                    Viewer.Show(window, controller.Pictures, own, shown, null,
                        () => controller.SavePicture(window, own, shown));
            };
        }

        head.Children.Add(mine);
        head.Children.Add(new SelectableTextBlock {
            Text = shown,
            FontSize = 22,
            FontWeight = FontWeight.Bold,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.Text),
            HorizontalAlignment = HorizontalAlignment.Center,
            Margin = new Thickness(0, 8, 0, 0),
        });
        head.Children.Add(new SelectableTextBlock {
            Text = id,
            FontSize = 15,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.TextSecondary),
            HorizontalAlignment = HorizontalAlignment.Center,
        });
        content.Children.Add(head);
        if (controller.Accounts != null)
            content.Children.Add(SwitchAccount(c));

        content.Children.Add(new TextBlock {
            Text = controller.T("account"),
            FontSize = 14,
            FontWeight = FontWeight.SemiBold,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.Accent),
            Margin = new Thickness(26, 14, 12, 4),
        });
        content.Children.Add(NavRow(c, "camera", controller.T("changePhoto"),
            ChangePhoto, 0, flat: true));
        NameRow = NavRow(c, "user", controller.T("name"), AskName, 0, shown,
            flat: true);
        content.Children.Add(NameRow);
        StatusRow = NavRow(c, "smile", controller.T("status"), AskStatus, 0,
            s.Profile?.Status ?? controller.T("status.empty"), flat: true);
        content.Children.Add(StatusRow);
        content.Children.Add(NavRow(c, "hash", controller.T("userId"), () => {
        }, 0, id, false, flat: true, selectable: true));
        content.Children.Add(NavRow(c, "info", controller.T("homeserver"),
            () => {
            }, 0,
            s.Homeserver ?? "", false, flat: true, selectable: true));
        content.Children.Add(new TextBlock {
            Text = controller.T("security"),
            FontSize = 14,
            FontWeight = FontWeight.SemiBold,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.Accent),
            Margin = new Thickness(26, 14, 12, 4),
        });
        content.Children.Add(NavRow(c, "lock", controller.T("encryption"),
            () => controller.OpenSidebarPage(SidebarPage.Encryption), 0,
            EncryptionPage.Words(s.Security, k => controller.T(k)),
            flat: true));
        content.Children.Add(NavRow(c, "gear", controller.T("settings"),
            () => controller.OpenSidebarPage(SidebarPage.Settings), 0,
            flat: true));
        content.Children.Add(new Border {
            Height = 16
        });
    }
}
