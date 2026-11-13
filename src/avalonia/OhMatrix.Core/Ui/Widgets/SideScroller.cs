using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Layout;
using Avalonia.Styling;

namespace OhMatrix.Core.Ui.Widgets;

/// <summary>
/// A scroller for a row that is wider than its room: the scroll bar is shown under it whenever it overflows, and the wheel of the mouse turns it.
/// The scroll bars of the app are made for the vertical ones (4 wide, hidden until the pointer comes), so this one has its own: the length of the
/// room, 4 high, its thumb always seen.
/// </summary>
public static class SideScroller {
    private const double Bar = 4;

    /// <summary>Makes the scroller of <paramref name="content"/>.</summary>
    public static ScrollViewer Make(Control content)
    {
        var scroller = new ScrollViewer {
            Content = content,
            HorizontalScrollBarVisibility = ScrollBarVisibility.Auto,
            VerticalScrollBarVisibility = ScrollBarVisibility.Disabled,
            AllowAutoHide = false,
        };
        var bar = new Style(x => x.OfType<ScrollBar>().Class(":horizontal"));
        bar.Setters.Add(new Setter(Layoutable.WidthProperty, double.NaN));
        bar.Setters.Add(new Setter(Layoutable.MinWidthProperty, 0.0));
        bar.Setters.Add(new Setter(Layoutable.HeightProperty, Bar));
        bar.Setters.Add(new Setter(Layoutable.MinHeightProperty, Bar));
        bar.Setters.Add(new Setter(Layoutable.MarginProperty,
            new Thickness(4, 0)));
        scroller.Styles.Add(bar);
        var thumb = new Style(x => x.OfType<ScrollBar>().Class(":horizontal")
            .Template().OfType<Thumb>());
        thumb.Setters.Add(new Setter(Visual.OpacityProperty, 1.0));
        thumb.Setters.Add(new Setter(Layoutable.HeightProperty, Bar));
        scroller.Styles.Add(thumb);
        // The arrows at its ends are not drawn, as in the other scroll bars.
        var arrows = new Style(x => x.OfType<ScrollBar>().Class(":horizontal")
            .Template().OfType<RepeatButton>());
        arrows.Setters.Add(new Setter(Visual.IsVisibleProperty, false));
        scroller.Styles.Add(arrows);
        scroller.PointerWheelChanged += (_, e) => {
            // A wheel that turns up and down moves the row sideways; one that
            // turns sideways (a touchpad) is the scroller's own.
            var room = scroller.Extent.Width - scroller.Viewport.Width;
            if (room <= 0 || e.Delta.Y == 0 || e.Delta.X != 0)
                return;
            scroller.Offset = new Vector(
                Math.Clamp(scroller.Offset.X - e.Delta.Y * 60, 0, room), 0);
            e.Handled = true;
        };
        return scroller;
    }
}
