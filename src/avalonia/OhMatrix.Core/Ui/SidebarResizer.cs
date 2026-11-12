using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Media;
using OhMatrix.Core.Ui.Appearance;

namespace OhMatrix.Core.Ui;

/// <summary>
/// The draggable divider on the right edge of the sidebar (<c>SidebarResizer</c>). It reports the live width while dragging and the final width on
/// release; a double click resets to the automatic width. The line shows in the accent colour under the pointer and while dragging.
/// </summary>
public sealed class SidebarResizer : Border {
    private readonly Border line = new() {
        Width = 2,
        HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Center
    };

    private bool hover;
    private bool dragging;
    private double startWidth;
    private double startX;

    /// <summary>The width of the sidebar now; the drag starts from it.</summary>
    public Func<double> Current { get; set; } = () => 0;

    /// <summary>Gives the width a drag may reach.</summary>
    public Func<double, double> Clamp { get; set; } = w => w;

    /// <summary>The width while dragging, null when the drag is over.</summary>
    public Action<double?> Live { get; set; } = _ => {
    };

    /// <summary>The width when released; null resets to the automatic width.</summary>
    public Action<double?> Commit { get; set; } = _ => {
    };

    // Registered once for the type: a handler made in the constructor
    // stays in the property's observers for good and runs once for each
    // control that was ever made.
    static SidebarResizer()
    {
        ThemeScope.ColorsProperty.Changed
            .AddClassHandler<SidebarResizer>((r, _) => r.Paint());
    }

    public SidebarResizer()
    {
        Width = 9;
        Background = Brushes.Transparent;
        Cursor = new Cursor(StandardCursorType.SizeWestEast);
        Child = line;
        Avalonia.Automation.AutomationProperties.SetName(this,
            "Resize chat list");
        Paint();
    }

    private void Paint()
    {
        var c = ThemeScope.GetColors(this);
        line.Background = hover || dragging
            ? new SolidColorBrush(c.Accent)
            : Brushes.Transparent;
        line.Opacity = dragging ? 1 : 0.7;
    }

    protected override void OnAttachedToVisualTree(
        VisualTreeAttachmentEventArgs e)
    {
        base.OnAttachedToVisualTree(e);
        Paint();
    }

    protected override void OnPointerEntered(PointerEventArgs e)
    {
        hover = true;
        Paint();
    }

    protected override void OnPointerExited(PointerEventArgs e)
    {
        hover = false;
        Paint();
    }

    protected override void OnPointerPressed(PointerPressedEventArgs e)
    {
        if (!e.GetCurrentPoint(this).Properties.IsLeftButtonPressed)
            return;
        e.Handled = true;
        if (e.ClickCount >= 2) {
            Commit(null);
            return;
        }

        dragging = true;
        startWidth = Current();
        startX = e.GetPosition(TopLevel.GetTopLevel(this)).X;
        e.Pointer.Capture(this);
        Paint();
    }

    protected override void OnPointerMoved(PointerEventArgs e)
    {
        if (!dragging)
            return;
        var x = e.GetPosition(TopLevel.GetTopLevel(this)).X;
        Live(Clamp(startWidth + x - startX));
    }

    protected override void OnPointerReleased(PointerReleasedEventArgs e)
    {
        if (!dragging)
            return;
        dragging = false;
        e.Pointer.Capture(null);
        var x = e.GetPosition(TopLevel.GetTopLevel(this)).X;
        Live(null);
        // A press without a drag changes nothing.
        if (Math.Abs(x - startX) >= 3)
            Commit(Clamp(startWidth + x - startX));
        Paint();
    }
}
