using OhMatrix.Core.Ui.Animations;
using Xunit;

namespace OhMatrix.Tests.Ui;

/// <summary>The springs of <c>Ui/Animations</c>: the number that follows one, and the presets the app moves with.</summary>
public class SpringTests {
    // The times, in ms, at which a spring sent from 0 to 1 is first at each of
    // the parts, and the most it goes past 1.
    private static (double At50, double At90, double At97, double Gone, double
        Past)
        Run(Spring spring)
    {
        var value = new SpringValue(0);
        value.To(1, spring, 0);
        double at50 = -1, at90 = -1, at97 = -1, gone = -1, past = 0;
        for (var i = 1; i <= 2400; i++) {
            var t = i / 1000.0;
            value.Step(t);
            if (at50 < 0 && value.Value >= 0.5)
                at50 = i;
            if (at90 < 0 && value.Value >= 0.9)
                at90 = i;
            if (at97 < 0 && value.Value >= 0.97)
                at97 = i;
            if (gone < 0 && value.Value >= 0.99)
                gone = i;
            past = Math.Max(past, value.Value - 1);
        }

        return (at50, at90, at97, gone, past);
    }

    [Fact]
    public void A_spring_starts_from_rest_and_comes_to_rest_where_it_is_sent()
    {
        foreach (var spring in new[] {
                     Spring.Settle, Spring.Bounce, Spring.Pop, Spring.Away,
                     Spring.Fade, Spring.Vanish, Spring.Dim
                 }) {
            var value = new SpringValue(0);
            value.To(1, spring, 0);
            Assert.True(value.Moving);
            // The first frame of 60 a second has hardly moved: it starts
            // from rest, as a switch does not (the quickest of them, the one
            // that fades what goes, has moved a fifth).
            value.Step(1 / 60.0);
            Assert.InRange(value.Value, 0, 0.25);
            var t = 1 / 60.0;
            while (value.Moving && t < 3)
                value.Step(t += 1 / 60.0);
            Assert.False(value.Moving);
            Assert.Equal(1, value.Value);
            Assert.Equal(0, value.Speed);
        }
    }

    [Fact]
    public void What_moves_things_has_hardly_moved_in_its_first_frame()
    {
        foreach (var spring in new[] {
                     Spring.Settle, Spring.Bounce, Spring.Pop
                 }) {
            var value = new SpringValue(0);
            value.To(1, spring, 0);
            value.Step(1 / 60.0);
            Assert.InRange(value.Value, 0, 0.08);
        }
    }

    [Fact]
    public void The_presets_are_as_quick_as_their_notes_say()
    {
        var settle = Run(Spring.Settle);
        Assert.InRange(settle.At50, 70, 100);
        Assert.InRange(settle.At90, 150, 190);
        var away = Run(Spring.Away);
        Assert.InRange(away.At90, 95, 125);
        var fade = Run(Spring.Fade);
        Assert.InRange(fade.At97, 115, 150);
        var vanish = Run(Spring.Vanish);
        Assert.InRange(vanish.At90, 60, 90);
        Assert.InRange(vanish.Gone, 100, 150);
        var dim = Run(Spring.Dim);
        Assert.InRange(dim.At97, 170, 210);
        // What goes is quicker than what comes, and the opacity of what comes
        // is quicker than what moves.
        Assert.True(away.At90 < settle.At90);
        Assert.True(fade.At97 < settle.At90);
        Assert.True(vanish.At90 < away.At90);
    }

    [Fact]
    public void A_spring_goes_past_its_place_by_what_its_damping_says()
    {
        foreach (var spring in new[] {
                     Spring.Away, Spring.Fade, Spring.Vanish, Spring.Dim
                 })
            Assert.True(Run(spring).Past < 1e-9, $"{spring}");
        Assert.InRange(Run(Spring.Settle).Past, 0.003, 0.01);
        Assert.InRange(Run(Spring.Bounce).Past, 0.04, 0.052);
        Assert.InRange(Run(Spring.Pop).Past, 0.11, 0.14);
    }

    [Fact]
    public void Where_it_is_at_a_time_does_not_depend_on_the_frames_there_were()
    {
        var often = new SpringValue(0);
        var once = new SpringValue(0);
        often.To(1, Spring.Bounce, 0);
        once.To(1, Spring.Bounce, 0);
        for (var i = 1; i <= 200; i++)
            often.Step(i / 1000.0);
        once.Step(0.2);
        Assert.Equal(once.Value, often.Value, 12);
        Assert.Equal(once.Speed, often.Speed, 9);
    }

    [Fact]
    public void
        Sent_somewhere_else_on_its_way_it_goes_on_from_the_speed_it_has()
    {
        var value = new SpringValue(0);
        value.To(1, Spring.Settle, 0);
        value.Step(0.1);
        var place = value.Value;
        var speed = value.Speed;
        Assert.True(speed > 1, $"{speed}");

        value.To(0, Spring.Away, 0.1);
        // Nothing jumps when it is turned round, neither where it is nor
        // how fast.
        Assert.Equal(place, value.Value);
        Assert.Equal(speed, value.Speed);
        value.Step(0.1);
        Assert.Equal(place, value.Value, 9);
        Assert.Equal(speed, value.Speed, 6);
        // It was going up, so it goes on a little before it comes back, as
        // a thing that is thrown back does.
        value.Step(0.105);
        Assert.True(value.Value > place, $"{value.Value} after {place}");
        for (var t = 0.11; value.Moving && t < 2; t += 0.001)
            value.Step(t);
        Assert.Equal(0, value.Value);
    }

    [Fact]
    public void A_spring_that_waits_holds_still_and_starts_from_rest()
    {
        var value = new SpringValue(0);
        value.To(1, Spring.Settle, 0);
        value.Step(0.1);
        Assert.True(value.Speed > 1);
        value.To(0, Spring.Settle, 0.1, 0.2);
        Assert.Equal(0, value.Speed);
        var held = value.Value;
        value.Step(0.2);
        Assert.Equal(held, value.Value);
        Assert.True(value.Moving);
        value.Step(0.4);
        Assert.True(value.Value < held);
    }

    [Fact]
    public void Rest_puts_it_where_it_is_given_and_still()
    {
        var value = new SpringValue(0);
        value.To(1, Spring.Pop, 0);
        value.Step(0.05);
        value.Rest(0.5);
        Assert.False(value.Moving);
        Assert.Equal(0.5, value.Value);
        Assert.Equal(0, value.Speed);
        value.Step(1);
        Assert.Equal(0.5, value.Value);
    }
}
