using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Controls.Primitives;
using Avalonia.Input;
using Avalonia.VisualTree;

namespace OhMatrix.Core.Ui.Widgets;

/// <summary>
/// The click area of the vertical scrollbars: a strip of 10 at the right edge of each scroll viewer (the 4 of the bar, 4 of space on its left and 2 on its right). A press in the strip, and a drag from it, scroll the viewer to the place of the pointer, so the whole strip is clickable and the bar
/// itself stays 4 wide. The bar is shown while the pointer is over the viewer, or while a press from the strip is held.
/// </summary>
public static class ScrollStrip {
    /// <summary>The width of the click area: the bar (4) and the space beside it (4 and 2).</summary>
    public const double Strip = 10;

    private sealed class State {
        public ScrollBar? Bar;
        public bool Hovered;
        public bool Pressed;
    }

    private static readonly
        System.Runtime.CompilerServices.ConditionalWeakTable<ScrollViewer,
            State> States = new();

    /// <summary>Registers the handlers of every scroll viewer of the app; once, at start.</summary>
    public static void Install()
    {
        InputElement.PointerEnteredEvent.AddClassHandler<ScrollViewer>(
            (viewer, _) => SetHovered(viewer, true), handledEventsToo: true);
        InputElement.PointerMovedEvent.AddClassHandler<ScrollViewer>(
            (viewer, e) => {
                SetHovered(viewer, true);
                if (States.GetValue(viewer, _ => new State()).Pressed)
                    ScrollTo(viewer, e.GetPosition(viewer));
            }, handledEventsToo: true);
        InputElement.PointerExitedEvent.AddClassHandler<ScrollViewer>(
            (viewer, _) => SetHovered(viewer, false), handledEventsToo: true);
        InputElement.PointerPressedEvent.AddClassHandler<ScrollViewer>(
            (viewer, e) => {
                var at = e.GetPosition(viewer);
                if (!InStrip(viewer, at))
                    return;
                var state = States.GetValue(viewer, _ => new State());
                state.Pressed = true;
                e.Pointer.Capture(viewer);
                ScrollTo(viewer, at);
                e.Handled = true;
            }, handledEventsToo: true);
        InputElement.PointerReleasedEvent.AddClassHandler<ScrollViewer>(
            (viewer, e) => {
                var state = States.GetValue(viewer, _ => new State());
                if (!state.Pressed)
                    return;
                state.Pressed = false;
                e.Pointer.Capture(null);
                Refresh(viewer);
            }, handledEventsToo: true);
        TemplatedControl.TemplateAppliedEvent.AddClassHandler<ScrollViewer>((
            viewer, _) => Refresh(viewer));
    }

    private static bool InStrip(ScrollViewer viewer, Point at)
    {
        return at.X >= viewer.Bounds.Width - Strip && at.X >= 0 &&
               at.Y >= 0 && at.Y <= viewer.Bounds.Height;
    }

    // The place of the pointer along the viewer is the place along the content.
    private static void ScrollTo(ScrollViewer viewer, Point at)
    {
        var range = viewer.Extent.Height - viewer.Viewport.Height;
        if (range <= 0 || viewer.Bounds.Height <= 0)
            return;
        var ratio = Math.Clamp(at.Y / viewer.Bounds.Height, 0, 1);
        viewer.Offset = new Vector(viewer.Offset.X, ratio * range);
    }

    private static void SetHovered(ScrollViewer viewer, bool hovered)
    {
        States.GetValue(viewer, _ => new State()).Hovered = hovered;
        Refresh(viewer);
    }

    private static void Refresh(ScrollViewer viewer)
    {
        var state = States.GetValue(viewer, _ => new State());
        var bar = state.Bar ??= viewer.GetVisualDescendants()
            .OfType<ScrollBar>()
            .FirstOrDefault(b => b.Orientation == Orientation.Vertical);
        if (bar == null)
            return;
        var thumb = bar.GetVisualDescendants().OfType<Thumb>().FirstOrDefault();
        if (thumb != null)
            thumb.Opacity = state.Hovered || state.Pressed ? 1 : 0;
    }
}
