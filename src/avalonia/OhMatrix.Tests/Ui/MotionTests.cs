using Avalonia.Headless.XUnit;
using OhMatrix.Core.Ui.Animations;
using Xunit;

namespace OhMatrix.Tests.Ui;

/// <summary>The switch, the times and the curves of <c>Ui/Animations</c>.</summary>
public class MotionTests {
    // The switch is one for the whole process, and the tests of the interface
    // run on one thread, one after the other: a test that sets it must be one
    // of them, and must put it back.
    [AvaloniaFact]
    public void A_time_is_nothing_when_motion_is_off_and_slowed_when_asked()
    {
        var enabled = Motion.Enabled;
        var slowdown = Motion.Slowdown;
        try {
            Motion.Enabled = false;
            Assert.Equal(TimeSpan.Zero, Motion.Time(240));
            Motion.Enabled = true;
            Motion.Slowdown = 1;
            Assert.Equal(TimeSpan.FromMilliseconds(240), Motion.Time(240));
            Assert.Equal(TimeSpan.Zero, Motion.Time(0));
            Motion.Slowdown = 4;
            Assert.Equal(TimeSpan.FromMilliseconds(960), Motion.Time(240));
        } finally {
            Motion.Enabled = enabled;
            Motion.Slowdown = slowdown;
        }
    }

    [AvaloniaFact]
    public void The_tests_run_without_motion()
    {
        Assert.False(Motion.Enabled);
    }

    [Fact]
    public void Both_curves_start_at_nothing_end_at_all_and_never_go_back()
    {
        foreach (var curve in new[] {
                     Curves.Enter, Curves.Exit
                 }) {
            Assert.Equal(0, curve.Ease(0), 6);
            Assert.Equal(1, curve.Ease(1), 6);
            var last = 0.0;
            for (var i = 1; i <= 200; i++) {
                var v = curve.Ease(i / 200.0);
                Assert.True(v >= last - 1e-9 && v <= 1 + 1e-9,
                    $"{v} after {last} at {i}/200");
                last = v;
            }
        }
    }

    [Fact]
    public void What_comes_leads_the_straight_line_and_what_goes_trails_it()
    {
        for (var i = 1; i < 10; i++) {
            var t = i / 10.0;
            Assert.True(Curves.Enter.Ease(t) > t, $"coming at {t}");
            Assert.True(Curves.Exit.Ease(t) < t, $"going at {t}");
        }

        // The words of the notes on the curves.
        Assert.InRange(Curves.Enter.Ease(0.1), 0.35, 0.45);
        Assert.InRange(Curves.Enter.Ease(0.5), 0.9, 0.95);
        Assert.InRange(Curves.Exit.Ease(0.25), 0.05, 0.12);
        Assert.InRange(Curves.Exit.Ease(0.5), 0.28, 0.36);
    }

    [Fact]
    public void The_times_grow_and_none_is_longer_than_a_third_of_a_second()
    {
        var times = new[] {
            Durations.Fast, Durations.Normal, Durations.Slow
        };
        Assert.Equal(times.Order(), times);
        Assert.Equal(times.Length, times.Distinct().Count());
        Assert.All(times, t => Assert.InRange(t, 1, 333));
    }
}
