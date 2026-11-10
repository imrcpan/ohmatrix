using Avalonia.Input.Platform;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;
using OhMatrix.Core.I18n;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;

namespace OhMatrix.Core.Ui;

/// <summary>
/// The encryption of the account (<c>EncryptionPage</c>), as far as it is ported: its state, and for a device that cannot read the history yet the
/// ways to unlock it: the recovery key, or the verification with another session. Exporting the keys is not offered: the Matrix SDK has no export.
/// </summary>
public sealed class EncryptionPage : Grid {
    private readonly AppController controller;
    private readonly StackPanel content = new();

    private readonly Border bar = new() {
        Height = 56,
        BorderThickness = new Thickness(0, 0, 0, 1)
    };

    // Registered once for the type: a handler made in the constructor
    // stays in the property's observers for good and runs once for each
    // control that was ever made.
    static EncryptionPage()
    {
        ThemeScope.ColorsProperty.Changed
            .AddClassHandler<EncryptionPage>((p, _) => p.Apply());
    }

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
        Lifetime.Watch(this, controller, _ => Apply());
        Apply();
    }

    public PromptDialog RecoveryPrompt { get; } = new();
    public PromptDialog SetupPrompt { get; } = new();

    /// <summary>The dialog that shows the new recovery key, once.</summary>
    public Dialog KeyDialog { get; } = new() {
        Modal = true
    };

    /// <summary>The recovery key being shown, or null.</summary>
    public string? ShownKey { get; private set; }

    /// <summary>The row that sets the encryption up; null when the state has no such step.</summary>
    public Border? SetupRow { get; private set; }

    /// <summary>The row that asks for the recovery key; null when the state has no such step.</summary>
    public Border? RecoveryRow { get; private set; }

    /// <summary>The row that makes new keys; null unless the account has working ones.</summary>
    public Border? ResetRow { get; private set; }

    /// <summary>The warning before new keys are made.</summary>
    public Dialog ResetDialog { get; } = new();

    /// <summary>Warns that new keys make the old recovery key useless, and goes on to the password.</summary>
    public void AskReset()
    {
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        var c = ThemeScope.GetColors(this);
        var go = new TextButton {
            Title = T("keys.reset.confirm"),
            Danger = true
        };
        var cancel = new TextButton {
            Title = T("cancel")
        };
        ThemeScope.SetColors(go, c);
        ThemeScope.SetColors(cancel, c);
        go.Click += (_, _) => {
            ResetDialog.Close();
            AskSetup();
        };
        cancel.Click += (_, _) => ResetDialog.Close();
        var warning = new TextBlock {
            Text = T("keys.reset.warning"),
            FontSize = 14,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.Danger),
            TextWrapping = TextWrapping.Wrap,
            TextAlignment = TextAlignment.Center,
        };
        ResetDialog.Show(window, c, T("keys.reset"), T("keys.reset.body"),
            warning, go, cancel);
    }

    /// <summary>The row that asks my other sessions to verify this one; null when the state has no such step.</summary>
    public Border? VerifyRow { get; private set; }

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

    /// <summary>Asks for the password to set the encryption up, then shows the recovery key to keep.</summary>
    public void AskSetup()
    {
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        SetupPrompt.Show(window, ThemeScope.GetColors(this),
            controller.Store.Value.Locale,
            T("sec.setup.title"), T("sec.setup.body"),
            [new PromptField(T("password"), "lock", false, true)],
            T("sec.action.setup"),
            async v => {
                var key = await controller.SetUpEncryption(v[0]);
                ShowKey(window, key);
            });
    }

    private void ShowKey(TopLevel window, string key)
    {
        ShownKey = key;
        var c = ThemeScope.GetColors(this);
        var copy = new PrimaryButton {
            Title = T("sec.copy")
        };
        var done = new TextButton {
            Title = T("sec.done")
        };
        ThemeScope.SetColors(copy, c);
        ThemeScope.SetColors(done, c);
        copy.Click += async (_, _) => {
            if (window.Clipboard is { } clipboard) {
                await clipboard.SetTextAsync(key);
                copy.Title = T("copied");
            }
        };
        done.Click += (_, _) => AskSaved(window);
        var shown = new Border {
            Background = new SolidColorBrush(c.BgSecondary),
            CornerRadius = new CornerRadius(10),
            Padding = new Thickness(12),
            Child = new SelectableTextBlock {
                Text = key,
                FontSize = 16,
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(c.Text),
                TextAlignment = TextAlignment.Center,
                TextWrapping = TextWrapping.Wrap,
            },
        };
        KeyDialog.Show(window, c, T("sec.saved.title"), T("sec.saved.body"),
            shown, copy, done);
    }

    private void AskSaved(TopLevel window)
    {
        var c = ThemeScope.GetColors(this);
        var yes = new PrimaryButton {
            Title = T("sec.confirm.yes")
        };
        var back = new TextButton {
            Title = T("sec.confirm.back")
        };
        ThemeScope.SetColors(yes, c);
        ThemeScope.SetColors(back, c);
        yes.Click += (_, _) => {
            ShownKey = null;
            KeyDialog.Close();
        };
        back.Click += (_, _) => {
            if (ShownKey is { } key)
                ShowKey(window, key);
        };
        KeyDialog.Show(window, c, T("sec.confirm.title"), T("sec.confirm.body"),
            yes, back);
    }

    /// <summary>Asks for the recovery key to unlock the history of this device.</summary>
    public void AskRecoveryKey()
    {
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        RecoveryPrompt.Show(window, ThemeScope.GetColors(this),
            controller.Store.Value.Locale,
            T("sec.recovery.title"), T("sec.recovery.body"),
            [new PromptField(T("sec.recoveryKey"), "key", false, true)],
            T("sec.action.verify"),
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
        content.Children.Add(ProfilePage.NavRow(c, "lock", T("encryption"),
            () => {
            }, 6,
            Words(s.Security, k => T(k)), false));
        RecoveryRow = null;
        VerifyRow = null;
        SetupRow = null;
        ResetRow = null;
        if (s.Security == SecurityState.NeedsSetup) {
            SetupRow = ProfilePage.NavRow(c, "key", T("sec.setup.title"),
                AskSetup, 12);
            content.Children.Add(SetupRow);
        }

        if (s.Security == SecurityState.Ready) {
            ResetRow = ProfilePage.NavRow(c, "refresh", T("keys.reset"),
                AskReset, 12, null, false,
                true);
            content.Children.Add(ResetRow);
        }

        if (s.Security == SecurityState.NeedsRecovery) {
            RecoveryRow = ProfilePage.NavRow(c, "key", T("sec.recovery.title"),
                AskRecoveryKey, 12);
            content.Children.Add(RecoveryRow);
            VerifyRow = ProfilePage.NavRow(
                c,
                "device",
                T("verify.session"),
                () => _ = controller.RequestVerification(),
                12
            );
            content.Children.Add(VerifyRow);
            content.Children.Add(new TextBlock {
                Text = T("verify.session.footer"),
                FontSize = 13,
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(c.TextSecondary),
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(26, 8, 26, 0),
            });
        }
    }
}
