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
/// The public rooms of the homeserver (<c>ExploreScreen</c>), as far as it is ported: a bar with Back, a search field, and the rooms found with
/// their picture, name, description and member count; pressing one asks whether to join it, and joining opens the chat.
/// </summary>
public sealed class ExplorePage : Grid {
    private readonly AppController controller;
    private readonly Border bar = new();
    private readonly SearchField search = new();
    private readonly StackPanel rows = new();
    private readonly WrapPanel servers = new();
    private string? chosen;
    private readonly PromptDialog confirm = new();
    private IReadOnlyList<PublicRoom> found = [];
    private bool loading;
    private bool wasOpen;
    private int ticket;

    public ExplorePage(AppController controller)
    {
        this.controller = controller;
        RowDefinitions = new RowDefinitions("Auto,Auto,Auto,*");
        Children.Add(bar);
        search.Margin = new Thickness(12, 8);
        Grid.SetRow(search, 1);
        Children.Add(search);
        var scroller = new ScrollViewer {
            Content = rows,
            HorizontalScrollBarVisibility =
                Avalonia.Controls.Primitives.ScrollBarVisibility.Disabled,
        };
        Grid.SetRow(scroller, 3);
        servers.Margin = new Thickness(12, 0, 12, 6);
        Grid.SetRow(servers, 2);
        Children.Add(servers);
        Children.Add(scroller);
        search.TextChanged += (_, _) => _ = Load();
        controller.Store.Changed += _ => Apply();
        ThemeScope.ColorsProperty.Changed.AddClassHandler<ExplorePage>((p, _) => p.Apply());
        Apply();
    }

    public SearchField Field => search;
    public PromptDialog Confirm => confirm;
    public StackPanel Rows => rows;
    public PromptDialog AddPrompt { get; } = new();

    /// <summary>The servers whose directory can be asked: matrix.org first, then the homeserver itself (null stands for it), then those added.</summary>
    public IReadOnlyList<(string? Server, string Name)> Servers()
    {
        var s = controller.Store.Value;
        var own = s.UserId?.Split(':', 2) is { Length: 2 } parts ? parts[1] : s.Homeserver ?? "";
        var list = new List<(string?, string)>();
        if (own != "matrix.org")
            list.Add(("matrix.org", "matrix.org"));
        list.Add((null, own));
        foreach (var extra in s.Prefs.ExploreServers) {
            if (list.All(x => x.Item2 != extra))
                list.Add((extra, extra));
        }

        return list;
    }

    /// <summary>The server whose directory is shown (null: the homeserver's own).</summary>
    public string? Server =>
        chosen is null ? Servers()[0].Server : chosen.Length == 0 ? null : chosen;

    /// <summary>Shows the directory of another server.</summary>
    public void ChooseServer(string? server)
    {
        chosen = server ?? "";
        _ = Load();
    }

    /// <summary>Asks for the name of a server to add to the list.</summary>
    public void AskAddServer()
    {
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        AddPrompt.Show(window, ThemeScope.GetColors(this), controller.Store.Value.Locale,
            T("explore.add.title"), T("explore.add.body"),
            [new PromptField(T("explore.add.server"), "globe")], T("explore.add"), v => {
                var name = ServerName.Parse(v[0]);
                if (name is null)
                    throw new InvalidOperationException(T("explore.add.invalid"));
                if (Servers().All(x => x.Name != name))
                    controller.SetPreferences(p => p with {
                        ExploreServers = [.. p.ExploreServers, name]
                    });
                ChooseServer(name);
                return Task.CompletedTask;
            });
    }

    /// <summary>The names of the rooms shown.</summary>
    public IReadOnlyList<string> Names => found.Select(r => r.Name).ToList();

    private string T(string key, params (string, object)[] values)
    {
        return Strings.T(controller.Store.Value.Locale, key, values);
    }

    /// <summary>Searches the directory for what the field holds.</summary>
    public async Task Load()
    {
        var mine = ++ticket;
        loading = true;
        Apply();
        IReadOnlyList<PublicRoom> result = [];
        try {
            result = await controller.SearchPublicRooms(search.Text.Trim(), Server);
        } catch (Exception) {
            // The list stays empty; searching again tries again.
        }

        if (mine != ticket)
            return;
        loading = false;
        found = result;
        Apply();
    }

    /// <summary>Asks whether to join a room, and joins it.</summary>
    public void AskJoin(PublicRoom room)
    {
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        confirm.Show(window, ThemeScope.GetColors(this), controller.Store.Value.Locale,
            T("explore.confirm", ("name", room.Name)), room.Topic ?? "", [], T("join"), values => {
                _ = controller.JoinPublicRoom(room);
                controller.OpenSidebarPage(SidebarPage.Chats);
                return Task.CompletedTask;
            });
    }

    private void Apply()
    {
        var c = ThemeScope.GetColors(this);
        var s = controller.Store.Value;
        var open = s.SidebarPage == SidebarPage.Explore;
        if (open && !wasOpen) {
            wasOpen = true;
            search.Text = "";
            found = [];
            _ = Load();
            return;
        }

        wasOpen = open;
        Background = new SolidColorBrush(c.Bg);
        search.Placeholder = T("explore.search");
        ThemeScope.SetColors(search, c);
        PageBar.Fill(bar, c, T("explore"), T("chats"),
            () => controller.OpenSidebarPage(SidebarPage.Chats));
        BuildServers(c);
        rows.Children.Clear();
        if (loading) {
            rows.Children.Add(new Spinner {
                Size = 28,
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 24),
            });
            return;
        }

        if (found.Count == 0) {
            rows.Children.Add(new TextBlock {
                Text = T("explore.empty"),
                FontSize = 15,
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(c.TextSecondary),
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 24),
            });
            return;
        }

        foreach (var room in found)
            rows.Children.Add(Row(c, room, s.Rooms.Any(r => r.Id == room.RoomId)));
    }

    private void BuildServers(ColorTokens c)
    {
        servers.Children.Clear();
        var current = Server;
        foreach (var (server, name) in Servers()) {
            servers.Children.Add(Chip(c, name, server == current, () => ChooseServer(server)));
        }

        servers.Children.Add(Chip(c, "+ " + T("explore.add"), false, AskAddServer));
    }

    private static Border Chip(ColorTokens c, string text, bool on, Action press)
    {
        var chip = new Border {
            Margin = new Thickness(0, 0, 6, 6),
            Padding = new Thickness(12, 5),
            CornerRadius = new CornerRadius(100),
            Background = new SolidColorBrush(on ? c.Accent : c.BgSecondary),
            Cursor = new Cursor(StandardCursorType.Hand),
            Child = new TextBlock {
                Text = text,
                FontSize = 14,
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(on ? c.OnAccent : c.Text),
            },
        };
        chip.PointerPressed += (_, e) => {
            e.Handled = true;
            press();
        };
        Avalonia.Automation.AutomationProperties.SetName(chip, text);
        return chip;
    }

    private Control Row(ColorTokens c, PublicRoom room, bool joined)
    {
        var grid = new Grid {
            ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto"),
            Margin = new Thickness(12, 8),
        };
        var avatar = new Avatar(room.RoomId, room.Name, 48) {
            Margin = new Thickness(0, 0, 12, 0),
            VerticalAlignment = VerticalAlignment.Center,
        };
        controller.Pictures.Attach(avatar, room.AvatarUrl, 48);
        grid.Children.Add(avatar);
        var words = new StackPanel {
            VerticalAlignment = VerticalAlignment.Center
        };
        words.Children.Add(new TextBlock {
            Text = room.Name,
            FontSize = 16,
            FontWeight = FontWeight.SemiBold,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.Text),
            TextTrimming = TextTrimming.CharacterEllipsis,
        });
        words.Children.Add(new TextBlock {
            Text = room.Members == 1
                ? T("member.one")
                : T("explore.members", ("count", room.Members)),
            FontSize = 13,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.TextSecondary),
        });
        if (room.Topic is { } topic) {
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
        if (joined) {
            var tag = new TextBlock {
                Text = T("explore.in"),
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
            if (joined)
                controller.SelectRoom(room.RoomId);
            else
                AskJoin(room);
        };
        Avalonia.Automation.AutomationProperties.SetName(row, room.Name);
        return row;
    }
}
