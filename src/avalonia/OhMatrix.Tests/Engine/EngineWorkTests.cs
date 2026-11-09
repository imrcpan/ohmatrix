using Microsoft.Extensions.Time.Testing;
using OhMatrix.Engine;
using Xunit;

namespace OhMatrix.Tests.Engine;

public class EngineWorkTests {
    [Fact]
    public async Task A_failed_try_is_made_again_after_a_pause_that_grows()
    {
        var clock = new FakeTimeProvider();
        var tries = 0;
        var task = Retrying.Until(() => {
                if (++tries < 4)
                    throw new InvalidOperationException("not yet");
                return Task.FromResult("done");
            }, e => e is InvalidOperationException, 30,
            TimeSpan.FromMilliseconds(100), TimeSpan.FromSeconds(1), clock);
        Assert.Equal(1, tries);
        // The pauses: 100 ms, 200 ms, 400 ms.
        clock.Advance(TimeSpan.FromMilliseconds(99));
        Assert.Equal(1, tries);
        clock.Advance(TimeSpan.FromMilliseconds(1));
        await WaitFor(() => tries == 2);
        clock.Advance(TimeSpan.FromMilliseconds(200));
        await WaitFor(() => tries == 3);
        clock.Advance(TimeSpan.FromMilliseconds(399));
        Assert.Equal(3, tries);
        Assert.False(task.IsCompleted);
        clock.Advance(TimeSpan.FromMilliseconds(1));
        Assert.Equal("done", await task);
        Assert.Equal(4, tries);
    }

    [Fact]
    public async Task The_pause_stops_growing_and_the_last_failure_is_thrown()
    {
        var clock = new FakeTimeProvider();
        var tries = 0;
        var task = Retrying.Until<int>(() => {
                tries++;
                throw new InvalidOperationException("try " + tries);
            }, e => e is InvalidOperationException, 6,
            TimeSpan.FromMilliseconds(100), TimeSpan.FromMilliseconds(300),
            clock);
        // 100, 200, 300, 300, 300, 300: then the sixth retry has failed too.
        foreach (var ms in new[] {
                     100, 200, 300, 300, 300, 300
                 }) {
            var want = tries + 1;
            clock.Advance(TimeSpan.FromMilliseconds(ms));
            await WaitFor(() => tries >= want || task.IsCompleted);
        }

        var e = await Assert.ThrowsAsync<InvalidOperationException>(() => task);
        Assert.Equal("try 7", e.Message);
        Assert.Equal(7, tries);
    }

    [Fact]
    public async Task
        A_failure_that_is_not_to_be_tried_again_is_thrown_at_once()
    {
        var clock = new FakeTimeProvider();
        var tries = 0;
        await Assert.ThrowsAsync<ArgumentException>(() => Retrying.Until<int>(
            () => {
                tries++;
                throw new ArgumentException("no");
            }, e => e is InvalidOperationException, 30,
            TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(1), clock));
        Assert.Equal(1, tries);
    }

    private static async Task WaitFor(Func<bool> condition)
    {
        for (var i = 0; i < 200 && !condition(); i++)
            await Task.Delay(10);
        Assert.True(condition());
    }
}
