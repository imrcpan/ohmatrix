using Avalonia.Input.Platform;
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

    // Registered once for the type: a handler made in the constructor
    // stays in the property's observers for good and runs once for each
    // control that was ever made.
    static ExplorePage()
    {
        ThemeScope.ColorsProperty.Changed.AddClassHandler<ExplorePage>((p, _) =>
            p.Apply());
    }

    private readonly Avalonia.Threading.DispatcherTimer searchPause = new() {
        Interval = TimeSpan.FromMilliseconds(350)
    };

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
        // A request for each key typed would be a request to the server for
        // each key: the directory is asked after a pause in the typing, as the
        // search of messages is.
        Lifetime.Stop(this, searchPause);
        searchPause.Tick += (_, _) => {
            searchPause.Stop();
            _ = Load();
        };
        search.TextChanged += (_, _) => {
            // What is coming back for the text before this one is of no use.
            ticket++;
            searchPause.Stop();
            searchPause.Start();
        };
        // A card is 320 wide, or the width of the page when that is narrower.
        SizeChanged += (_, e) => {
            var width = Math.Min(CardWidth,
                Math.Max(200, e.NewSize.Width - 24));
            if (Math.Abs(width - cardWidth) < 1)
                return;
            cardWidth = width;
            Apply();
        };
        Lifetime.Watch(this, controller, _ => Apply());
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
        var own = s.UserId?.Split(':', 2) is { Length: 2 } parts
            ? parts[1]
            : s.Homeserver ?? "";
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
        chosen is null ? Servers()[0].Server :
        chosen.Length == 0 ? null : chosen;

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
        AddPrompt.Show(window, ThemeScope.GetColors(this),
            controller.Store.Value.Locale,
            T("explore.add.title"), T("explore.add.body"),
            [new PromptField(T("explore.add.server"), "globe")],
            T("explore.add"), v => {
                var name = ServerName.Parse(v[0]);
                if (name is null)
                    throw new InvalidOperationException(
                        T("explore.add.invalid"));
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
        searchPause.Stop();
        var mine = ++ticket;
        loading = true;
        Apply();
        IReadOnlyList<PublicRoom> result = [];
        try {
            result =
                await controller.SearchPublicRooms(search.Text.Trim(), Server);
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
        JoinCard.Show(window, room, () => {
            _ = controller.JoinPublicRoom(room);
            controller.OpenSidebarPage(SidebarPage.Chats);
        });
    }

    private RoomCardDialog? card;
    public RoomCardDialog JoinCard => card ??= new RoomCardDialog(controller);

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

        var cards = new WrapPanel {
            HorizontalAlignment = HorizontalAlignment.Center,
            Margin = new Thickness(6, 4),
        };
        foreach (var room in found)
            cards.Children.Add(Card(c, room,
                s.Rooms.Any(r => r.Id == room.RoomId)));
        rows.Children.Add(cards);
    }

    private void BuildServers(ColorTokens c)
    {
        servers.Children.Clear();
        var current = Server;
        foreach (var (server, name) in Servers()) {
            servers.Children.Add(Chip(c, name, server == current,
                () => ChooseServer(server)));
        }

        servers.Children.Add(Chip(c, "+ " + T("explore.add"), false,
            AskAddServer));
    }

    private static Border Chip(ColorTokens c, string text, bool on,
        Action press)
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

    private const double CardWidth = 320;
    private double cardWidth = CardWidth;

    /// <summary>The card pressed open, larger, with the whole text of the room.</summary>
    public Dialog Full { get; } = new();

    /// <summary>The card of a room: who it is, its text and the buttons.</summary>
    private Control Card(ColorTokens c, PublicRoom room, bool joined)
    {
        var card = new Border {
            Width = cardWidth,
            MinHeight = 168,
            Margin = new Thickness(6),
            Padding = new Thickness(16),
            CornerRadius = new CornerRadius(16),
            Background = new SolidColorBrush(c.BgSecondary),
            Cursor = new Cursor(StandardCursorType.Hand),
            Child = Face(c, room, joined, false),
        };
        card.PointerPressed += (_, e) => {
            e.Handled = true;
            OpenFull(room, joined);
        };
        Avalonia.Automation.AutomationProperties.SetName(card, room.Name);
        return card;
    }

    /// <summary>Opens the card larger over the page.</summary>
    public void OpenFull(PublicRoom room, bool joined)
    {
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        var c = ThemeScope.GetColors(this);
        Full.Show(window, c, "", null, Face(c, room, joined, true));
    }

    private static string Flat(string? text)
    {
        return string.Join(" ",
            (text ?? "").Split((char[]?)null,
                StringSplitOptions.RemoveEmptyEntries));
    }

    private StackPanel Face(ColorTokens c, PublicRoom room, bool joined,
        bool full)
    {
        var face = new StackPanel {
            Spacing = 10
        };
        var head = new Grid {
            ColumnDefinitions = new ColumnDefinitions("Auto,*")
        };
        var avatar = new Avatar(room.RoomId, room.Name, 52) {
            Margin = new Thickness(0, 0, 12, 0),
            VerticalAlignment = VerticalAlignment.Center,
        };
        controller.Pictures.Attach(avatar, room.AvatarUrl, 52);
        head.Children.Add(avatar);
        var words = new StackPanel {
            VerticalAlignment = VerticalAlignment.Center
        };
        words.Children.Add(new TextBlock {
            Text = room.Name,
            FontSize = 17,
            FontWeight = FontWeight.Bold,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.Text),
            TextWrapping = TextWrapping.Wrap,
            MaxLines = 2,
            TextTrimming = TextTrimming.CharacterEllipsis,
        });
        words.Children.Add(new TextBlock {
            Text = room.Members == 1
                ? T("member.one")
                : T("explore.members", ("count", room.Members)),
            FontSize = 13,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.TextSecondary),
            TextTrimming = TextTrimming.CharacterEllipsis,
        });
        Grid.SetColumn(words, 1);
        head.Children.Add(words);
        face.Children.Add(head);

        var topic = new TextBlock {
            FontSize = 14,
            LineHeight = 19,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.TextSecondary),
            TextWrapping = TextWrapping.Wrap,
        };
        if (full) {
            topic.Text = room.Topic?.Trim() ?? "";
            face.Children.Add(new ScrollViewer {
                MaxHeight = 240,
                Content = topic
            });
        } else {
            topic.Text = Flat(room.Topic);
            topic.MaxLines = 3;
            topic.TextTrimming = TextTrimming.CharacterEllipsis;
            face.Children.Add(topic);
        }

        var actions = new WrapPanel {
            HorizontalAlignment = HorizontalAlignment.Left
        };
        var copy = Pill(c, T("explore.copy"), c.Hover, c.Text);
        copy.PointerPressed += async (_, e) => {
            e.Handled = true;
            if (TopLevel.GetTopLevel(this)?.Clipboard is { } clipboard) {
                await clipboard.SetTextAsync(room.Alias ?? room.RoomId);
                ((TextBlock)copy.Child!).Text = T("copied");
            }
        };
        actions.Children.Add(copy);
        if (joined)
            actions.Children.Add(Pill(c, T("explore.in"), c.Hover,
                c.TextSecondary));
        else {
            var join = Pill(c, T("join"), c.Accent, c.OnAccent);
            join.PointerPressed += (_, e) => {
                e.Handled = true;
                Full.Close();
                AskJoin(room);
            };
            Avalonia.Automation.AutomationProperties.SetName(join,
                $"{T("join")} {room.Name}");
            actions.Children.Add(join);
        }

        face.Children.Add(actions);
        return face;
    }

    private static Border Pill(ColorTokens c, string text, Color background,
        Color foreground)
    {
        return new Border {
            Margin = new Thickness(0, 0, 8, 0),
            Padding = new Thickness(16, 6),
            CornerRadius = new CornerRadius(14),
            Background = new SolidColorBrush(background),
            Cursor = new Cursor(StandardCursorType.Hand),
            Child = new TextBlock {
                Text = text,
                FontSize = 14,
                FontWeight = FontWeight.SemiBold,
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(foreground),
            },
        };
    }
}
