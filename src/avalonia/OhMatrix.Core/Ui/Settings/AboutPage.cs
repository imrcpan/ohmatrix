using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.State;
using OhMatrix.Core.Ui.Appearance;
using OhMatrix.Core.Ui.Support;
using OhMatrix.Core.Ui.Widgets;

namespace OhMatrix.Core.Ui.Settings;

/// <summary>The about pane of the settings window: the repository, the way to ask for more, the version and the licence.</summary>
public sealed class AboutPage : Grid {
    public const string Repository = "https://github.com/imrcpan/ohmatrix";

    private readonly AppController controller;
    private readonly Border bar = new();
    private readonly StackPanel content = new();

    // Registered once for the type: a handler made in the constructor
    // stays in the property's observers for good and runs once for each
    // control that was ever made.
    static AboutPage()
    {
        ThemeScope.ColorsProperty.Changed
            .AddClassHandler<AboutPage>((p, _) => p.Apply());
    }

    public AboutPage(AppController controller)
    {
        this.controller = controller;
        RowDefinitions = new RowDefinitions("Auto,*");
        Children.Add(bar);
        var scroller = new ScrollViewer {
            Content = content,
            HorizontalScrollBarVisibility =
                Avalonia.Controls.Primitives.ScrollBarVisibility.Disabled,
        };
        Grid.SetRow(scroller, 1);
        Children.Add(scroller);
        Lifetime.Watch(this, controller, _ => Apply());
        Apply();
    }

    /// <summary>The version of the app.</summary>
    public static string Version =>
        typeof(AboutPage).Assembly.GetName().Version?.ToString(3) ?? "dev";

    private void OpenRepository()
    {
        var launcher = TopLevel.GetTopLevel(this)?.Launcher;
        if (launcher != null)
            _ = launcher.LaunchUriAsync(new Uri(Repository));
    }

    private void Apply()
    {
        var c = ThemeScope.GetColors(this);
        Background = new SolidColorBrush(c.Bg);
        PageBar.Title(bar, c, controller.T("about"));
        content.Children.Clear();
        content.Children.Add(SettingsRows.Option(c, "external", "GitHub",
            OpenRepository, Repository.Replace("https://github.com/", "")));
        content.Children.Add(SettingsRows.Note(c,
            controller.T("about.feedback")));
        content.Children.Add(SettingsRows.Option(c, "about", "OhMatrix", null,
            $"{controller.T("version")} {Version}"));
        content.Children.Add(new TextBlock {
            Text = "OhMatrix · GPL-3.0",
            FontSize = 12,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.TextSecondary),
            HorizontalAlignment = HorizontalAlignment.Center,
            Margin = new Thickness(0, 24, 0, 32),
        });
    }
}
