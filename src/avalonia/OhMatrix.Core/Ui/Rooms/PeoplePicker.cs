using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.I18n;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui.Appearance;
using OhMatrix.Core.Ui.Overlays;
using OhMatrix.Core.Ui.Support;
using OhMatrix.Core.Ui.Widgets;

namespace OhMatrix.Core.Ui.Rooms;

/// <summary>
/// A dialog to find people in the user directory and pick one or several (the picker of the invite and new chat dialogs): a search field, the
/// people found with a mark on the chosen ones, and a button that takes them. A user id typed in full is offered as it is.
/// </summary>
public sealed class PeoplePicker : IOverlay {
    private readonly AppController controller;
    private readonly Dialog dialog = new();

    private readonly SearchField search = new() {
        OnCard = true
    };

    private readonly StackPanel list = new();

    // The list stays in one scroller: a scroller that is made again would
    // find the list still in the one before.
    private readonly ScrollViewer scroller;
    private readonly PrimaryButton confirm = new();
    private readonly TextButton cancel = new();

    private readonly TextBlock error = new() {
        FontSize = 14,
        TextAlignment = TextAlignment.Center,
        TextWrapping = TextWrapping.Wrap,
        IsVisible = false,
    };

    private readonly Dictionary<string, PersonInfo> chosen = [];
    private IReadOnlyList<PersonInfo> found = [];
    private ColorTokens colors = Themes.Get("light")!.Colors;
    private string locale = "en";
    private bool multi;
    private bool busy;
    private int ticket;
    private Func<IReadOnlyList<string>, Task>? onConfirm;
    private Func<int, string>? confirmLabel;

    public PeoplePicker(AppController controller)
    {
        this.controller = controller;
        scroller = new ScrollViewer {
            Content = list,
            MaxHeight = 280,
            HorizontalScrollBarVisibility =
                Avalonia.Controls.Primitives.ScrollBarVisibility.Disabled,
        };
        search.TextChanged += (_, _) => _ = Search();
        confirm.Click += (_, _) => _ = Confirm();
        cancel.Click += (_, _) => dialog.Close();
    }

    public Dialog Dialog => dialog;

    /// <summary>The icon of the dialog (see <see cref="Overlays.Dialog.Glyph"/>).</summary>
    public string Glyph {
        get => dialog.Glyph;
        set => dialog.Glyph = value;
    }

    public SearchField Field => search;
    public PrimaryButton ConfirmButton => confirm;

    /// <summary>The ids of the people chosen so far.</summary>
    public IReadOnlyCollection<string> Chosen => chosen.Keys;

    /// <summary>The ids of the rows shown.</summary>
    public IReadOnlyList<string> Found => found.Select(p => p.UserId).ToList();

    public string? ErrorText => error.IsVisible ? error.Text : null;

    /// <param name="many">Whether several people can be chosen (an invitation) or one (a new chat).</param>
    /// <param name="label">The text of the button for the number chosen.</param>
    public void Show(
        TopLevel window,
        ColorTokens tokens,
        string title,
        string message,
        bool many,
        Func<int, string> label,
        Func<IReadOnlyList<string>, Task> confirmed
    )
    {
        colors = tokens;
        locale = controller.Store.Value.Locale;
        multi = many;
        confirmLabel = label;
        onConfirm = confirmed;
        busy = false;
        chosen.Clear();
        found = [];
        error.IsVisible = false;
        error.Foreground = new SolidColorBrush(colors.Danger);
        search.Text = "";
        search.Placeholder = Strings.T(locale, "search");
        ThemeScope.SetColors(search, colors);
        ThemeScope.SetColors(confirm, colors);
        ThemeScope.SetColors(cancel, colors);
        cancel.Title = Strings.T(locale, "cancel");
        Render();
        dialog.Show(window, colors, title, message, chips, search, scroller,
            error, confirm, cancel);
    }

    private async Task Search()
    {
        var term = search.Text.Trim();
        var mine = ++ticket;
        IReadOnlyList<PersonInfo> people = [];
        if (term.Length >= 2) {
            try {
                people = await controller.SearchPeople(term);
            } catch (Exception) {
                // The list stays empty; typing again searches again.
            }
        }

        if (mine != ticket)
            return;
        var rows = people.Where(p => p.UserId != controller.Store.Value.UserId)
            .ToList();
        // A full user id works even where the directory does not list the person.
        if (term.StartsWith('@') && term.Contains(':') &&
            rows.All(p => p.UserId != term))
            rows.Insert(0,
                new PersonInfo(term, term.TrimStart('@').Split(':')[0], null));
        found = rows;
        Render();
    }

    private void Render()
    {
        chips.Children.Clear();
        foreach (var p in chosen.Values)
            chips.Children.Add(Chip(p));
        chips.IsVisible = multi && chosen.Count > 0;
        list.Children.Clear();
        foreach (var p in found)
            list.Children.Add(Row(p));
        if (found.Count == 0 && search.Text.Trim().Length >= 2) {
            list.Children.Add(new TextBlock {
                Text = Strings.T(locale, "search.empty"),
                FontSize = 15,
                Foreground = new SolidColorBrush(colors.TextSecondary),
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 12),
            });
        }

        confirm.Title = confirmLabel?.Invoke(chosen.Count) ?? "";
        confirm.Loading = busy;
        confirm.Disabled = chosen.Count == 0;
    }

    // The people chosen, as chips that take the choice back when pressed.
    private readonly WrapPanel chips = new() {
        IsVisible = false
    };

    /// <summary>The chips of the people chosen so far.</summary>
    public WrapPanel Chips => chips;

    private Control Chip(PersonInfo p)
    {
        var line = new StackPanel {
            Orientation = Orientation.Horizontal,
            Spacing = 6
        };
        var avatar = new Avatar(p.UserId, p.Name, 22);
        controller.Pictures.Attach(avatar, p.AvatarUrl, 22);
        line.Children.Add(avatar);
        line.Children.Add(new TextBlock {
            Text = p.Name,
            FontSize = 14,
            Foreground = new SolidColorBrush(colors.Text),
            VerticalAlignment = VerticalAlignment.Center,
        });
        line.Children.Add(new Icon {
            Glyph = "close",
            Size = 12,
            Color = new SolidColorBrush(colors.TextSecondary),
            VerticalAlignment = VerticalAlignment.Center,
        });
        var chip = new Border {
            Height = 30,
            CornerRadius = new CornerRadius(15),
            Padding = new Thickness(4, 0, 10, 0),
            Margin = new Thickness(0, 0, 6, 6),
            Background = new SolidColorBrush(colors.BgSecondary),
            Cursor = new Cursor(StandardCursorType.Hand),
            Child = line,
        };
        chip.PointerPressed += (_, e) => {
            e.Handled = true;
            Toggle(p);
        };
        Avalonia.Automation.AutomationProperties.SetName(chip,
            Strings.T(locale, "removePerson", ("name", p.Name)));
        return chip;
    }

    private Control Row(PersonInfo p)
    {
        var on = chosen.ContainsKey(p.UserId);
        var grid = new Grid {
            ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto"),
            Height = 52,
        };
        var avatar = new Avatar(p.UserId, p.Name, 38) {
            Margin = new Thickness(8, 0, 12, 0),
            VerticalAlignment = VerticalAlignment.Center,
        };
        controller.Pictures.Attach(avatar, p.AvatarUrl, 38);
        grid.Children.Add(avatar);
        var words = new StackPanel {
            VerticalAlignment = VerticalAlignment.Center
        };
        words.Children.Add(new TextBlock {
            Text = p.Name,
            FontSize = 16,
            Foreground = new SolidColorBrush(colors.Text),
            TextTrimming = TextTrimming.CharacterEllipsis,
        });
        words.Children.Add(new TextBlock {
            Text = p.UserId,
            FontSize = 13,
            Foreground = new SolidColorBrush(colors.TextSecondary),
            TextTrimming = TextTrimming.CharacterEllipsis,
        });
        Grid.SetColumn(words, 1);
        grid.Children.Add(words);
        if (on) {
            var mark = new Icon {
                Glyph = "check",
                Size = 20,
                StrokeWidth = 2.2,
                Color = new SolidColorBrush(colors.Accent),
                Margin = new Thickness(8, 0),
                VerticalAlignment = VerticalAlignment.Center,
            };
            Grid.SetColumn(mark, 2);
            grid.Children.Add(mark);
        }

        var row = new Border {
            CornerRadius = new CornerRadius(Radius.Control),
            Background =
                on
                    ? new SolidColorBrush(colors.MentionBg)
                    : Brushes.Transparent,
            Cursor = new Cursor(StandardCursorType.Hand),
            Child = grid,
        };
        row.PointerPressed += (_, e) => {
            e.Handled = true;
            Toggle(p);
        };
        Avalonia.Automation.AutomationProperties.SetName(row, p.Name);
        return row;
    }

    /// <summary>Chooses a person, or takes the choice back; with one person only, the choice moves to them.</summary>
    public void Toggle(PersonInfo p)
    {
        if (!chosen.Remove(p.UserId)) {
            if (!multi)
                chosen.Clear();
            chosen[p.UserId] = p;
        }

        Render();
    }

    private async Task Confirm()
    {
        if (busy || chosen.Count == 0 || onConfirm == null)
            return;
        busy = true;
        error.IsVisible = false;
        Render();
        try {
            await onConfirm([.. chosen.Keys]);
            dialog.Close();
        } catch (Exception e) {
            error.Text = e.Message;
            error.IsVisible = true;
        } finally {
            busy = false;
            Render();
        }
    }

    public void Close()
    {
        dialog.Close();
    }

    /// <summary>Closes it for good: it is not shown again.</summary>
    public void Retire()
    {
        Close();
        dialog.Retire();
    }
}
