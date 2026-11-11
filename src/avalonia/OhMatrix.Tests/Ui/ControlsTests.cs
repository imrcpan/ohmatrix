using Avalonia;
using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using Avalonia.VisualTree;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui;
using Spinner = OhMatrix.Core.Ui.Spinner;
using Xunit;

namespace OhMatrix.Tests.Ui;

public class ControlsTests {
    private static StackPanel Column(string themeId, params Control[] controls)
    {
        var panel = new StackPanel {
            Spacing = 16,
            Margin = new Thickness(24),
            Width = 340
        };
        ThemeScope.SetColors(panel, Themes.Get(themeId)!.Colors);
        panel.Background = new SolidColorBrush(Themes.Get(themeId)!.Colors.Bg);
        foreach (var c in controls)
            panel.Children.Add(c);
        return panel;
    }

    [AvaloniaFact]
    public void The_controls_have_the_sizes_of_the_React_Native_ones()
    {
        var primary = new PrimaryButton {
            Title = "Sign in"
        };
        var text = new TextButton {
            Title = "Create account"
        };
        var field = new TextField {
            Label = "Username",
            Glyph = "user"
        };
        var window = new Window {
            Content = Column("light", field, primary, text),
            Width = 400,
            Height = 320
        };
        window.Show();
        Assert.Equal(50, primary.Bounds.Height);
        Assert.Equal(40, text.Bounds.Height);
        Assert.Equal(44, field.Bounds.Height);
        Assert.Equal(340, primary.Bounds.Width);
        Assert.Equal(new CornerRadius(12), primary.CornerRadius);
        Assert.Equal(new CornerRadius(10), field.CornerRadius);
    }

    [AvaloniaFact]
    public void The_primary_button_takes_its_colours_from_the_theme()
    {
        var button = new PrimaryButton {
            Title = "Sign in"
        };
        var window = new Window {
            Content = Column("dark-green", button),
            Width = 400,
            Height = 200
        };
        window.Show();
        var c = Themes.Get("dark-green")!.Colors;
        Assert.Equal(c.Accent, ((SolidColorBrush)button.Background!).Color);
        button.Disabled = true;
        Assert.Equal(c.Separator, ((SolidColorBrush)button.Background!).Color);
        button.Disabled = false;
        button.Loading = true;
        Assert.Equal(0.5, button.Opacity);
    }

    [AvaloniaFact]
    public void A_click_is_raised_once_for_a_press_and_release_on_the_button()
    {
        var button = new TextButton {
            Title = "Go"
        };
        var window = new Window {
            Content = Column("light", button),
            Width = 400,
            Height = 160
        };
        window.Show();
        var clicks = 0;
        button.Click += (_, _) => clicks++;
        var middle =
            button.TranslatePoint(new Point(button.Bounds.Width / 2, 20),
                window)!.Value;
        window.MouseDown(middle, Avalonia.Input.MouseButton.Left);
        window.MouseUp(middle, Avalonia.Input.MouseButton.Left);
        Assert.Equal(1, clicks);
    }

    [AvaloniaFact]
    public void The_password_box_hides_the_text_until_the_eye_is_pressed()
    {
        var field = new TextField {
            Label = "Password",
            Glyph = "lock",
            Text = "secret"
        };
        field.Reveal = ("Show password", "Hide password");
        var window = new Window {
            Content = Column("light", field),
            Width = 400,
            Height = 120
        };
        window.Show();
        var box = field.GetVisualDescendants().OfType<TextBox>().Single();
        Assert.Equal('●', box.PasswordChar);
        var eye = field.GetVisualDescendants().OfType<Border>()
            .Single(b => b.Cursor != null && b.Width == 32);
        var p = eye.TranslatePoint(new Point(16, 22), window)!.Value;
        window.MouseDown(p, Avalonia.Input.MouseButton.Left);
        window.MouseUp(p, Avalonia.Input.MouseButton.Left);
        Assert.Equal('\0', box.PasswordChar);
    }

    // Writes the controls to a picture when OHMATRIX_CONTROLS_SHEET names a file, to look at them.
    [AvaloniaFact]
    public void A_change_of_colours_repaints_a_control_once_however_many_exist()
    {
        // The handler of the colours is made once for a type; one made by
        // each control stays in the property for good and runs for every
        // control that was ever made.
        var blocks = Enumerable.Range(0, 25)
            .Select(_ => new SkeletonBlock(10, 10)).ToList();
        var buttons = Enumerable.Range(0, 25)
            .Select(_ => new PrimaryButton()).ToList();
        var repainted = 0;
        blocks[0].PropertyChanged += (_, e) => {
            if (e.Property == Border.BackgroundProperty)
                repainted++;
        };
        ThemeScope.SetColors(blocks[0], Themes.Get("dark")!.Colors);
        Assert.Equal(1, repainted);

        repainted = 0;
        buttons[0].PropertyChanged += (_, e) => {
            if (e.Property == Border.BackgroundProperty)
                repainted++;
        };
        ThemeScope.SetColors(buttons[0], Themes.Get("dark")!.Colors);
        Assert.Equal(1, repainted);
    }

    [AvaloniaFact]
    public void The_controls_can_be_drawn_in_a_light_and_a_dark_theme()
    {
        Control Form(string theme) => Column(theme,
            new TextField {
                Label = "Homeserver",
                Glyph = "globe",
                Text = "matrix.org"
            },
            new TextField {
                Label = "Password",
                Glyph = "lock",
                Text = "secret",
                Reveal = ("Show", "Hide")
            },
            new PrimaryButton {
                Title = "Sign in"
            },
            new PrimaryButton {
                Title = "Sign in",
                Disabled = true
            },
            new TextButton {
                Title = "No account yet? Create one"
            },
            new Spinner());

        var row = new StackPanel {
            Orientation = Avalonia.Layout.Orientation.Horizontal
        };
        row.Children.Add(Form("light"));
        row.Children.Add(Form("dark"));
        var window = new Window {
            Content = row,
            Width = 760,
            Height = 520
        };
        window.Show();
        var frame = window.CaptureRenderedFrame();
        Assert.NotNull(frame);
        var path =
            Environment.GetEnvironmentVariable("OHMATRIX_CONTROLS_SHEET");
        if (!string.IsNullOrEmpty(path))
            frame.Save(path, new PngBitmapEncoderOptions());
    }
}
