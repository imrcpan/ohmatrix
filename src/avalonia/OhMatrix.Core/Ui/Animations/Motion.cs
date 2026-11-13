using Avalonia;
using Avalonia.Controls;

namespace OhMatrix.Core.Ui.Animations;

/// <summary>
/// The switch and the clock of everything that moves. Every motion of the app asks <see cref="Enabled"/> whether it moves at all, so one
/// setting turns them all off (for people who want less motion, and for the tests, which look at the end of a change and not at the way to it),
/// and <see cref="Slowdown"/> slows them all down (to look at one closely while it is tuned). It is read and set on the thread of the interface only.
/// </summary>
public static class Motion {
    /// <summary>When it is false nothing moves: each change is made at once.</summary>
    public static bool Enabled { get; set; } = true;

    /// <summary>How many times slower everything moves than it was designed to; 1 is as designed.</summary>
    public static double Slowdown { get; set; } = 1;

    /// <summary>
    /// Asks for the next frame of the window <c>visual</c> is in: the callback is given the time of that frame, and runs just before it is drawn,
    /// so a motion that is stepped there is in step with the screen. False when <c>visual</c> is in no window, and nothing will come. A test
    /// takes the place of it to step a motion by hand.
    /// </summary>
    internal static Func<Visual, Action<TimeSpan>, bool> Frames { get; set; } =
        InWindow;

    private static bool InWindow(Visual visual, Action<TimeSpan> frame)
    {
        var window = TopLevel.GetTopLevel(visual);
        if (window == null)
            return false;
        window.RequestAnimationFrame(frame);
        return true;
    }
}
