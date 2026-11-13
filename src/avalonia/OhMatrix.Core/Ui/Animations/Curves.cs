using Avalonia.Animation.Easings;

namespace OhMatrix.Core.Ui.Animations;

/// <summary>
/// The curves of motion: how far a thing is on its way at each moment. None is linear, because nothing in the world starts and stops at once.
/// Each is one cubic Bézier, chosen by what it feels like, and made once: they hold no state, so any number of motions share them.
/// </summary>
public static class Curves {
    /// <summary>
    /// For what comes: it is quick at the start and settles slowly, so it is there at once and lands softly (39% of the way in the first tenth of the
    /// time, 70% in the first quarter, 91% in the first half). The tail is long on purpose, as that is what makes a motion look smooth.
    /// </summary>
    public static Easing Enter { get; } =
        new SplineEasing(0.165, 0.84, 0.44, 1);

    /// <summary>
    /// For what goes: it starts gently and speeds up, so it lets go of the eye instead of being snatched away (9% of the way in the first quarter
    /// of the time, 32% in the first half, 84% in the first nine tenths).
    /// </summary>
    public static Easing Exit { get; } = new SplineEasing(0.4, 0, 1, 1);
}
