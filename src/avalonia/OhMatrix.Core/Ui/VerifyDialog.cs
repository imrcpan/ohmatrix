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
/// The verification with another session, as a dialog over whatever page is open (<c>VerifyDialog</c> of the React Native app): a request that came in
/// to accept or decline, the wait for the other side, the seven pictures to compare, and the end.
/// </summary>
public sealed class VerifyDialog {
    private readonly AppController controller;
    private readonly Control owner;
    private VerifyFlow? shown;

    public VerifyDialog(AppController controller, Control owner)
    {
        this.controller = controller;
        this.owner = owner;
        Dialog.Modal = true;
    }

    public Dialog Dialog { get; } = new();

    /// <summary>The buttons of the open dialog, by their labels' keys of the language file.</summary>
    public IReadOnlyDictionary<string, PressableButton> Buttons { get; private set; } =
        new Dictionary<string, PressableButton>();

    public IReadOnlyList<string> Symbols { get; private set; } = [];

    private string T(string key, params (string, object)[] values)
    {
        return Strings.T(controller.Store.Value.Locale, key, values);
    }

    /// <summary>Shows what the verification is at, or closes the dialog when there is none.</summary>
    public void Update(VerifyFlow? flow)
    {
        if (ReferenceEquals(flow, shown))
            return;
        if (flow is null) {
            shown = null;
            Dialog.Close();
            return;
        }

        if (TopLevel.GetTopLevel(owner) is not { } window)
            return;
        shown = flow;
        var c = ThemeScope.GetColors(owner);
        var buttons = new Dictionary<string, PressableButton>();

        PressableButton Button(string key, bool primary, Func<Task> press)
        {
            PressableButton b = primary
                ? new PrimaryButton {
                    Title = T(key)
                }
                : new TextButton {
                    Title = T(key)
                };
            ThemeScope.SetColors(b, c);
            b.Click += (_, _) => _ = press();
            buttons[key] = b;
            return b;
        }

        var close = () => controller.DismissVerification();
        var who = flow.Who ?? T("verify.ownSession");
        Symbols = [];
        var content = new List<Control>();
        string title;
        string? body;
        switch (flow.Phase) {
            case VerifyPhase.Requested when flow.Incoming:
                title = T("verify.request.title");
                body = T("verify.request.body", ("who", who));
                content.Add(Button("verify.accept", true, () => controller.AcceptVerification()));
                content.Add(Button("verify.decline", false, close));
                break;
            case VerifyPhase.Requested:
                title = T("verify.waiting.title");
                body = T("verify.waiting.body", ("who", T("verify.ownSession")));
                content.Add(Button("verify.close", false, close));
                break;
            case VerifyPhase.Waiting:
                title = T("verify.waiting.title");
                body = T("verify.starting");
                content.Add(Button("verify.close", false, close));
                break;
            case VerifyPhase.Emojis:
                title = T("verify.compare.title");
                body = T("verify.compare.body");
                Symbols = flow.Emojis?.Select(e => e.Symbol).ToList() ?? [];
                content.Add(Pictures(flow.Emojis ?? [], c));
                content.Add(
                    Button("verify.match", true, () => controller.ConfirmVerification(true)));
                content.Add(Button("verify.mismatch", false,
                    () => controller.ConfirmVerification(false)));
                break;
            case VerifyPhase.Done:
                title = T("verify.done.title");
                body = flow.Who is null
                    ? T("verify.done.own")
                    : T("verify.done.user", ("who", flow.Who));
                content.Add(Button("verify.close", true, close));
                break;
            case VerifyPhase.Cancelled:
                title = T("verify.cancelled.title");
                body = T("verify.cancelled.body");
                content.Add(Button("verify.close", true, close));
                break;
            default:
                title = T("verify.failed.title");
                body = T("verify.failed.body");
                content.Add(Button("verify.close", true, close));
                break;
        }

        Buttons = buttons;
        Dialog.Show(window, c, title, body, content.ToArray());
    }

    private static Control Pictures(IReadOnlyList<VerifyEmoji> emojis, ColorTokens c)
    {
        var panel = new WrapPanel {
            HorizontalAlignment = HorizontalAlignment.Center
        };
        foreach (var e in emojis) {
            var cell = new StackPanel {
                Width = 64,
                Margin = new Thickness(0, 4),
                Spacing = 2
            };
            cell.Children.Add(new TextBlock {
                Text = e.Symbol,
                FontSize = 30,
                TextAlignment = TextAlignment.Center,
            });
            cell.Children.Add(new TextBlock {
                Text = e.Description,
                FontSize = 11,
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(c.TextSecondary),
                TextAlignment = TextAlignment.Center,
                TextWrapping = TextWrapping.Wrap,
            });
            panel.Children.Add(cell);
        }

        return panel;
    }
}
