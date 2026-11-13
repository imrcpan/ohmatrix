using Avalonia.Controls;

namespace OhMatrix.Core.Ui.Animations;

/// <summary>
/// The ways things come and go in the app, each made for what it is: a dialog, a menu, a notice, a viewer, a reaction. The numbers are here and
/// nowhere else, so that the whole app moves in one way and is tuned in one place. What comes is slower than what goes, it is whole before it is
/// in place, and it comes from where it was called: a menu from the corner at its anchor, a dialog from a little above, a notice from the top
/// edge of the window, a picture from where it was in the chat.
/// </summary>
public static class Presences {
    private static readonly Feel Comes = new(Spring.Settle, Spring.Fade,
        Spring.Dim);

    private static readonly Feel Goes = new(Spring.Away, Spring.Vanish);

    /// <summary>A small thing that pops: a reaction in the bar of a message. It overshoots its size by a tenth and settles.</summary>
    public static Presence Pop(Control item)
    {
        return new Presence(item, item) {
            FromScale = 0.15,
            EnterFeel = new Feel(Spring.Pop, Spring.Fade),
        };
    }

    /// <summary>
    /// A dialog: the window dims first, and the card follows 40 ms later, comes down 18 px from above and grows from 94% of its size. It goes
    /// with a little of that back again. Set <see cref="Presence.Backdrop"/> to the brush that dims the window.
    /// </summary>
    public static Presence Dialog(Control card)
    {
        return new Presence(card, card) {
            FromScale = 0.94,
            FromY = -18,
            Delay = TimeSpan.FromMilliseconds(40),
            EnterFeel = Comes,
            LeaveFeel = Goes,
            LeaveReach = 0.35,
        };
    }

    /// <summary>
    /// A menu or a panel that opens from a corner (set <see cref="Presence.Origin"/> to it): it grows from just over half its size, and is
    /// whole before it is half way. It goes with a small shrink.
    /// </summary>
    public static Presence Popup(Control surface)
    {
        return new Presence(surface, surface) {
            FromScale = 0.55,
            EnterFeel = new Feel(Spring.Settle, Spring.Fade),
            LeaveFeel = Goes,
            LeaveReach = 0.3,
        };
    }

    /// <summary>A notice at the top of the window: it comes down from above the edge of the window, with a small bounce, and goes up again.</summary>
    public static Presence Banner(Control notice)
    {
        return new Presence(notice, notice) {
            FromScale = 0.92,
            FromY = -56,
            EnterFeel = new Feel(Spring.Bounce, Spring.Fade),
            LeaveFeel = Goes,
        };
    }

    /// <summary>
    /// What is shown over the window, a picture or a video: the backdrop dims (set <see cref="Presence.Backdrop"/>), and the content comes from
    /// 94% of its size, or from where <see cref="Presence.FromScale"/>, <see cref="Presence.FromX"/> and <see cref="Presence.FromY"/> put it.
    /// A picture is a bitmap already, so it is not cached.
    /// </summary>
    public static Presence Cover(Control content)
    {
        return new Presence(content, content) {
            FromScale = 0.94,
            EnterFeel = Comes,
            LeaveFeel = Goes,
            Cached = false,
        };
    }

    /// <summary>What is on a viewer besides the picture (its buttons and its title): it fades in a little after the picture has started to come.</summary>
    public static Presence Controls(Control controls)
    {
        return new Presence(controls) {
            Delay = TimeSpan.FromMilliseconds(80),
            EnterFeel = new Feel(Spring.Settle, Spring.Fade),
            LeaveFeel = Goes,
            Cached = false,
        };
    }
}
