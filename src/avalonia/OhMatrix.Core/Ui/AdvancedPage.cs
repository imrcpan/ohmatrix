using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;
using OhMatrix.Core.I18n;
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
        controller.Store.Changed += _ => Apply();
        ThemeScope.ColorsProperty.Changed
            .AddClassHandler<AdvancedPage>((p, _) => p.Apply());
        Apply();
    }

    private string T(string key)
    {
        return Strings.T(controller.Store.Value.Locale, key);
    }

    private void Apply()
    {
        var c = ThemeScope.GetColors(this);
        Background = new SolidColorBrush(c.Bg);
        bar.BorderBrush = new SolidColorBrush(c.Separator);
        PageBar.Fill(bar, c, T("advanced.options"), T("settings"),
            () => controller.OpenSidebarPage(SidebarPage.Settings));
        content.Children.Clear();
        content.Children.Add(ProfilePage.NavRow(c, "file", T("logs.view"),
            () => controller.OpenSidebarPage(SidebarPage.Logs), 12));
    }
}
