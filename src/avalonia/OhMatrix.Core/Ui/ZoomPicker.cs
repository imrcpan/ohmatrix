using Avalonia.Controls;
using Avalonia.Threading;
using OhMatrix.Core.State;
using OhMatrix.Core.Ui.Appearance;
using OhMatrix.Core.Ui.Support;
using OhMatrix.Core.Ui.Widgets;

namespace OhMatrix.Core.Ui;

/// <summary>
/// Changing the size of the interface (<c>useZoomChange</c> and the zoom menu): a menu of sizes, a new size tried at once, and a dialog that asks to
/// keep it with a countdown, which goes back by itself when the time is up. It is made for one place (the sign-in page, the settings) and watches
/// the state, so the dialog is there whichever page started the trial.
/// </summary>
public sealed class ZoomPicker : IOverlay {
    public static readonly double[] Scales = [
        0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3
    ];

    private readonly AppController controller;
    private readonly Control host;
    private readonly TimeProvider time;

    private readonly Dialog dialog = new() {
        Modal = true
    };

    private readonly PrimaryButton keep = new();
    private readonly TextButton revert = new();

    private readonly DispatcherTimer countdown = new() {
        Interval = TimeSpan.FromMilliseconds(250)
    };

    public ZoomPicker(AppController controller, Control host, bool up,
        TimeProvider? time = null)
    {
        this.controller = controller;
        this.host = host;
        this.time = time ?? TimeProvider.System;
        Menu = new Menu {
            Up = up
        };
        keep.Click += (_, _) => controller.KeepZoom();
        revert.Click += (_, _) => controller.RevertZoom();
        dialog.OnClose = controller.RevertZoom;
        countdown.Tick += (_, _) => Sync();
        Lifetime.Stop(this, countdown);
        Lifetime.Watch(this, controller, _ => Sync());
    }

    public Menu Menu { get; }
    public Dialog Dialog => dialog;


    /// <summary>The text of a size: <c>125%</c>.</summary>
    public static string Percent(double scale)
    {
        return $"{Math.Round(scale * 100)}%";
    }

    /// <summary>Opens the menu of sizes on <paramref name="anchor"/>.</summary>
    public void Open(Control anchor)
    {
        var window = TopLevel.GetTopLevel(host);
        if (window == null)
            return;
        var scale = controller.Store.Value.Prefs.UiScale;
        Menu.Show(
            anchor,
            window,
            [
                .. Scales.Select(v => new MenuItem(
                    Percent(v),
                    () => controller.TryZoom(v),
                    Checked: v == scale
                )),
            ]
        );
    }

    /// <summary>Opens the confirmation while a zoom is being tried, counts it down, and closes it when the trial is over.</summary>
    private void Sync()
    {
        var trial = controller.Store.Value.ZoomTrial;
        if (trial == null) {
            countdown.Stop();
            dialog.Close();
            return;
        }

        var left = Math.Max(0,
            (int)Math.Ceiling((trial.Until - time.GetUtcNow()).TotalSeconds));
        var message = controller.T("zoom.confirm.body", ("n", left.ToString()),
            ("from", Percent(trial.From)));
        if (dialog.IsOpen) {
            dialog.SetMessage(message);
            return;
        }

        var window = TopLevel.GetTopLevel(host);
        if (window == null)
            return;
        keep.Title = controller.T("zoom.confirm.keep");
        revert.Title = controller.T("zoom.confirm.revert");
        dialog.Show(window, ThemeScope.GetColors(host),
            controller.T("zoom.confirm.title"),
            message, keep,
            revert);
        countdown.Start();
    }

    // The page is thrown away: what hangs on the window goes. The trial is
    // the state of the account and stays as it is.
    public void Close()
    {
        Menu.Close();
        dialog.Close();
    }

    /// <summary>Closes both for good: they are not shown again.</summary>
    public void Retire()
    {
        Menu.Retire();
        dialog.Retire();
    }
}
