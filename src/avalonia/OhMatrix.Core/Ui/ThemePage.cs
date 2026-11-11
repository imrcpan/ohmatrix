using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.I18n;
using OhMatrix.Core.State;
using OhMatrix.Core.Theming;

namespace OhMatrix.Core.Ui;

/// <summary>
/// The theme picker (<c>ThemePage</c> and <c>ThemeGrid</c>): a small chat drawn with the real bubbles in the theme as it is now stays at the top, so
/// that each theme can be tried and seen at once; under it the cards of System and every registered theme, at most four to a row.
/// </summary>
public sealed class ThemePage : Grid {
    private const double CardW = 84;
    private const double CardGap = 12;
    private const int Columns = 4;

    private readonly AppController controller;
    private readonly Border bar = new();
    private readonly Border previewHost = new();

    private readonly WrapPanel cards = new() {
        HorizontalAlignment = HorizontalAlignment.Center,
        Margin = new Thickness(CardGap),
    };

    // Registered once for the type: a handler made in the constructor
    // stays in the property's observers for good and runs once for each
    // control that was ever made.
    static ThemePage()
    {
        ThemeScope.ColorsProperty.Changed.AddClassHandler<ThemePage>((p, _) =>
            p.Apply());
    }

    public ThemePage(AppController controller)
    {
        this.controller = controller;
        RowDefinitions = new RowDefinitions("Auto,Auto,*");
        Children.Add(bar);
        Grid.SetRow(previewHost, 1);
        Children.Add(previewHost);
        cards.MaxWidth = CardW * Columns + CardGap * (Columns - 1);
        var scroller = new ScrollViewer {
            Content = new Border {
                Padding = new Thickness(0, 20, 0, 24),
                Child = cards
            },
            HorizontalScrollBarVisibility =
                Avalonia.Controls.Primitives.ScrollBarVisibility.Disabled,
        };
        Grid.SetRow(scroller, 2);
        Children.Add(scroller);
        Lifetime.Watch(this, controller, state => {
            if (Differs(state))
                Apply();
        });
        Apply();
    }

    public WrapPanel Cards => cards;

    // The page shows the language, the chosen theme, the themes there are
    // and the font; the store changes for many other reasons.
    private string? seenLocale;
    private string? seenTheme;
    private IReadOnlyList<ThemeDefinition>? seenThemes;
    private FontFamily? seenFont;

    private bool Differs(AppState state)
    {
        return seenLocale != state.Locale || seenTheme != state.Prefs.Theme ||
               !ReferenceEquals(seenThemes, Themes.All()) ||
               !Equals(seenFont, Fonts.System);
    }

    private void Apply()
    {
        var c = ThemeScope.GetColors(this);
        var s = controller.Store.Value;
        seenLocale = s.Locale;
        seenTheme = s.Prefs.Theme;
        seenThemes = Themes.All();
        seenFont = Fonts.System;
        Background = new SolidColorBrush(c.Bg);
        PageBar.Fill(bar, c, controller.T("theme"), controller.T("settings"),
            () => controller.OpenSidebarPage(SidebarPage.Settings));

        previewHost.Child = Preview(c, s.Locale);
        cards.Children.Clear();
        var light = Themes.Get("light")!;
        var dark = Themes.Get("dark")!;
        cards.Children.Add(Card(c, Themes.System, controller.T("theme.system"),
            s.Prefs.Theme,
            SystemPreview(light, dark)));
        foreach (var def in Themes.All())
            cards.Children.Add(
                Card(c, def.Id, def.LabelFor(s.Locale), s.Prefs.Theme,
                    MiniChat(def)));
    }

    private Control Preview(ColorTokens c, string locale)
    {
        var chat = new StackPanel {
            Spacing = 6
        };
        chat.Children.Add(new Border {
            Background = new SolidColorBrush(c.ServiceChip),
            CornerRadius = new CornerRadius(999),
            Padding = new Thickness(12, 4),
            HorizontalAlignment = HorizontalAlignment.Center,
            Child = new TextBlock {
                Text = Strings.T(locale, "today"),
                FontSize = 13,
                FontWeight = FontWeight.Medium,
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(c.ServiceChipText),
            },
        });
        chat.Children.Add(
            new Bubble(c, Strings.T(locale, "theme.preview.in"), "9:41",
                false) {
                HorizontalAlignment = HorizontalAlignment.Left,
                Margin = new Thickness(10, 0),
            });
        chat.Children.Add(
            new Bubble(c, Strings.T(locale, "theme.preview.out"), "9:42",
                true) {
                HorizontalAlignment = HorizontalAlignment.Right,
                Margin = new Thickness(10, 0),
            });
        var host = new Border {
            Background = new SolidColorBrush(c.ChatBg),
            BorderBrush = new SolidColorBrush(c.Separator),
            BorderThickness = new Thickness(0, 1, 0, 1),
            Padding = new Thickness(0, 12, 0, 22),
            Child = chat,
        };
        Avalonia.Automation.AutomationProperties.SetName(host,
            Strings.T(locale, "theme.preview"));
        return host;
    }

    /// <summary>The picture on a card: the chat background with a bubble of each kind and the bar colour at the bottom.</summary>
    private static Control MiniChat(ThemeDefinition def)
    {
        var c = def.Colors;
        var grid = new Grid {
            Background = new SolidColorBrush(c.ChatBg),
            RowDefinitions = new RowDefinitions("*,*,7"),
            Margin = new Thickness(0),
        };
        grid.Children.Add(new Border {
            Width = 34,
            Height = 12,
            CornerRadius = new CornerRadius(6),
            Background = new SolidColorBrush(c.BubbleIn),
            HorizontalAlignment = HorizontalAlignment.Left,
            VerticalAlignment = VerticalAlignment.Bottom,
            Margin = new Thickness(8, 0, 0, 2.5),
        });
        var own = new Border {
            Width = 42,
            Height = 12,
            CornerRadius = new CornerRadius(6),
            Background = new SolidColorBrush(c.BubbleOut),
            HorizontalAlignment = HorizontalAlignment.Right,
            VerticalAlignment = VerticalAlignment.Top,
            Margin = new Thickness(0, 2.5, 8, 0),
        };
        Grid.SetRow(own, 1);
        grid.Children.Add(own);
        var footer = new Border {
            Background = new SolidColorBrush(c.Bg)
        };
        Grid.SetRow(footer, 2);
        grid.Children.Add(footer);
        return grid;
    }

    private static Control SystemPreview(ThemeDefinition light,
        ThemeDefinition dark)
    {
        var left = new Border {
            ClipToBounds = true,
            Child = new Border {
                Width = 72,
                HorizontalAlignment = HorizontalAlignment.Left,
                Child = MiniChat(light)
            },
        };
        var right = new Border {
            ClipToBounds = true,
            Child = new Border {
                Width = 72,
                Margin = new Thickness(-36, 0, 0, 0),
                HorizontalAlignment = HorizontalAlignment.Left,
                Child = MiniChat(dark),
            },
        };
        Grid.SetColumn(right, 1);
        var grid = new Grid {
            ColumnDefinitions = new ColumnDefinitions("*,*")
        };
        grid.Children.Add(left);
        grid.Children.Add(right);
        return grid;
    }

    private Control Card(ColorTokens c, string id, string label, string current,
        Control preview)
    {
        var active = current == id;
        var frame = new Border {
            Width = CardW,
            Height = 74,
            CornerRadius = new CornerRadius(18),
            BorderThickness = new Thickness(2.5),
            BorderBrush = active
                ? new SolidColorBrush(c.Accent)
                : Brushes.Transparent,
            Padding = new Thickness(3),
        };
        var inner = new Border {
            CornerRadius = new CornerRadius(14),
            ClipToBounds = true,
            Child = preview
        };
        var layers = new Grid();
        layers.Children.Add(inner);
        if (active) {
            layers.Children.Add(new Border {
                Width = 20,
                Height = 20,
                CornerRadius = new CornerRadius(10),
                Background = new SolidColorBrush(c.Accent),
                HorizontalAlignment = HorizontalAlignment.Right,
                VerticalAlignment = VerticalAlignment.Bottom,
                Margin = new Thickness(0, 0, 3, 3),
                Child = new Icon {
                    Glyph = "check",
                    Size = 13,
                    StrokeWidth = 3,
                    Color = new SolidColorBrush(c.OnAccent),
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                },
            });
        }

        frame.Child = layers;
        var stack = new StackPanel {
            Width = CardW,
            Spacing = 6,
            Margin = new Thickness(CardGap / 2),
            Cursor = new Cursor(StandardCursorType.Hand),
            Background = Brushes.Transparent,
        };
        stack.Children.Add(frame);
        stack.Children.Add(new TextBlock {
            Text = label,
            FontSize = 13,
            FontFamily = Fonts.System,
            FontWeight = active ? FontWeight.SemiBold : FontWeight.Normal,
            Foreground = new SolidColorBrush(active ? c.Accent : c.Text),
            TextTrimming = TextTrimming.CharacterEllipsis,
            HorizontalAlignment = HorizontalAlignment.Center,
        });
        Avalonia.Automation.AutomationProperties.SetName(stack, label);
        stack.PointerPressed += (_, e) => {
            e.Handled = true;
            controller.SetPreferences(p => p with {
                Theme = id
            });
        };
        return stack;
    }
}
