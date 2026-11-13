using Avalonia.Controls;
using Avalonia.Headless.XUnit;
using Avalonia.Media;
using OhMatrix.Core.Ui.Animations;
using Xunit;

namespace OhMatrix.Tests.Ui;

/// <summary>How a thing comes and goes: the numbers on the way, and what happens when it is turned round, brought back or stopped.</summary>
public class PresenceTests {
    // The scale and the shift a presence has put on a control.
    private static (double Scale, double Shift) Transform(Control control)
    {
        var group = (TransformGroup)control.RenderTransform!;
        return (((ScaleTransform)group.Children[0]).ScaleX,
            ((TranslateTransform)group.Children[1]).Y);
    }

    [AvaloniaFact]
    public void With_motion_off_it_is_in_place_at_once_and_gone_at_once()
    {
        var thing = new Border();
        var presence = new Presence(thing, thing) {
            FromShift = -10
        };
        var gone = 0;
        presence.Enter();
        Assert.Equal(1, thing.Opacity);
        Assert.Null(thing.RenderTransform);
        Assert.False(presence.Leaving);
        presence.Leave(() => gone++);
        Assert.Equal(0, thing.Opacity);
        Assert.Equal(1, gone);
        Assert.True(presence.Leaving);
    }

    [AvaloniaFact]
    public void A_thing_that_comes_starts_from_nothing_and_ends_in_place()
    {
        using var clock = new FrameClock();
        var thing = new Border();
        var presence = new Presence(thing, thing) {
            FromScale = 0.9,
            FromShift = -20
        };
        presence.Enter();
        Assert.Equal(0, thing.Opacity);
        Assert.Equal((0.9, -20), Transform(thing));

        var last = 0.0;
        var took = clock.Finish(() => {
            Assert.True(thing.Opacity >= last, "it went back");
            last = thing.Opacity;
            // The size and the place follow the opacity: it is one motion.
            if (thing.RenderTransform != null) {
                var (scale, shift) = Transform(thing);
                Assert.Equal(0.9 + 0.1 * thing.Opacity, scale, 9);
                Assert.Equal(-20 * (1 - thing.Opacity), shift, 9);
            }
        });
        Assert.Equal(1, thing.Opacity);
        // It is in place, and is not left with a transform on it.
        Assert.Null(thing.RenderTransform);
        Assert.InRange(took, Durations.Slow, Durations.Slow + 16.0);
    }

    [AvaloniaFact]
    public void The_card_grows_while_the_backdrop_fades()
    {
        using var clock = new FrameClock();
        var shade = new Grid();
        var card = new Border();
        shade.Children.Add(card);
        var presence = new Presence(shade, card);
        presence.Enter();
        clock.Frame();
        clock.Frame(48);
        Assert.InRange(shade.Opacity, 0.2, 0.99);
        Assert.Equal(1, card.Opacity);
        Assert.Null(shade.RenderTransform);
        Assert.InRange(Transform(card).Scale, 0.96, 0.999);
        clock.Finish();
        Assert.Null(card.RenderTransform);
    }

    [AvaloniaFact]
    public void A_thing_that_only_fades_gets_no_transform()
    {
        using var clock = new FrameClock();
        var thing = new Border();
        var presence = new Presence(thing);
        presence.Enter();
        clock.Frame();
        clock.Frame(48);
        Assert.InRange(thing.Opacity, 0.2, 0.99);
        Assert.Null(thing.RenderTransform);
        clock.Finish();
        Assert.Equal(1, thing.Opacity);
    }

    [AvaloniaFact]
    public void A_thing_that_goes_fades_out_and_says_so_once_when_gone()
    {
        using var clock = new FrameClock();
        var thing = new Border();
        var presence = new Presence(thing, thing);
        presence.Enter();
        clock.Finish();
        var gone = 0;
        presence.Leave(() => gone++);
        // Sending it away again does nothing.
        presence.Leave(() => gone += 10);
        Assert.True(presence.Leaving);
        Assert.Equal(1, thing.Opacity);

        var last = 1.0;
        clock.Finish(() => {
            Assert.True(thing.Opacity <= last, "it came back");
            last = thing.Opacity;
            // It is not said to be gone while it can still be seen.
            if (thing.Opacity > 0)
                Assert.Equal(0, gone);
        });
        Assert.Equal(0, thing.Opacity);
        Assert.Equal(1, gone);
    }

    [AvaloniaFact]
    public void What_goes_takes_less_time_than_what_comes()
    {
        using var clock = new FrameClock();
        var thing = new Border();
        var presence = new Presence(thing);
        presence.Enter();
        var coming = clock.Finish();
        presence.Leave(() => {
        });
        var going = clock.Finish();
        Assert.InRange(coming, Durations.Slow, Durations.Slow + 16.0);
        Assert.InRange(going, Durations.Normal, Durations.Normal + 16.0);
    }

    [AvaloniaFact]
    public void The_times_of_a_presence_can_be_given()
    {
        using var clock = new FrameClock();
        var thing = new Border();
        var presence = new Presence(thing) {
            EnterTime = Durations.Normal,
            LeaveTime = Durations.Fast,
        };
        presence.Enter();
        Assert.InRange(clock.Finish(), Durations.Normal,
            Durations.Normal + 16.0);
        presence.Leave(() => {
        });
        Assert.InRange(clock.Finish(), Durations.Fast, Durations.Fast + 16.0);
    }

    [AvaloniaFact]
    public void A_thing_sent_away_on_its_way_in_turns_round_where_it_is()
    {
        using var clock = new FrameClock();
        var thing = new Border();
        var presence = new Presence(thing, thing);
        presence.Enter();
        clock.Frame();
        clock.Frame(48);
        var there = thing.Opacity;
        Assert.InRange(there, 0.2, 0.9);

        var gone = 0;
        presence.Leave(() => gone++);
        // No jump: it goes on from where it is.
        Assert.Equal(there, thing.Opacity);
        var seen = new List<double>();
        var took = clock.Finish(() => seen.Add(thing.Opacity));
        Assert.Equal(there, seen[0], 9);
        Assert.Equal(seen.OrderByDescending(x => x), seen);
        Assert.Equal(0, thing.Opacity);
        Assert.Equal(1, gone);
        // Part of the way is part of the time.
        Assert.InRange(took, Durations.Normal * there - 1,
            Durations.Normal * there + 17);
    }

    [AvaloniaFact]
    public void A_thing_brought_back_on_its_way_out_is_not_said_to_be_gone()
    {
        using var clock = new FrameClock();
        var thing = new Border();
        var presence = new Presence(thing, thing);
        presence.Enter();
        clock.Finish();
        var gone = 0;
        presence.Leave(() => gone++);
        clock.Frame();
        clock.Frame(48);
        var there = thing.Opacity;
        Assert.InRange(there, 0.05, 0.99);

        presence.Enter();
        Assert.False(presence.Leaving);
        Assert.Equal(there, thing.Opacity);
        clock.Finish();
        Assert.Equal(0, gone);
        Assert.Equal(1, thing.Opacity);
        Assert.Null(thing.RenderTransform);
    }

    [AvaloniaFact]
    public void Cancel_puts_it_in_place_and_stops_what_runs()
    {
        using var clock = new FrameClock();
        var thing = new Border();
        var presence = new Presence(thing, thing);
        presence.Enter();
        clock.Frame();
        clock.Frame(48);
        Assert.InRange(thing.Opacity, 0.1, 0.99);

        presence.Cancel();
        Assert.Equal(1, thing.Opacity);
        Assert.Null(thing.RenderTransform);
        Assert.False(presence.Leaving);
        // The frame that was asked for comes, finds that it is not wanted
        // and asks for no more.
        clock.Frame();
        Assert.False(clock.Waiting);
        Assert.Equal(1, thing.Opacity);
    }

    [AvaloniaFact]
    public void Cancel_does_not_say_that_it_is_gone()
    {
        using var clock = new FrameClock();
        var thing = new Border();
        var presence = new Presence(thing);
        presence.Enter();
        clock.Finish();
        var gone = 0;
        presence.Leave(() => gone++);
        clock.Frame();
        clock.Frame(48);
        presence.Cancel();
        clock.Finish();
        Assert.Equal(0, gone);
        Assert.Equal(1, thing.Opacity);
    }

    [AvaloniaFact]
    public void A_thing_sent_away_before_it_was_drawn_goes_at_once()
    {
        using var clock = new FrameClock();
        var thing = new Border();
        var presence = new Presence(thing, thing);
        presence.Enter();
        var gone = 0;
        presence.Leave(() => gone++);
        Assert.Equal(1, gone);
        Assert.Equal(0, thing.Opacity);
        // What was waiting for a frame finds that it is not wanted.
        clock.Finish();
        Assert.Equal(0, thing.Opacity);
        Assert.Equal(1, gone);
    }

    [AvaloniaFact]
    public void A_thing_in_no_window_does_not_wait_for_frames()
    {
        var enabled = Motion.Enabled;
        Motion.Enabled = true;
        try {
            var thing = new Border();
            var presence = new Presence(thing, thing);
            presence.Enter();
            Assert.Equal(1, thing.Opacity);
            Assert.Null(thing.RenderTransform);
            var gone = 0;
            presence.Leave(() => gone++);
            Assert.Equal(0, thing.Opacity);
            Assert.Equal(1, gone);
        } finally {
            Motion.Enabled = enabled;
        }
    }

    // The frames of a window come on the timers of the dispatcher, so a test
    // that waits for them lets it run (a loop that only sleeps gets two).
    [AvaloniaFact]
    public async Task In_a_window_a_thing_comes_and_goes_on_its_frames()
    {
        var enabled = Motion.Enabled;
        Motion.Enabled = true;
        try {
            var thing = new Border {
                Width = 40,
                Height = 40
            };
            var window = new Window {
                Content = thing,
                Width = 100,
                Height = 100
            };
            window.Show();
            var presence = new Presence(thing, thing);
            presence.Enter();
            Assert.Equal(0, thing.Opacity);

            var last = 0.0;
            var frames = 0;
            for (var i = 0; i < 100 && thing.Opacity < 1; i++) {
                await Task.Delay(16, TestContext.Current.CancellationToken);
                Assert.True(thing.Opacity >= last, "it went back");
                last = thing.Opacity;
                frames++;
            }

            Assert.Equal(1, thing.Opacity);
            Assert.Null(thing.RenderTransform);
            Assert.True(frames > 1, "it came in one frame");

            var gone = 0;
            presence.Leave(() => gone++);
            for (var i = 0; i < 100 && gone == 0; i++) {
                await Task.Delay(16, TestContext.Current.CancellationToken);
                Assert.True(thing.Opacity <= last, "it came back");
                last = thing.Opacity;
            }

            Assert.Equal(1, gone);
            Assert.Equal(0, thing.Opacity);
        } finally {
            Motion.Enabled = enabled;
        }
    }
}
