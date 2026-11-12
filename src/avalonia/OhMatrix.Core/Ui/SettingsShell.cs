using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.State;
using OhMatrix.Core.Ui.Appearance;
using OhMatrix.Core.Ui.Support;
using OhMatrix.Core.Ui.Widgets;

namespace OhMatrix.Core.Ui;

/// <summary>
/// What the settings window shows: the list of the kinds of settings at the left, the options of the chosen kind at the right, and Sign out at the
/// foot of the list. The window is made for the desktop, so there is no way back to go: the list is always there, and the log, which is reached from
/// Advanced, keeps that entry chosen.
/// </summary>
public sealed class SettingsShell : Grid {
    public const double ListWidth = 220;

    // The measures of the rows of the panes. The desktop keeps its rows
    // closer and its writing smaller than a phone does; the writing is the
    // size of the entries of the list at the left.
    public const double RowHeight = 36;
    public const double RowFont = 15;
    public const double ValueFont = 15;
    public const double CaptionFont = RowFont;
    public const double NoteFont = 13;
    public const double RowIcon = 18;

    /// <summary>The room at the left and the right of the rows, the headings and the notes of a pane.</summary>
    public const double Side = PageBar.Side;

    private sealed record Entry(SidebarPage Page, string Glyph, string Key);

    private static readonly Entry[] Kinds = [
        new(SidebarPage.Settings, "gear", "general"),
        new(SidebarPage.Language, "globe", "language"),
        new(SidebarPage.Theme, "palette", "theme"),
        new(SidebarPage.Font, "font", "font"),
        new(SidebarPage.Sessions, "device", "sessions"),
        new(SidebarPage.Advanced, "file", "advanced"),
        new(SidebarPage.About, "about", "about"),
    ];

    private readonly AppController controller;
    private readonly Dialog confirm = new();
    private readonly Border list = new();
    private readonly Border host = new();
    private readonly List<ListItem> items = [];
    private readonly ListItem signOut = new("signOut", true);
    private string? seenLocale;
    private FontFamily? seenFont;

    // Registered once for the type: a handler made in the constructor
    // stays in the property's observers for good and runs once for each
    // control that was ever made.
    static SettingsShell()
    {
        ThemeScope.ColorsProperty.Changed
            .AddClassHandler<SettingsShell>((p, _) => p.Apply());
    }

    public SettingsShell(AppController controller)
    {
        this.controller = controller;
        ColumnDefinitions = new ColumnDefinitions("Auto,*");
        var column = new Grid {
            Width = ListWidth,
            RowDefinitions = new RowDefinitions("*,Auto"),
        };
        var stack = new StackPanel {
            Spacing = 2,
            // The first entry is level with the heading of the pane: its
            // middle is 15 below the top of the heading, and the entry is 40 high.
            Margin = new Thickness(8, PageBar.TitleTop + 15 - 20, 8, 4)
        };
        foreach (var entry in Kinds) {
            var item = new ListItem(entry.Glyph, false) {
                Page = entry.Page,
                Key = entry.Key
            };
            var page = entry.Page;
            item.Click += (_, _) => controller.OpenSidebarPage(page);
            items.Add(item);
            stack.Children.Add(item);
        }

        // Up and Down move along the list, as in any list of a window.
        stack.KeyDown += (_, e) => {
            var step = e.Key == Key.Down ? 1 : e.Key == Key.Up ? -1 : 0;
            if (step == 0)
                return;
            var at =
                items.FindIndex(i => i.IsFocused || i.IsKeyboardFocusWithin);
            if (at < 0)
                return;
            var next = items[Math.Clamp(at + step, 0, items.Count - 1)];
            e.Handled = true;
            controller.OpenSidebarPage(next.Page);
            next.Focus();
        };
        column.Children.Add(stack);
        signOut.Margin = new Thickness(8, 4, 8, 12);
        signOut.Click += (_, _) => AskSignOut();
        Grid.SetRow(signOut, 1);
        column.Children.Add(signOut);
        list.Child = column;
        list.BorderThickness = new Thickness(0, 0, 1, 0);
        Children.Add(list);
        Grid.SetColumn(host, 1);
        Children.Add(host);
        Lifetime.Own(this, confirm);
        Lifetime.Watch(this, controller, _ => {
            if (Differs())
                Apply();
        });
        Apply();
    }

    /// <summary>The row that signs out.</summary>
    public PressableButton SignOutRow => signOut;

    public Dialog Confirm => confirm;

    /// <summary>The entries of the list, in their order.</summary>
    public IReadOnlyList<PressableButton> Entries => items;

    /// <summary>The page whose entry is chosen in the list.</summary>
    public SidebarPage Chosen { get; private set; } = SidebarPage.Settings;

    /// <summary>The pane at the right now.</summary>
    public Control? Pane => host.Child;

    /// <summary>Shows <paramref name="pane"/>, the one of <paramref name="page"/>, and chooses its entry in the list.</summary>
    public void Show(SidebarPage page, Control pane)
    {
        var chosen = page == SidebarPage.Logs ? SidebarPage.Advanced : page;
        Chosen = chosen;
        foreach (var item in items)
            item.Selected = item.Page == chosen;
        if (!ReferenceEquals(host.Child, pane))
            host.Child = pane;
    }

    /// <summary>Asks whether to sign out; the answer is in the buttons of the dialog.</summary>
    public void AskSignOut()
    {
        var window = TopLevel.GetTopLevel(this);
        if (window == null)
            return;
        var c = ThemeScope.GetColors(this);
        var yes = new PrimaryButton {
            Title = controller.T("signOut")
        };
        var no = new TextButton {
            Title = controller.T("cancel")
        };
        yes.Click += (_, _) => {
            confirm.Close();
            _ = controller.Logout();
        };
        no.Click += (_, _) => confirm.Close();
        ThemeScope.SetColors(yes, c);
        ThemeScope.SetColors(no, c);
        confirm.Show(window, c, controller.T("signOut.title"),
            controller.T("signOut.body"), yes, no);
    }

    // The list shows the language, the colours and the font; the store
    // changes for many other reasons.
    private bool Differs()
    {
        return seenLocale != controller.Store.Value.Locale ||
               !Equals(seenFont, Fonts.System);
    }

    private void Apply()
    {
        var c = ThemeScope.GetColors(this);
        seenLocale = controller.Store.Value.Locale;
        seenFont = Fonts.System;
        Background = new SolidColorBrush(c.Bg);
        list.BorderBrush = new SolidColorBrush(c.Separator);
        foreach (var item in items)
            item.Text = controller.T(item.Key);
        signOut.Text = controller.T("signOut");
    }

    /// <summary>An entry of the list: its icon and its name; the chosen one is filled with the colour of a chosen chat.</summary>
    private sealed class ListItem : PressableButton {
        private readonly Icon icon = new() {
            Size = 20,
            VerticalAlignment = VerticalAlignment.Center,
            Margin = new Thickness(0, 0, 12, 0),
        };

        private readonly TextBlock label = new() {
            FontSize = RowFont,
            TextTrimming = TextTrimming.CharacterEllipsis,
            VerticalAlignment = VerticalAlignment.Center,
        };

        private readonly bool danger;

        public ListItem(string glyph, bool danger)
        {
            this.danger = danger;
            icon.Glyph = glyph;
            Height = 40;
            Padding = new Thickness(15, 0, 12, 0);
            CornerRadius = new CornerRadius(10);
            var line = new Grid {
                ColumnDefinitions = new ColumnDefinitions("Auto,*")
            };
            Grid.SetColumn(label, 1);
            line.Children.Add(icon);
            line.Children.Add(label);
            Child = line;
        }

        public SidebarPage Page { get; init; }
        public string Key { get; init; } = "";

        public bool Selected {
            get;
            set {
                field = value;
                Refresh();
            }
        }

        public string Text {
            set {
                label.Text = value;
                label.FontFamily = Fonts.System;
                Avalonia.Automation.AutomationProperties.SetName(this, value);
            }
        }

        protected override void Refresh()
        {
            var c = Colors;
            Background = Selected ? new SolidColorBrush(c.Selected)
                : Pressed ? new SolidColorBrush(c.Separator)
                : Hovered ? new SolidColorBrush(c.Hover)
                : Brushes.Transparent;
            var ink = danger ? c.Danger : Selected ? c.OnSelected : c.Text;
            label.Foreground = new SolidColorBrush(ink);
            icon.Color = new SolidColorBrush(danger ? c.Danger
                : Selected ? c.OnSelected
                : c.TextSecondary);
        }
    }
}
