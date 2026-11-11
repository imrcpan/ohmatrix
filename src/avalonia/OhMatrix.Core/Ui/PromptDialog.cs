using Avalonia.Controls;
using Avalonia.Media;
using OhMatrix.Core.I18n;
using OhMatrix.Core.Theming;

namespace OhMatrix.Core.Ui;

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
    private readonly Dialog dialog = new();
    private readonly List<TextField> fields = [];
    private readonly PrimaryButton confirm = new();
    private readonly TextButton cancel = new();

    private readonly TextBlock error = new() {
        FontSize = 14,
        FontFamily = Fonts.System,
        TextAlignment = TextAlignment.Center,
        TextWrapping = TextWrapping.Wrap,
        IsVisible = false,
    };

    private IReadOnlyList<PromptField> spec = [];
    private Func<IReadOnlyList<string>, Task>? onConfirm;
    private bool busy;

    public Dialog Dialog => dialog;
    public IReadOnlyList<TextField> Fields => fields;
    public PrimaryButton ConfirmButton => confirm;
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
        content.Add(confirm);
        content.Add(cancel);
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
        if (busy || !Ready() || onConfirm is null)
            return;
        busy = true;
        error.IsVisible = false;
        Refresh();
        try {
            await onConfirm(fields.Select(f => f.Text.Trim()).ToList());
            Close();
        } catch (Exception e) {
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
