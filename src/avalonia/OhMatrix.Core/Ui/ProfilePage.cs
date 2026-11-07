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
/// The profile page of the left pane (<c>ProfilePage</c>), as far as it is ported: a bar with Back to the chats, the picture, the name and the user
/// id, and the way out, which asks first.
/// </summary>
public sealed class ProfilePage : Grid {
    private readonly AppController controller;
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

    public PromptDialog NamePrompt { get; } = new();

    /// <summary>The row that changes the name.</summary>
    public Border NameRow { get; private set; } = new();

    private string T(string key, params (string, object)[] values)
    {
        return Strings.T(controller.Store.Value.Locale, key, values);
    }

    /// <summary>Asks for a picture file and makes it my picture; the path can be given to skip the dialog.</summary>
    public async Task ChangePhoto(string? path = null)
    {
        if (path is null) {
            if (TopLevel.GetTopLevel(this) is not { } window)
                return;
            path = await FilePicker.PickImage(window);
        }

        if (path is null)
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
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        var s = controller.Store.Value;
        StatusPrompt.Show(window, ThemeScope.GetColors(this), s.Locale, T("status.edit"), "",
            [new PromptField(T("status.placeholder"), "smile", true)], T("save"), async v => {
                try {
                    await controller.SetStatus(v[0].Length > 100 ? v[0][..100] : v[0]);
                } catch (EngineException e) when (e.Code == EngineErrorCode.Unsupported) {
                    throw new InvalidOperationException(T("status.unsupported"));
                }
            });
        StatusPrompt.Fields[0].Text = s.Profile?.Status ?? "";
    }

    /// <summary>Asks for a new name.</summary>
    public void AskName()
    {
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        var s = controller.Store.Value;
        NamePrompt.Show(window, ThemeScope.GetColors(this), s.Locale, T("editName"), "",
            [new PromptField(T("name"))], T("save"),
            values => controller.SetDisplayName(values[0]));
        NamePrompt.Fields[0].Text = s.Profile?.DisplayName ?? "";
    }

    internal static Border NavRow(Theming.ColorTokens c, string glyph, string label, Action open,
        double top, string? value = null, bool chevron = true, bool danger = false)
    {
        var grid = new Grid {
            ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto")
        };
        grid.Children.Add(new Icon {
            Glyph = glyph,
            Size = 22,
            Color = new SolidColorBrush(danger ? c.Danger : c.Accent),
            Margin = new Thickness(0, 0, 12, 0),
            VerticalAlignment = VerticalAlignment.Center,
        });
        var text = new TextBlock {
            Text = label,
            FontSize = 16,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(danger ? c.Danger : c.Text),
            VerticalAlignment = VerticalAlignment.Center,
        };
        Grid.SetColumn(text, 1);
        grid.Children.Add(text);
        if (value is not null) {
            var shown = new TextBlock {
                Text = value,
                FontSize = 15,
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(c.TextSecondary),
                Margin = new Thickness(12, 0, 6, 0),
                MaxWidth = 170,
                TextTrimming = TextTrimming.CharacterEllipsis,
                VerticalAlignment = VerticalAlignment.Center,
            };
            Grid.SetColumn(shown, 2);
            grid.Children.Add(shown);
            grid.ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto,Auto");
        }

        if (chevron) {
            var arrow = new Icon {
                Glyph = "chevronRight",
                Size = 18,
                Color = new SolidColorBrush(c.TextTertiary),
                VerticalAlignment = VerticalAlignment.Center,
            };
            Grid.SetColumn(arrow, value is null ? 2 : 3);
            grid.Children.Add(arrow);
        }

        var row = new Border {
            Margin = new Thickness(12, top, 12, 0),
            Padding = new Thickness(14, 0),
            Height = 48,
            CornerRadius = new CornerRadius(Radius.Control),
            Background = new SolidColorBrush(c.BgSecondary),
            Cursor = chevron ? new Cursor(StandardCursorType.Hand) : null,
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

        content.Children.Add(new TextBlock {
            Text = T("account"),
            FontSize = 13,
            FontWeight = FontWeight.SemiBold,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.TextSecondary),
            Margin = new Thickness(26, 18, 12, 0),
        });
        content.Children.Add(NavRow(c, "camera", T("changePhoto"), ChangePhoto, 6));
        NameRow = NavRow(c, "user", T("name"), AskName, 12, shown);
        content.Children.Add(NameRow);
        StatusRow = NavRow(c, "smile", T("status"), AskStatus, 12,
            s.Profile?.Status ?? T("status.empty"));
        content.Children.Add(StatusRow);
        content.Children.Add(NavRow(c, "hash", T("userId"), () => {
        }, 12, id, false));
        content.Children.Add(NavRow(c, "info", T("homeserver"), () => {
        }, 12,
            s.Homeserver ?? "", false));
        content.Children.Add(new TextBlock {
            Text = T("security"),
            FontSize = 13,
            FontWeight = FontWeight.SemiBold,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.TextSecondary),
            Margin = new Thickness(26, 18, 12, 0),
        });
        content.Children.Add(NavRow(c, "lock", T("encryption"),
            () => controller.OpenSidebarPage(SidebarPage.Encryption), 6,
            EncryptionPage.Words(s.Security, k => T(k))));
        content.Children.Add(NavRow(c, "gear", T("settings"),
            () => controller.OpenSidebarPage(SidebarPage.Settings), 20));
    }
}
