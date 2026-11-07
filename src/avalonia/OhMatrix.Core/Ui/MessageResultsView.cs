using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Documents;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.I18n;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;
using OhMatrix.Core.Theming;

namespace OhMatrix.Core.Ui;

/// <summary>
/// The results of a message search (<c>MessageResults</c>): a debounced search of two characters or more, with show more, and the chat name
/// and picture of each hit when <c>showRoom</c> is set (the search of the chat list).
/// </summary>
public sealed class MessageResultsView : StackPanel {
    private readonly AppController controller;
    private readonly string? roomId;
    private readonly bool showRoom;
    private readonly Avalonia.Threading.DispatcherTimer debounce = new() {
        Interval = TimeSpan.FromMilliseconds(350)
    };

    private string term = "";
    private int seq;
    private List<SearchResult>? results;
    private string? next;
    private bool busy;

    public MessageResultsView(AppController controller, string? roomId, bool showRoom)
    {
        this.controller = controller;
        this.roomId = roomId;
        this.showRoom = showRoom;
        debounce.Tick += (_, _) => {
            debounce.Stop();
            _ = Load(null);
        };
        ThemeScope.ColorsProperty.Changed.AddClassHandler<MessageResultsView>((v, _) => v.Render());
    }

    /// <summary>The hits shown.</summary>
    public IReadOnlyList<SearchResult> Results => results ?? [];

    public bool Busy => busy;

    /// <summary>A hit was pressed.</summary>
    public event Action? Picked;

    /// <summary>Whether the term is long enough to search.</summary>
    public static bool Active(string term) => term.Trim().Length >= 2;

    private string T(string key) => Strings.T(controller.Store.Value.Locale, key);

    /// <summary>Searches for a term after a short pause in the typing; fewer than two characters clears the results.</summary>
    public void SetTerm(string value)
    {
        if (value == term)
            return;
        term = value;
        seq++;
        debounce.Stop();
        results = null;
        next = null;
        busy = Active(value);
        if (busy)
            debounce.Start();
        Render();
    }

    /// <summary>Searches at once (what the pause ends in); with <paramref name="from"/>, the page after the shown ones.</summary>
    public async Task Load(string? from)
    {
        var mine = ++seq;
        busy = true;
        Render();
        SearchPage? page = null;
        try {
            page = await controller.SearchMessages(term.Trim(), roomId, from);
        } catch (Exception) {
            // Shown as no results.
        }

        if (mine != seq)
            return;
        busy = false;
        results = from is null ? [.. page?.Results ?? []] : [.. results ?? [], .. page?.Results ?? []];
        next = page?.Next;
        Render();
    }

    private void Render()
    {
        var c = ThemeScope.GetColors(this);
        Children.Clear();
        if (!Active(term)) {
            Children.Add(Note(c, T("search.hint"), 14, 24));
            return;
        }

        foreach (var r in results ?? [])
            Children.Add(Hit(c, r));
        if (busy)
            Children.Add(new Spinner {
                Width = 24,
                Height = 24,
                Margin = new Thickness(0, 12),
                HorizontalAlignment = HorizontalAlignment.Center
            });
        else if (results is { Count: 0 })
            Children.Add(Note(c, T("search.empty"), 15, 24));
        if (!busy && next is not null) {
            var more = new TextButton {
                Title = T("search.more"),
                HorizontalAlignment = HorizontalAlignment.Center
            };
            more.Click += (_, _) => _ = Load(next);
            ThemeScope.SetColors(more, c);
            Children.Add(more);
        }
    }

    private static TextBlock Note(ColorTokens c, string text, double size, double pad)
    {
        return new TextBlock {
            Text = text,
            FontSize = size,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.TextSecondary),
            TextAlignment = TextAlignment.Center,
            TextWrapping = TextWrapping.Wrap,
            Margin = new Thickness(20, pad),
        };
    }

    private Control Hit(ColorTokens c, SearchResult r)
    {
        var s = controller.Store.Value;
        var snip = Snippet.Make(r.Text, term.Trim());
        var grid = new Grid {
            ColumnDefinitions = new ColumnDefinitions(showRoom ? "Auto,*" : "*"),
            Margin = new Thickness(6, 0),
            Background = Brushes.Transparent,
            Cursor = new Cursor(StandardCursorType.Hand),
        };
        var col = 0;
        if (showRoom) {
            var room = s.Rooms.FirstOrDefault(x => x.Id == r.RoomId);
            var avatar = new Avatar(r.RoomId, r.RoomName, 36) {
                Margin = new Thickness(8, 8, 11, 8),
                VerticalAlignment = VerticalAlignment.Top
            };
            controller.Pictures.Attach(avatar, room?.AvatarUrl, 36);
            grid.Children.Add(avatar);
            col = 1;
        }

        var text = new StackPanel {
            Margin = new Thickness(showRoom ? 0 : 14, 8, 8, 8),
            Spacing = 2
        };
        var head = new Grid {
            ColumnDefinitions = new ColumnDefinitions("*,Auto")
        };
        head.Children.Add(new TextBlock {
            Text = showRoom ? r.RoomName : r.SenderName,
            FontSize = 15,
            FontWeight = FontWeight.SemiBold,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.Text),
            TextTrimming = TextTrimming.CharacterEllipsis,
        });
        var time = new TextBlock {
            Text = Format.ListTime(r.Ts, DateTimeOffset.UtcNow, s.Locale),
            FontSize = 12,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.TextSecondary),
            Margin = new Thickness(8, 0, 0, 0),
        };
        Grid.SetColumn(time, 1);
        head.Children.Add(time);
        text.Children.Add(head);
        var body = new TextBlock {
            FontSize = 14,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.TextSecondary),
            TextWrapping = TextWrapping.Wrap,
            MaxLines = 2,
            TextTrimming = TextTrimming.CharacterEllipsis,
        };
        body.Inlines!.Add(new Run((showRoom ? r.SenderName + ": " : "") + snip.Before));
        body.Inlines.Add(new Run(snip.Match) {
            Foreground = new SolidColorBrush(c.Accent),
            FontWeight = FontWeight.Bold
        });
        body.Inlines.Add(new Run(snip.After));
        text.Children.Add(body);
        Grid.SetColumn(text, col);
        grid.Children.Add(text);
        grid.PointerPressed += (_, e) => {
            e.Handled = true;
            controller.OpenMessage(r.RoomId, r.EventId);
            Picked?.Invoke();
        };
        return grid;
    }
}
