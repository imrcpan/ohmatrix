using Avalonia;
using Avalonia.Controls;
using OhMatrix.Core.State;
using OhMatrix.Core.Ui.Appearance;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui.Overlays;
using OhMatrix.Core.Ui.Support;
using OhMatrix.Core.Ui.Widgets;
using Spinner = OhMatrix.Core.Ui.Widgets.Spinner;

namespace OhMatrix.Core.Ui.Media;

/// <summary>
/// "Save as" of a file of a message (<c>SaveAsDialog</c>): the file is fetched first, and where it is not at hand a dialog says it is being
/// downloaded, with a cancel. A press outside the dialog does not cancel it; Esc and the cancel button do. When the file is there, the place
/// to keep it is asked for.
/// </summary>
public sealed class SaveAsDialog(AppController controller) : IOverlay {
    /// <summary>A file that is fetched within this time is kept at once, with no dialog.</summary>
    public static readonly TimeSpan QuickWait = TimeSpan.FromMilliseconds(400);

    // TEMPORARY, for the style test of the dialog: while this is true, the
    // dialog spins until it is cancelled, whatever the fetch does. Set it back
    // to false when the style is done (the test of a finished fetch is skipped
    // meanwhile).
    public const bool SpinForever = false;

    private readonly Dialog dialog = new() {
        Glyph = "download",
        Modal = true,
        ActionsMargin = new Thickness(0, 6, 0, 0),
    };

    // The fetch that the dialog waits for; null when there is none.
    private TaskCompletionSource<bool>? waiting;

    /// <summary>The dialog is shown: the file takes a while to fetch.</summary>
    public bool IsOpen => dialog.IsOpen;

    /// <summary>Cancels the save that waits: the dialog goes, and nothing is kept.</summary>
    public void Cancel()
    {
        if (waiting != null && waiting.TrySetResult(true))
            dialog.Close();
    }

    public void Close()
    {
        dialog.Close();
    }

    public void Retire()
    {
        Close();
        dialog.Retire();
    }

    /// <summary>
    /// Fetches the file with <paramref name="fetch"/> and then has it kept with <paramref name="keep"/>. Nothing is kept when it is
    /// cancelled, and the file that comes after a cancel is removed.
    /// </summary>
    public async Task Save(TopLevel window, ColorTokens colors, string name,
        Func<Task<string?>> fetch, Func<string, Task> keep)
    {
        var fetching = fetch();
        // TEMPORARY (SpinForever): every save shows the dialog, even one that
        // is at hand.
        if (!SpinForever) {
            var ready = await Task.WhenAny(fetching, Task.Delay(QuickWait));
            if (ready == fetching) {
                await Finish(fetching, keep);
                return;
            }
        }

        var cancelled = new TaskCompletionSource<bool>(
            TaskCreationOptions.RunContinuationsAsynchronously);
        waiting = cancelled;
        var no = new TextButton {
            Title = controller.T("cancel")
        };
        ThemeScope.SetColors(no, colors);
        no.Click += (_, _) => Cancel();
        dialog.OnClose = Cancel;
        dialog.Show(window, colors,
            controller.T("saveAs.preparing", ("name", name)), null,
            new Spinner {
                Size = 28,
                Color = new Avalonia.Media.SolidColorBrush(colors.Accent),
                HorizontalAlignment =
                    Avalonia.Layout.HorizontalAlignment.Center,
                Margin = new Thickness(0, 16, 0, 0),
            },
            no);
        Task waitFor = SpinForever
            ? cancelled.Task
            : Task.WhenAny(fetching, cancelled.Task);
        await waitFor;
        if (cancelled.Task.IsCompleted) {
            // The fetch is not stopped: its file is removed when it comes.
            _ = fetching.ContinueWith(t => {
                if (t.IsCompletedSuccessfully)
                    Discard(t.Result);
            }, TaskScheduler.Default);
            return;
        }

        waiting = null;
        dialog.OnClose = null;
        dialog.Close();
        await Finish(fetching, keep);
    }

    // A file that cannot be fetched is said so, and nothing is asked for.
    private async Task Finish(Task<string?> fetching, Func<string, Task> keep)
    {
        string? path;
        try {
            path = await fetching;
        } catch (Exception) {
            controller.ShowNotice(controller.T("copyFailed"),
                NoticeKind.Error);
            return;
        }

        if (path != null)
            await keep(path);
        else
            controller.ShowNotice(controller.T("copyFailed"),
                NoticeKind.Error);
    }

    private static void Discard(string? path)
    {
        if (path == null)
            return;
        try {
            File.Delete(path);
        } catch (IOException) {
            // The copy is in the temporary folder; the system clears it.
        }
    }
}
