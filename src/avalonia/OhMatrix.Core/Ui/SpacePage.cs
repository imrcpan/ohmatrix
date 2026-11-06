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
/// A space (<c>SpaceScreen</c>), as far as it is ported: a bar with Back to the chats and the name of the space, and the rooms it lists with their
/// picture, count and description. A room already joined opens (a space opens as a space), one not joined asks whether to join it.
/// </summary>
public sealed class SpacePage : Grid {
    private readonly AppController controller;
    private readonly Border bar = new();
    private readonly StackPanel rows = new();
    private readonly PromptDialog confirm = new();
    private IReadOnlyList<SpaceChild>? children;
    private string? loadedFor;
    private int ticket;

    public SpacePage(AppController controller)
    {
        this.controller = controller;
        RowDefinitions = new RowDefinitions("Auto,*");
        Children.Add(bar);
        var scroller = new ScrollViewer {
            Content = rows,
            HorizontalScrollBarVisibility =
                Avalonia.Controls.Primitives.ScrollBarVisibility.Disabled,
        };
        Grid.SetRow(scroller, 1);
        Children.Add(scroller);
        controller.Store.Changed += _ => Apply();
        ThemeScope.ColorsProperty.Changed.AddClassHandler<SpacePage>((p, _) => p.Apply());
        Apply();
    }

    public PromptDialog Confirm => confirm;

    /// <summary>The rooms shown, in the order the space lists them.</summary>
    public IReadOnlyList<SpaceChild> Children_ => children ?? [];

    private string T(string key, params (string, object)[] values)
    {
        return Strings.T(controller.Store.Value.Locale, key, values);
    }

    /// <summary>Asks the engine for the rooms of the open space again.</summary>
    public async Task Reload()
    {
        var id = controller.Store.Value.OpenSpaceId;
        if (id is null)
            return;
        var mine = ++ticket;
        loadedFor = id;
        IReadOnlyList<SpaceChild> found = [];
        try {
            found = await controller.SpaceChildren(id);
        } catch (Exception) {
            // The list stays empty; opening the space again asks again.
        }

        if (mine != ticket)
            return;
        children = found;
        Apply();
    }

    /// <summary>Asks whether to join a room of the space, and joins it.</summary>
    public void AskJoin(SpaceChild room)
    {
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        confirm.Show(window, ThemeScope.GetColors(this), controller.Store.Value.Locale,
            T("explore.confirm", ("name", room.Name)), room.Topic ?? "", [], T("join"), async _ => {
                await controller.JoinRoom(room.RoomId);
                controller.OpenSidebarPage(SidebarPage.Chats);
            });
    }

    private void Apply()
    {
        var c = ThemeScope.GetColors(this);
        var s = controller.Store.Value;
        var open = s.SidebarPage == SidebarPage.Space && s.OpenSpaceId is not null;
        if (open && loadedFor != s.OpenSpaceId) {
            children = null;
            _ = Reload();
        } else if (!open)
            loadedFor = null;

        Background = new SolidColorBrush(c.Bg);
        var space = s.Rooms.FirstOrDefault(r => r.Id == s.OpenSpaceId);
        PageBar.Fill(bar, c, space?.Name ?? T("space"), T("chats"),
            () => controller.OpenSidebarPage(SidebarPage.Chats));
        bar.BorderBrush = new SolidColorBrush(c.Separator);
        bar.BorderThickness = new Thickness(0, 0, 0, 1);
        bar.Height = 56;
        rows.Children.Clear();
        if (children is null) {
            rows.Children.Add(new Spinner {
                Size = 28,
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 24),
            });
            return;
        }

        if (children.Count == 0) {
            rows.Children.Add(new TextBlock {
                Text = T("space.empty"),
                FontSize = 15,
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(c.TextSecondary),
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 24),
            });
            return;
        }

        foreach (var child in children)
            rows.Children.Add(Row(c, child, s.Rooms.Any(r => r.Id == child.RoomId && !r.Invite)));
    }

    private Control Row(ColorTokens c, SpaceChild child, bool joined)
    {
        var grid = new Grid {
            ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto"),
            Margin = new Thickness(12, 8),
        };
        var avatar = new Avatar(child.RoomId, child.Name, 48, child.IsSpace) {
            Margin = new Thickness(0, 0, 12, 0),
            VerticalAlignment = VerticalAlignment.Center,
        };
        controller.Pictures.Attach(avatar, child.AvatarUrl, 48);
        grid.Children.Add(avatar);
        var words = new StackPanel {
            VerticalAlignment = VerticalAlignment.Center
        };
        words.Children.Add(new TextBlock {
            Text = child.Name,
            FontSize = 16,
            FontWeight = FontWeight.SemiBold,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.Text),
            TextTrimming = TextTrimming.CharacterEllipsis,
        });
        words.Children.Add(new TextBlock {
            Text = child.Members == 1
                ? T("member.one")
                : T("explore.members", ("count", child.Members)),
            FontSize = 13,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.TextSecondary),
        });
        if (child.Topic is { } topic) {
            words.Children.Add(new TextBlock {
                Text = topic,
                FontSize = 14,
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(c.TextSecondary),
                TextTrimming = TextTrimming.CharacterEllipsis,
            });
        }

        Grid.SetColumn(words, 1);
        grid.Children.Add(words);
        if (!joined) {
            var tag = new TextBlock {
                Text = T("space.joinToView"),
                FontSize = 13,
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(c.Accent),
                Margin = new Thickness(8, 0, 0, 0),
                VerticalAlignment = VerticalAlignment.Center,
            };
            Grid.SetColumn(tag, 2);
            grid.Children.Add(tag);
        }

        var row = new Border {
            Child = grid,
            Background = Brushes.Transparent,
            Cursor = new Cursor(StandardCursorType.Hand),
        };
        row.PointerPressed += (_, e) => {
            e.Handled = true;
            if (!joined)
                AskJoin(child);
            else if (child.IsSpace)
                controller.OpenSpace(child.RoomId);
            else {
                controller.OpenSidebarPage(SidebarPage.Chats);
                controller.SelectRoom(child.RoomId);
            }
        };
        Avalonia.Automation.AutomationProperties.SetName(row, child.Name);
        return row;
    }
}
