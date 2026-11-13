using Avalonia.Controls;
using Avalonia.Headless.XUnit;
using Avalonia.Media;
using OhMatrix.Core.Ui.Animations;
using Xunit;

namespace OhMatrix.Tests.Ui;

/// <summary>How a thing comes and goes: the numbers on the way, and what happens when it is turned round, brought back or stopped.</summary>
public class PresenceTests {
    // The scale and the shift a presence has put on a control.
    private static (double Scale, double X, double Y) Transform(Control control)
    {
        var group = (TransformGroup)control.RenderTransform!;
        var move = (TranslateTransform)group.Children[1];
        return (((ScaleTransform)group.Children[0]).ScaleX, move.X, move.Y);
    }

    // How far a thing has moved, from 0 (where it came from) to 1 (in place),
    // told from its scale.
    private static double Moved(Control control, double fromScale)
    {
        return (Transform(control).Scale - fromScale) / (1 - fromScale);
    }

    [AvaloniaFact]
    public void With_motion_off_it_is_in_place_at_once_and_gone_at_once()
    {
        var thing = new Border();
        var presence = new Presence(thing, thing) {
            FromY = -10
        };
        var gone = 0;
        presence.Enter();
        Assert.Equal(1, thing.Opacity);
        Assert.Null(thing.RenderTransform);
        Assert.Null(thing.CacheMode);
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
            FromY = -20
        };
        presence.Enter();
        Assert.Equal(0, thing.Opacity);
        Assert.Equal((0.9, 0, -20), Transform(thing));
        Assert.NotNull(thing.CacheMode);

        var last = 0.0;
        var took = clock.Finish(() => {
            Assert.True(thing.Opacity >= last, "it went back");
            last = thing.Opacity;
            if (thing.RenderTransform != null) {
                // The size and the place follow one number.
                var (scale, _, y) = Transform(thing);
                Assert.InRange(scale, 0.9, 1.01);
                Assert.Equal(-20 * (1 - (scale - 0.9) / 0.1), y, 9);
            }
        });
        Assert.Equal(1, thing.Opacity);
        // It is in place, and is not left with a transform or a bitmap.
        Assert.Null(thing.RenderTransform);
        Assert.Null(thing.CacheMode);
        Assert.InRange(took, 250, 800);
    }

    [AvaloniaFact]
    public void What_comes_is_whole_before_it_is_in_place()
    {
        using var clock = new FrameClock();
        var thing = new Border();
        var presence = new Presence(thing, thing) {
            FromScale = 0.5
        };
        presence.Enter();
        clock.Frame();
        double moved = 0, wholeAt = -1, ms = 0;
        while (clock.Waiting && thing.RenderTransform != null) {
            clock.Frame();
            ms += 16;
            if (wholeAt < 0 && thing.Opacity >= 0.97) {
                wholeAt = ms;
                moved = Moved(thing, 0.5);
            }
        }

        Assert.InRange(wholeAt, 80, 200);
        // It was seen whole while it was still a good way from its place.
        Assert.InRange(moved, 0.3, 0.9);
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
        // What fades is drawn once too, and the bitmap is dropped at the end.
        Assert.NotNull(thing.CacheMode);
        clock.Finish();
        Assert.Equal(1, thing.Opacity);
        Assert.Null(thing.CacheMode);
    }

    [AvaloniaFact]
    public void A_thing_that_is_not_cached_is_never_drawn_into_a_bitmap()
    {
        using var clock = new FrameClock();
        var thing = new Border();
        var presence = new Presence(thing, thing) {
            Cached = false
        };
        presence.Enter();
        clock.Frame();
        clock.Frame(48);
        Assert.Null(thing.CacheMode);
        clock.Finish();
        Assert.Null(thing.CacheMode);
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
            if (thing.Opacity > 0.01)
                Assert.Equal(0, gone);
        });
        Assert.Equal(0, thing.Opacity);
        Assert.Equal(1, gone);
        Assert.Null(thing.CacheMode);
    }

    [AvaloniaFact]
    public void What_goes_takes_less_time_than_what_comes()
    {
        using var clock = new FrameClock();
        var thing = new Border();
        var presence = new Presence(thing, thing);
        presence.Enter();
        var coming = clock.Finish();
        presence.Leave(() => {
        });
        var going = clock.Finish();
        Assert.InRange(coming, 250, 800);
        Assert.InRange(going, 90, 250);
        Assert.True(going < coming / 2, $"{going} against {coming}");
    }

    [AvaloniaFact]
    public void
        A_thing_that_goes_takes_back_only_as_much_of_the_way_as_it_is_given()
    {
        using var clock = new FrameClock();
        var thing = new Border();
        var presence = new Presence(thing, thing) {
            FromScale = 0.5,
            LeaveReach = 0.3,
        };
        presence.Enter();
        clock.Finish();
        presence.Leave(() => {
        });
        clock.Frame();
        var smallest = 1.0;
        while (clock.Waiting && thing.Opacity > 0.02) {
            clock.Frame();
            if (thing.Opacity > 0.02)
                smallest = Math.Min(smallest, Transform(thing).Scale);
        }

        // 1 - 0.3 * (1 - 0.5): it shrinks a little, and not to where it came from.
        Assert.InRange(smallest, 0.845, 0.9);
        clock.Finish();
    }

    [AvaloniaFact]
    public void A_thing_sent_away_on_its_way_in_turns_round_with_no_jump()
    {
        using var clock = new FrameClock();
        var thing = new Border();
        var presence = new Presence(thing, thing) {
            FromScale = 0.5
        };
        presence.Enter();
        clock.Frame();
        clock.Frame(16);
        var before = thing.Opacity;
        clock.Frame(16);
        var there = thing.Opacity;
        var moved = Moved(thing, 0.5);
        Assert.InRange(there, 0.2, 0.9);

        var gone = 0;
        presence.Leave(() => gone++);
        // It goes on from where it is.
        Assert.Equal(there, thing.Opacity);
        Assert.Equal(moved, Moved(thing, 0.5), 9);
        clock.Frame(16);
        // A frame later it has not jumped: it moved about as it did before.
        Assert.True(Math.Abs(thing.Opacity - there) <= (there - before) * 1.5,
            $"{before}, {there}, {thing.Opacity}");
        var seen = new List<double>();
        clock.Finish(() => seen.Add(thing.Opacity));
        Assert.Equal(seen.OrderByDescending(x => x), seen);
        Assert.Equal(0, thing.Opacity);
        Assert.Equal(1, gone);
    }

    [AvaloniaFact]
    public void A_thing_brought_back_on_its_way_out_is_not_said_to_be_gone()
    {
        using var clock = new FrameClock();
        var thing = new Border();
        var presence = new Presence(thing, thing) {
            FromScale = 0.9
        };
        presence.Enter();
        clock.Finish();
        var gone = 0;
        presence.Leave(() => gone++);
        clock.Frame();
        clock.Frame(16);
        clock.Frame(16);
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
        Assert.Null(thing.CacheMode);
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
        if (clock.Waiting)
            clock.Finish();
        Assert.Equal(0, gone);
        Assert.Equal(1, thing.Opacity);
    }

    [AvaloniaFact]
    public void
        A_thing_sent_away_before_it_was_drawn_is_gone_at_its_first_frame()
    {
        using var clock = new FrameClock();
        var thing = new Border();
        var presence = new Presence(thing, thing);
        presence.Enter();
        var gone = 0;
        presence.Leave(() => gone++);
        Assert.Equal(0, gone);
        clock.Frame();
        Assert.Equal(1, gone);
        Assert.Equal(0, thing.Opacity);
        Assert.False(clock.Waiting);
    }

    [AvaloniaFact]
    public void
        A_thing_waits_for_its_turn_and_nothing_of_it_is_seen_until_then()
    {
        using var clock = new FrameClock();
        var thing = new Border();
        var presence = new Presence(thing, thing) {
            FromScale = 0.5,
            Delay = TimeSpan.FromMilliseconds(100),
        };
        presence.Enter();
        clock.Frame();
        for (var i = 0; i < 5; i++) {
            clock.Frame();
            Assert.Equal(0, thing.Opacity);
            Assert.Equal(0.5, Transform(thing).Scale);
        }

        for (var i = 0; i < 6; i++)
            clock.Frame();
        Assert.True(thing.Opacity > 0.05, $"{thing.Opacity}");
        clock.Finish();
        Assert.Equal(1, thing.Opacity);
    }

    [AvaloniaFact]
    public void The_backdrop_dims_before_the_card_comes_and_goes_with_it()
    {
        using var clock = new FrameClock();
        var card = new Border();
        var dim = new SolidColorBrush(Colors.Black);
        var presence = Presences.Dialog(card);
        presence.Backdrop = dim;
        presence.Enter();
        Assert.Equal(0, dim.Opacity);
        Assert.Equal(0, card.Opacity);
        clock.Frame();
        clock.Frame(16);
        clock.Frame(16);
        // 32 ms on: the window has started to dim, and the card waits 40 ms.
        Assert.True(dim.Opacity > 0.1, $"{dim.Opacity}");
        Assert.Equal(0, card.Opacity);
        clock.Finish();
        Assert.Equal(1, dim.Opacity);
        Assert.Equal(1, card.Opacity);

        presence.Leave(() => {
        });
        clock.Frame();
        clock.Frame(16);
        Assert.True(dim.Opacity < 1);
        clock.Finish();
        Assert.Equal(0, dim.Opacity);
    }

    [AvaloniaFact]
    public void A_solid_thing_is_never_faded_and_goes_when_it_has_landed()
    {
        using var clock = new FrameClock();
        var picture = new Border();
        var dim = new SolidColorBrush(Colors.Black);
        var presence = new Presence(picture, picture) {
            FromScale = 0.25,
            FromX = -100,
            FromY = -50,
            Solid = true,
            Cached = false,
            LeaveFeel = new Feel(Spring.Away, Spring.Vanish),
        };
        presence.Backdrop = dim;
        presence.Enter();
        // It is whole from the first frame, since what it came from is
        // hidden: the thumbnail and the picture are one thing.
        Assert.Equal(1, picture.Opacity);
        Assert.Equal((0.25, -100, -50), Transform(picture));
        clock.Frame();
        clock.Frame(16);
        clock.Frame(16);
        Assert.Equal(1, picture.Opacity);
        Assert.InRange(Transform(picture).Scale, 0.26, 0.99);
        clock.Finish(() => Assert.Equal(1, picture.Opacity));
        Assert.Null(picture.RenderTransform);

        var gone = 0;
        presence.Leave(() => gone++);
        var smallest = 1.0;
        clock.Finish(() => {
            if (gone == 0) {
                Assert.Equal(1, picture.Opacity);
                smallest = Math.Min(smallest, Transform(picture).Scale);
            }
        });
        // It flew back to where it came from (to within a pixel or two)
        // and only then was it taken away.
        Assert.InRange(smallest, 0.25, 0.26);
        Assert.Equal(1, gone);
    }

    [AvaloniaFact]
    public void
        A_frame_that_comes_late_moves_a_motion_by_no_more_than_two_frames()
    {
        using var clock = new FrameClock();
        var thing = new Border();
        var presence = new Presence(thing);
        presence.Enter();
        clock.Frame();
        // The window was busy for half a second: what is seen is the motion
        // a frame or two on, and not its end.
        clock.Frame(500);
        Assert.InRange(thing.Opacity, 0.2, 0.7);
        clock.Finish();
        Assert.Equal(1, thing.Opacity);
    }

    [AvaloniaFact]
    public void A_slowdown_stretches_a_motion()
    {
        using var clock = new FrameClock();
        var thing = new Border();
        var presence = new Presence(thing);
        presence.Enter();
        var plain = clock.Finish();
        Motion.Slowdown = 4;
        presence.Cancel();
        presence.Enter();
        var slow = clock.Finish();
        Assert.InRange(slow / plain, 3.3, 4.7);
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
            Assert.Null(thing.CacheMode);
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
                Height = 40,
                Background = Brushes.Red,
                Child = new TextBlock {
                    Text = "Copy"
                },
            };
            var window = new Window {
                Content = thing,
                Width = 100,
                Height = 100
            };
            window.Show();
            var presence = new Presence(thing, thing) {
                FromScale = 0.5
            };
            presence.Enter();
            Assert.Equal(0, thing.Opacity);

            var last = 0.0;
            var frames = 0;
            for (var i = 0; i < 100 && thing.RenderTransform != null; i++) {
                await Task.Delay(16, TestContext.Current.CancellationToken);
                Assert.True(thing.Opacity >= last, "it went back");
                last = thing.Opacity;
                frames++;
            }

            Assert.Equal(1, thing.Opacity);
            Assert.Null(thing.RenderTransform);
            Assert.Null(thing.CacheMode);
            Assert.True(frames > 3, "it came in a frame or two");

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
