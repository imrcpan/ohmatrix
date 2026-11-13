namespace OhMatrix.Core.Ui.Animations;

/// <summary>
/// How long things take, in milliseconds. The bigger what moves, the longer it takes; and what goes takes one step less than what comes, because
/// a person waits for what comes and is done with what goes. Nothing is longer than a third of a second: past that the interface feels slow.
/// </summary>
public static class Durations {
    /// <summary>The answer of a thing to a finger or a pointer: a press, a tint under the pointer; and a menu that is going.</summary>
    public const int Fast = 100;

    /// <summary>A small surface that comes (a menu) and a big one that goes (a dialog, a viewer).</summary>
    public const int Normal = 160;

    /// <summary>A big surface that comes: a dialog, a viewer, the notice at the top.</summary>
    public const int Slow = 240;
}
