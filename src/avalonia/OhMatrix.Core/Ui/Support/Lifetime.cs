using System.Runtime.CompilerServices;
using Avalonia.Controls;
using Avalonia.LogicalTree;
using OhMatrix.Core.State;

namespace OhMatrix.Core.Ui.Support;

/// <summary>
/// What a page hooks onto things that outlive it (the store of the account, the log, timers) and how it lets go when it is thrown away. An
/// account's controller lives as long as the app, so a page that was replaced (the account was switched, the user signed out) and did not let
/// go stayed alive with everything it held, and went on drawing for nobody.
/// </summary>
public static class Lifetime {
    /// <summary>Owns each of <paramref name="children"/>: see <see cref="Own(object, object?)"/>.</summary>
    public static void OwnAll(object owner, params object?[] children)
    {
        foreach (var child in children)
            Own(owner, child);
    }

    private static readonly ConditionalWeakTable<object, List<Action>>
        Cleanups =
            new();

    private static readonly ConditionalWeakTable<object, List<object>> Owned =
        new();

    // What has been released: what it comes to own afterwards (a dialog
    // made on first use by a late answer) is released at once.
    private static readonly ConditionalWeakTable<object, object> Gone = new();

    /// <summary>Calls <paramref name="handler"/> for each change of the store of <paramref name="controller"/> until <paramref name="owner"/> is released.</summary>
    public static void Watch(object owner, AppController controller,
        Action<AppState> handler)
    {
        var store = controller.Store;
        store.Changed += handler;
        OnRelease(owner, () => store.Changed -= handler);
    }

    /// <summary>Stops the timer when <paramref name="owner"/> is released.</summary>
    public static void Stop(object owner,
        Avalonia.Threading.DispatcherTimer timer)
    {
        OnRelease(owner, timer.Stop);
    }

    /// <summary>Runs <paramref name="cleanup"/> when <paramref name="owner"/> is released.</summary>
    public static void OnRelease(object owner, Action cleanup)
    {
        lock (Cleanups)
            Cleanups.GetOrCreateValue(owner).Add(cleanup);
    }

    /// <summary>Makes <paramref name="child"/> go with <paramref name="owner"/>: it is released when the owner is. For what the owner holds but may not show (a page in a field, made on first use).</summary>
    public static void Own(object owner, object? child)
    {
        if (child == null)
            return;
        if (Gone.TryGetValue(owner, out _)) {
            Release(child);
            return;
        }

        lock (Owned)
            Owned.GetOrCreateValue(owner).Add(child);
    }

    /// <summary>Replaces a child the owner held: it is let go of and no longer held, so it can be collected while the owner lives on.</summary>
    public static void Drop(object owner, object? child)
    {
        if (child == null)
            return;
        lock (Owned) {
            if (Owned.TryGetValue(owner, out var list))
                list.Remove(child);
        }

        Release(child);
    }

    /// <summary>Lets go of everything <paramref name="root"/>, what it owns and what is below it in the tree hooked onto outside. Calling it again does nothing.</summary>
    public static void Release(object? root)
    {
        if (root == null)
            return;
        Gone.AddOrUpdate(root, root);
        List<Action>? cleanups = null;
        List<object>? owned = null;
        lock (Cleanups) {
            if (Cleanups.TryGetValue(root, out var found)) {
                cleanups = [.. found];
                found.Clear();
            }
        }

        lock (Owned) {
            if (Owned.TryGetValue(root, out var found)) {
                owned = [.. found];
                found.Clear();
            }
        }

        // A dialog or a menu hangs on the overlay of the window and not on
        // the page, so the tree does not reach it: it is closed here.
        if (root is IOverlay overlay)
            overlay.Retire();
        if (cleanups != null)
            foreach (var cleanup in cleanups)
                cleanup();
        if (owned != null)
            foreach (var child in owned)
                Release(child);
        if (root is Control control)
            foreach (var child in control.GetLogicalChildren().ToList())
                Release(child);
    }
}
