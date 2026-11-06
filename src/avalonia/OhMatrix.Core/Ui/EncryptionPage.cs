using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.I18n;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;
using OhMatrix.Core.Theming;

namespace OhMatrix.Core.Ui;

/// <summary>
/// The encryption of the account (<c>EncryptionPage</c>), as far as it is ported: its state, and for a device that cannot read the history yet the
/// way to unlock it with the recovery key. Setting the keys up, exporting them and the verification with another session are not ported.
/// </summary>
public sealed class EncryptionPage : Grid {
    private readonly AppController controller;
    private readonly StackPanel content = new();

    private readonly Border bar = new() {
        Height = 56,
        BorderThickness = new Thickness(0, 0, 0, 1)
    };

    public EncryptionPage(AppController controller)
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
        controller.Store.Changed += _ => Apply();
        ThemeScope.ColorsProperty.Changed.AddClassHandler<EncryptionPage>((p, _) => p.Apply());
        Apply();
    }

    public PromptDialog RecoveryPrompt { get; } = new();

    /// <summary>The row that asks for the recovery key; null when the state has no such step.</summary>
    public Border? RecoveryRow { get; private set; }

    private string T(string key, params (string, object)[] values)
    {
        return Strings.T(controller.Store.Value.Locale, key, values);
    }

    /// <summary>The words for a state, as the profile and this page show it.</summary>
    public static string Words(SecurityState state, Func<string, string> t)
    {
        return state switch {
            SecurityState.Ready => t("enc.on"),
            SecurityState.NeedsSetup => t("enc.setup"),
            SecurityState.NeedsRecovery => t("enc.verify"),
            _ => t("enc.unavailable"),
        };
    }

    /// <summary>Asks for the recovery key to unlock the history of this device.</summary>
    public void AskRecoveryKey()
    {
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        RecoveryPrompt.Show(window, ThemeScope.GetColors(this), controller.Store.Value.Locale,
            T("sec.recovery.title"), T("sec.recovery.body"),
            [new PromptField(T("sec.recoveryKey"), "key", false, true)], T("sec.action.verify"),
            v => controller.RestoreWithRecoveryKey(v[0]));
    }

    private void Apply()
    {
        var c = ThemeScope.GetColors(this);
        var s = controller.Store.Value;
        Background = new SolidColorBrush(c.Bg);
        bar.BorderBrush = new SolidColorBrush(c.Separator);
        PageBar.Fill(bar, c, T("encryption"), T("profile"),
            () => controller.OpenSidebarPage(SidebarPage.Profile));
        content.Children.Clear();
        content.Children.Add(new TextBlock {
            Text = T("security"),
            FontSize = 13,
            FontWeight = FontWeight.SemiBold,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.TextSecondary),
            Margin = new Thickness(26, 18, 12, 0),
        });
        content.Children.Add(ProfilePage.NavRow(c, "lock", T("encryption"), () => {
            }, 6,
            Words(s.Security, k => T(k)), false));
        RecoveryRow = null;
        if (s.Security == SecurityState.NeedsRecovery) {
            RecoveryRow = ProfilePage.NavRow(c, "key", T("sec.recovery.title"), AskRecoveryKey, 12);
            content.Children.Add(RecoveryRow);
        }
    }
}
