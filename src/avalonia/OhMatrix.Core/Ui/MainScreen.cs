using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.I18n;
using OhMatrix.Core.State;

namespace OhMatrix.Core.Ui;

/// <summary>The page of a signed-in account. It holds only who is signed in and the way out until the chat screens are ported.</summary>
public sealed class MainScreen : Grid {
    private readonly AppController controller;

    private readonly TextBlock who = new() {
        FontSize = 18,
        FontWeight = FontWeight.SemiBold,
        FontFamily = Fonts.System,
        TextAlignment = TextAlignment.Center,
    };

    private readonly TextButton signOut = new();

    public MainScreen(AppController controller)
    {
        this.controller = controller;
        var column = new StackPanel {
            Spacing = 16,
            MaxWidth = 380,
            VerticalAlignment = VerticalAlignment.Center,
        };
        column.Children.Add(who);
        column.Children.Add(signOut);
        Children.Add(column);
        signOut.Click += (_, _) => _ = controller.Logout();
        controller.Store.Changed += _ => Apply();
        ThemeScope.ColorsProperty.Changed.AddClassHandler<MainScreen>((s, _) => s.Apply());
        Apply();
    }

    private void Apply()
    {
        var s = controller.Store.Value;
        who.Text = s.UserId ?? "";
        who.Foreground = new SolidColorBrush(ThemeScope.GetColors(this).Text);
        signOut.Title = Strings.T(s.Locale, "signOut");
    }
}
