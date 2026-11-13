using Avalonia;
using OhMatrix.Core.Ui.Animations;

namespace OhMatrix.Tests.Ui;

/// <summary>
/// Takes the place of the frames of a window for as long as it lives. A motion asks for a frame and gets none until the test shows one, with the
/// time the test gives it, so a motion is stepped by hand and the way it goes can be looked at. Motion is on while it lives, and is as it was after.
/// </summary>
internal sealed class FrameClock : IDisposable {
    private readonly Func<Visual, Action<TimeSpan>, bool> frames =
        Motion.Frames;

    private readonly bool enabled = Motion.Enabled;
    private readonly double slowdown = Motion.Slowdown;

    // What was asked for, and is shown by the next frame; the clock does not
    // start at nothing, as no clock does.
    private List<Action<TimeSpan>> asked = [];
    private double now = 5000;

    public FrameClock()
    {
        Motion.Enabled = true;
        Motion.Slowdown = 1;
        Motion.Frames = (_, frame) => {
            asked.Add(frame);
            return true;
        };
    }

    /// <summary>A frame was asked for and has not been shown.</summary>
    public bool Waiting => asked.Count > 0;

    /// <summary>Shows a frame, <paramref name="ms"/> after the one before, to all that asked for one.</summary>
    public void Frame(double ms = 16)
    {
        if (asked.Count == 0)
            throw new InvalidOperationException("No frame was asked for.");
        var due = asked;
        asked = [];
        now += ms;
        var time = TimeSpan.FromMilliseconds(now);
        foreach (var frame in due)
            frame(time);
    }

    /// <summary>
    /// Shows frames, 16 ms apart, until none is asked for, and calls <paramref name="each"/> after each. It returns how long the motion took, from
    /// its first frame (that frame is its start and takes no time).
    /// </summary>
    public double Finish(Action? each = null)
    {
        var shown = 0;
        while (Waiting) {
            Frame();
            shown++;
            each?.Invoke();
            if (shown > 400)
                throw new InvalidOperationException(
                    "The motion does not end.");
        }

        return Math.Max(0, shown - 1) * 16.0;
    }

    public void Dispose()
    {
        Motion.Frames = frames;
        Motion.Enabled = enabled;
        Motion.Slowdown = slowdown;
    }
}
