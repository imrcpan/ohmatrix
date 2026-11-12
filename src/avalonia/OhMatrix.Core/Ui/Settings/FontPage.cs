using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;
using OhMatrix.Core.State;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui.Appearance;
using OhMatrix.Core.Ui.Support;
using OhMatrix.Core.Ui.Widgets;
using Menu = OhMatrix.Core.Ui.Overlays.Menu;
using MenuItem = OhMatrix.Core.Ui.Overlays.MenuItem;

namespace OhMatrix.Core.Ui.Settings;

/// <summary>
/// The font settings (<c>FontDialog</c>, as a pane of the settings window): the fonts of the interface (the general one; the English and the
/// other-language ones, which follow the general one until they are chosen; and the monospaced one), and the weights that the Light, Normal and
/// Bold texts are drawn in. The weight names are not translated.
/// </summary>
public sealed class FontPage : Grid {
    private enum Target {
        General,
        English,
        Other,
        Mono,
    }

    private enum Role {
        Light,
        Normal,
        Bold,
    }

    // The weights a role can take, with the names they are called by.
    private static readonly (string Name, int Weight)[] Weights = [
        ("Thin", 100),
        ("ExtraLight", 200),
        ("Light", 300),
        ("Normal", 400),
        ("Medium", 500),
        ("SemiBold", 600),
        ("Bold", 700),
        ("ExtraBold", 800),
        ("Black", 900),
    ];

    private readonly AppController controller;
    private readonly Border bar = new();

    private readonly StackPanel rows = new() {
        Margin = new Thickness(0, 0, 0, 24)
    };

    private readonly Menu chooser = new() {
        AlignRight = true
    };

    private IReadOnlyList<string>? installed;

    // Registered once for the type: a handler made in the constructor
    // stays in the property's observers for good and runs once for each
    // control that was ever made.
    static FontPage()
    {
        ThemeScope.ColorsProperty.Changed.AddClassHandler<FontPage>((p, _) =>
            p.Apply());
    }

    public FontPage(AppController controller)
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
        Lifetime.OwnAll(this, chooser);
        Lifetime.Watch(this, controller, _ => Apply());
        Apply();
    }

    public StackPanel Rows => rows;

    /// <summary>The list of fonts or weights that is open under a field.</summary>
    public Menu Chooser => chooser;

    private void Apply()
    {
        var c = ThemeScope.GetColors(this);
        var p = controller.Store.Value.Prefs;
        Background = new SolidColorBrush(c.Bg);
        PageBar.Title(bar, c, controller.T("font"));
        rows.Children.Clear();

        rows.Children.Add(SettingsRows.Caption(c,
            controller.T("font.section.fonts")));
        rows.Children.Add(FontRow(c, Target.General,
            controller.T("font.general"),
            p.Font == null ? controller.T("font.system") : p.Font));
        rows.Children.Add(FontRow(c, Target.English,
            controller.T("font.english"),
            Shown(p.EnglishFont, controller.T("font.follow"))));
        rows.Children.Add(FontRow(c, Target.Other,
            controller.T("font.other"),
            Shown(p.OtherFont, controller.T("font.follow"))));
        rows.Children.Add(FontRow(c, Target.Mono, controller.T("font.mono"),
            p.MonoFont ?? controller.T("font.system")));
        rows.Children.Add(SettingsRows.Note(c, controller.T("font.footer")));

        rows.Children.Add(SettingsRows.Caption(c,
            controller.T("font.section.weights")));
        rows.Children.Add(WeightRow(c, Role.Light, "Light", p.LightWeight));
        rows.Children.Add(WeightRow(c, Role.Normal, "Normal", p.NormalWeight));
        rows.Children.Add(WeightRow(c, Role.Bold, "Bold", p.BoldWeight));
        rows.Children.Add(new Border {
            Height = 24
        });
    }

    // The value of a font that can follow the general one: null follows it,
    // an empty name is the system's own.
    private string Shown(string? name, string follow)
    {
        return name == null ? follow
            : name.Length == 0 ? controller.T("font.system")
            : name;
    }

    // A row of the fonts: its value, and the list of the installed fonts
    // under the field that is pressed.
    private Border FontRow(ColorTokens c, Target target, string label,
        string value)
    {
        Border? field = null;
        var row = SettingsRows.Dropdown(c, "font", label,
            () => ChooseFont(target, field!), value, out field);
        return row;
    }

    private void ChooseFont(Target target, Control anchor)
    {
        var window = TopLevel.GetTopLevel(this);
        if (window == null)
            return;
        var p = controller.Store.Value.Prefs;
        var current = target switch {
            Target.General => p.Font,
            Target.English => p.EnglishFont,
            Target.Other => p.OtherFont,
            _ => p.MonoFont,
        };
        var items = new List<MenuItem>();
        // The English and the other-language fonts can follow the general
        // one, and the system's own is a choice of its own.
        if (target is Target.English or Target.Other) {
            items.Add(new MenuItem(controller.T("font.follow"),
                () => Change(target, null), Checked: current == null));
            items.Add(new MenuItem(controller.T("font.system"),
                () => Change(target, ""), Checked: current == ""));
        } else {
            items.Add(new MenuItem(controller.T("font.system"),
                () => Change(target, null), Checked: current == null));
        }

        installed ??= Fonts.Installed();
        foreach (var name in installed) {
            items.Add(new MenuItem(name, () => Change(target, name),
                Checked: name == current));
        }

        chooser.Show(anchor, window, items);
    }

    private void Change(Target target, string? name)
    {
        controller.SetPreferences(p => target switch {
            Target.General => p with {
                Font = name
            },
            Target.English => p with {
                EnglishFont = name
            },
            Target.Other => p with {
                OtherFont = name
            },
            _ => p with {
                MonoFont = name
            },
        });
    }

    // A row of a weight: its name and its number, and the list of the
    // weights under the field that is pressed.
    private Border WeightRow(ColorTokens c, Role role, string label, int weight)
    {
        Border? field = null;
        var name = Weights.FirstOrDefault(w => w.Weight == weight).Name;
        var value = name == null ? weight.ToString() : $"{name} {weight}";
        var row = SettingsRows.Dropdown(c, "font", label,
            () => ChooseWeight(role, field!), value, out field);
        return row;
    }

    private void ChooseWeight(Role role, Control anchor)
    {
        var window = TopLevel.GetTopLevel(this);
        if (window == null)
            return;
        var p = controller.Store.Value.Prefs;
        var current = role switch {
            Role.Light => p.LightWeight,
            Role.Normal => p.NormalWeight,
            _ => p.BoldWeight,
        };
        var items = Weights.Select(w => new MenuItem($"{w.Name} {w.Weight}",
            () => controller.SetPreferences(q => role switch {
                Role.Light => q with {
                    LightWeight = w.Weight
                },
                Role.Normal => q with {
                    NormalWeight = w.Weight
                },
                _ => q with {
                    BoldWeight = w.Weight
                },
            }), Checked: w.Weight == current)).ToList();
        chooser.Show(anchor, window, items);
    }
}
