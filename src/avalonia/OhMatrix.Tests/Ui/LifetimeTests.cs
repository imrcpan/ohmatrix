using Avalonia.Controls;
using Avalonia.Headless.XUnit;
using OhMatrix.Core.Ui;
using Xunit;

namespace OhMatrix.Tests.Ui;

public class LifetimeTests {
    [AvaloniaFact]
    public void
        Releasing_runs_what_was_hooked_once_for_the_owner_its_own_and_the_tree()
    {
        var calls = new List<string>();
        var owner = new Border();
        var inner = new StackPanel();
        var below = new Border();
        var held = new Border();
        owner.Child = inner;
        inner.Children.Add(below);
        Lifetime.OnRelease(owner, () => calls.Add("owner"));
        Lifetime.OnRelease(below, () => calls.Add("below"));
        Lifetime.OnRelease(held, () => calls.Add("held"));
        // Held in a field and not shown: it goes with the owner by being owned.
        Lifetime.Own(owner, held);

        Lifetime.Release(owner);
        Assert.Equal(["owner", "held", "below"], calls);

        // Again, and for nothing at all: nothing more happens.
        Lifetime.Release(owner);
        Lifetime.Release(null);
        Assert.Equal(3, calls.Count);
    }
}
