using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.I18n;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui.Appearance;
using OhMatrix.Core.Ui.Support;
using OhMatrix.Core.Ui.Widgets;
using OhMatrix.Infra.Logging;

namespace OhMatrix.Core.Ui.Overlays;

/// <summary>A field of a <see cref="PromptDialog"/>.</summary>
public sealed record PromptField(
    string Label,
    string Glyph = "user",
    bool Optional = false,
    bool Secret = false
);

/// <summary>
/// A small form in a <see cref="Dialog"/> (<c>PromptDialog</c>): text fields, a confirm button that is ready when every field that is not optional is
/// filled and that may fail (the reason is shown under the fields), and Cancel. The button works while the confirmation runs.
/// </summary>
public sealed class PromptDialog : IOverlay {
    private static readonly Logger logger = Logger.GetDefault();

    private readonly Dialog dialog = new();
    private readonly List<TextField> fields = [];
    private readonly CapsuleButton confirm = new(true);
    private readonly CapsuleButton cancel = new(false);

    // The confirmation and Cancel at the right, in a row: Cancel is the last.
    private readonly StackPanel actions = new() {
        Orientation = Orientation.Horizontal,
        Spacing = 8,
        HorizontalAlignment = HorizontalAlignment.Right,
        Margin = new Thickness(0, 6, 0, 4),
    };

    private readonly TextBlock error = new() {
        FontSize = 14,
        TextAlignment = TextAlignment.Center,
        TextWrapping = TextWrapping.Wrap,
        IsVisible = false,
    };

    private IReadOnlyList<PromptField> spec = [];
    private Func<IReadOnlyList<string>, Task>? onConfirm;
    private bool busy;

    public Dialog Dialog => dialog;

    /// <summary>The icon of the dialog at the left of its title (see <see cref="Overlays.Dialog.Glyph"/>).</summary>
    public string Glyph {
        get => dialog.Glyph;
        set => dialog.Glyph = value;
    }

    public IReadOnlyList<TextField> Fields => fields;
    public CapsuleButton ConfirmButton => confirm;

    /// <summary>A warning: the title has the red warning mark, and the confirmation is red.</summary>
    public bool Warning {
        get;
        set {
            field = value;
            confirm.Danger = value;
            dialog.Warning = value;
        }
    }

    public string? ErrorText => error.IsVisible ? error.Text : null;

    /// <summary>Opens the dialog in <paramref name="window"/>.</summary>
    public void Show(
        TopLevel window,
        ColorTokens colors,
        string locale,
        string title,
        string message,
        IReadOnlyList<PromptField> fieldSpec,
        string confirmLabel,
        Func<IReadOnlyList<string>, Task> confirmed
    )
    {
        spec = fieldSpec;
        onConfirm = confirmed;
        busy = false;
        fields.Clear();
        error.IsVisible = false;
        error.Foreground = new SolidColorBrush(colors.Danger);
        var content = new List<Control>();
        foreach (var f in fieldSpec) {
            var field = new TextField {
                Label = f.Label,
                Glyph = f.Glyph
            };
            // The card of a dialog is the secondary surface: the box is the background.
            field.OnCard = true;
            ThemeScope.SetColors(field, colors);
            if (f.Secret)
                field.Reveal = (Strings.T(locale, "password.show"),
                    Strings.T(locale, "password.hide"));
            field.TextChanged += (_, _) => Refresh();
            field.Submit += (_, _) => Confirm();
            fields.Add(field);
            content.Add(field);
        }

        confirm.Title = confirmLabel;
        cancel.Title = Strings.T(locale, "cancel");
        ThemeScope.SetColors(confirm, colors);
        ThemeScope.SetColors(cancel, colors);
        confirm.Click -= OnConfirmClick;
        confirm.Click += OnConfirmClick;
        cancel.Click -= OnCancelClick;
        cancel.Click += OnCancelClick;
        content.Add(error);
        // The buttons are kept in their row from one showing to the next, so
        // the row is emptied before they are put in it again.
        actions.Children.Clear();
        actions.Children.Add(confirm);
        actions.Children.Add(cancel);
        content.Add(actions);
        Refresh();
        dialog.Show(window, colors, title, message, [.. content]);
        fields.FirstOrDefault()?.FocusBox();
    }

    public void Close()
    {
        dialog.Close();
    }

    private void OnConfirmClick(object? sender, EventArgs e)
    {
        Confirm();
    }

    private void OnCancelClick(object? sender, EventArgs e)
    {
        Close();
    }

    private bool Ready()
    {
        for (var i = 0; i < spec.Count; i++) {
            if (!spec[i].Optional && fields[i].Text.Trim().Length == 0)
                return false;
        }

        return true;
    }

    private void Refresh()
    {
        confirm.Loading = busy;
        confirm.Disabled = !Ready();
    }

    /// <summary>Runs the confirmation if the form is ready; its failure is shown and the dialog stays.</summary>
    public void Confirm()
    {
        _ = ConfirmAsync();
    }

    private async Task ConfirmAsync()
    {
        if (busy || !Ready() || onConfirm == null)
            return;
        busy = true;
        error.IsVisible = false;
        Refresh();
        try {
            await onConfirm(fields.Select(f => f.Text.Trim()).ToList());
            Close();
        } catch (Exception e) {
            logger.Caught("confirm a dialog", e);
            error.Text = e.Message;
            error.IsVisible = true;
        } finally {
            busy = false;
            Refresh();
        }
    }

    /// <summary>Closes it for good: it is not shown again.</summary>
    public void Retire()
    {
        Close();
        dialog.Retire();
    }
}
