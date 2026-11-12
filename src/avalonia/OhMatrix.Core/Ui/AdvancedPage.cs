using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;
using OhMatrix.Core.State;

namespace OhMatrix.Core.Ui;

/// <summary>
/// The advanced options (<c>AdvancedPage</c>): the way to the log. Pull to refresh is a gesture of the phone, so it is not offered here.
/// </summary>
public sealed class AdvancedPage : Grid {
    private readonly AppController controller;
    private readonly StackPanel content = new();

    private readonly Border bar = new() {
        Height = 56,
        BorderThickness = new Thickness(0, 0, 0, 1)
    };

    // Registered once for the type: a handler made in the constructor
    // stays in the property's observers for good and runs once for each
    // control that was ever made.
    static AdvancedPage()
    {
        ThemeScope.ColorsProperty.Changed
            .AddClassHandler<AdvancedPage>((p, _) => p.Apply());
    }

    public AdvancedPage(AppController controller)
    {
        this.controller = controller;
        RowDefinitions = new RowDefinitions("Auto,*");
        Children.Add(bar);
        var scroller = new ScrollViewer {
            Content = content
        };
        Grid.SetRow(scroller, 1);
        Children.Add(scroller);
        Lifetime.Watch(this, controller, _ => Apply());
        Apply();
    }

    private void Apply()
    {
        var c = ThemeScope.GetColors(this);
        Background = new SolidColorBrush(c.Bg);
        bar.BorderBrush = new SolidColorBrush(c.Separator);
        PageBar.Title(bar, c, controller.T("advanced"));
        content.Children.Clear();
        content.Children.Add(SettingsRows.Option(c, "file",
            controller.T("logs.view"),
            () => controller.OpenSidebarPage(SidebarPage.Logs)));
    }
}
