using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Documents;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui.Appearance;
using OhMatrix.Core.Ui.Support;
using OhMatrix.Core.Ui.Widgets;
using Spinner = OhMatrix.Core.Ui.Widgets.Spinner;
using OhMatrix.Infra.Logging;

namespace OhMatrix.Core.Ui.Rooms;

/// <summary>
/// The results of a message search (<c>MessageResults</c>): a debounced search of two characters or more, with show more, and the chat name
/// and picture of each hit when <c>showRoom</c> is set (the search of the chat list).
/// </summary>
public sealed class MessageResultsView : StackPanel {
    private static readonly Logger logger = Logger.GetDefault();

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

    // Registered once for the type: a handler made in the constructor
    // stays in the property's observers for good and runs once for each
    // control that was ever made.
    static MessageResultsView()
    {
        ThemeScope.ColorsProperty.Changed
            .AddClassHandler<MessageResultsView>((v, _) => v.Render());
    }

    public MessageResultsView(AppController controller, string? roomId,
        bool showRoom)
    {
        this.controller = controller;
        this.roomId = roomId;
        this.showRoom = showRoom;
        Lifetime.Stop(this, debounce);
        debounce.Tick += (_, _) => {
            debounce.Stop();
            _ = Load(null);
        };
    }

    /// <summary>The hits shown.</summary>
    public IReadOnlyList<SearchResult> Results => results ?? [];

    public bool Busy => busy;

    /// <summary>A hit was pressed.</summary>
    public event Action? Picked;

    /// <summary>Whether the term is long enough to search.</summary>
    public static bool Active(string term) => term.Trim().Length >= 2;

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
        } catch (Exception e) {
            logger.Unexpected("search messages", e);
            // Shown as no results.
        }

        if (mine != seq)
            return;
        busy = false;
        results = from == null
            ? [.. page?.Results ?? []]
            : [.. results ?? [], .. page?.Results ?? []];
        next = page?.Next;
        Render();
    }

    /// <summary>Rewords retained results without starting another search.</summary>
    public void RefreshPresentation() => Render();

    // What the children are made from: the hits are at the start of the
    // children and what is after them (a spinner, a note, a button) is made
    // again each time. The hits are kept while the term, the colours and the
    // language and the font are the same and the results are the ones shown with more
    // after them, so a next page adds its hits and nothing else is made.
    private List<SearchResult> builtHits = [];
    private string? builtTerm;
    private ColorTokens? builtColors;
    private string? builtLocale;

    private void Render()
    {
        var c = ThemeScope.GetColors(this);
        if (!Active(term)) {
            Children.Clear();
            builtHits = [];
            builtTerm = null;
            Children.Add(Note(c, controller.T("search.hint"), 14, 24));
            return;
        }

        var shown = results ?? [];
        var locale = controller.Store.Value.Locale;
        var keep = builtTerm == term && Equals(builtColors, c) &&
                   builtLocale == locale &&
                   shown.Count >= builtHits.Count;
        for (var i = 0; keep && i < builtHits.Count; i++)
            keep = ReferenceEquals(shown[i], builtHits[i]);
        if (keep) {
            // Off with what was after the hits.
            while (Children.Count > builtHits.Count)
                Children.RemoveAt(Children.Count - 1);
        } else {
            Children.Clear();
            builtHits = [];
        }

        builtTerm = term;
        builtColors = c;
        builtLocale = locale;
        for (var i = builtHits.Count; i < shown.Count; i++) {
            Children.Add(Hit(c, shown[i]));
            builtHits.Add(shown[i]);
        }

        if (busy)
            Children.Add(new Spinner {
                Width = 24,
                Height = 24,
                Margin = new Thickness(0, 12),
                HorizontalAlignment = HorizontalAlignment.Center
            });
        else if (results is { Count: 0 })
            Children.Add(Note(c, controller.T("search.empty"), 15, 24));
        if (!busy && next != null) {
            var more = new TextButton {
                Title = controller.T("search.more"),
                HorizontalAlignment = HorizontalAlignment.Center
            };
            more.Click += (_, _) => _ = Load(next);
            ThemeScope.SetColors(more, c);
            Children.Add(more);
        }
    }

    private static TextBlock Note(ColorTokens c, string text, double size,
        double pad)
    {
        return new TextBlock {
            Text = text,
            FontSize = size,
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
            ColumnDefinitions =
                new ColumnDefinitions(showRoom ? "Auto,*" : "*"),
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
            FontWeight = Fonts.Bold,
            Foreground = new SolidColorBrush(c.Text),
            TextTrimming = TextTrimming.CharacterEllipsis,
        });
        var time = new TextBlock {
            Text = Format.ListTime(r.Ts, DateTimeOffset.UtcNow, s.Locale),
            FontSize = 12,
            Foreground = new SolidColorBrush(c.TextSecondary),
            Margin = new Thickness(8, 0, 0, 0),
        };
        Grid.SetColumn(time, 1);
        head.Children.Add(time);
        text.Children.Add(head);
        var body = new TextBlock {
            FontSize = 14,
            Foreground = new SolidColorBrush(c.TextSecondary),
            TextWrapping = TextWrapping.Wrap,
            MaxLines = 2,
            TextTrimming = TextTrimming.CharacterEllipsis,
        };
        body.Inlines!.Add(new Run((showRoom ? r.SenderName + ": " : "") +
                                  snip.Before));
        body.Inlines.Add(new Run(snip.Match) {
            Foreground = new SolidColorBrush(c.Accent),
            FontWeight = Fonts.Bold
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
