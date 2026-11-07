namespace OhMatrix.Core.Ui;

/// <summary>Where a menu goes and how tall it is shown (<c>placeMenu</c> of menuPlace.ts).</summary>
public readonly record struct MenuPlace(
    double Top,
    double Height,
    bool Scrolls);

public static class MenuPlacement {
    /// <summary>The least of a menu that is shown when it has to scroll: a few rows, so that it is still a menu.</summary>
    private const double MinVisible = 120;

    /// <summary>
    /// It opens below the anchor (or above it with <paramref name="up"/>); where that side has not room for all of it, the other side is used if
    /// that has; where neither has, the roomier one is used and the menu is cut to the room and scrolls. It never goes past
    /// <paramref name="minTop"/> (below the title bar) or <paramref name="bottomLimit"/>.
    /// </summary>
    /// <param name="y">The top of the anchor.</param>
    /// <param name="height">The height of the anchor.</param>
    /// <param name="contentHeight">The height all the rows come to.</param>
    public static MenuPlace Place(
        double y,
        double height,
        double contentHeight,
        bool up,
        double minTop,
        double bottomLimit,
        double gap = 6
    )
    {
        var spaceBelow = bottomLimit - (y + height + gap);
        var spaceAbove = y - gap - minTop;
        var above = up;
        if (above ? !Fits(spaceAbove) : !Fits(spaceBelow)) {
            if (above ? Fits(spaceBelow) : Fits(spaceAbove))
                above = !above;
            else
                above = spaceAbove > spaceBelow;
        }

        var room = above ? spaceAbove : spaceBelow;
        var shown = Math.Min(contentHeight, Math.Max(room, MinVisible));
        var wanted = above ? y - gap - shown : y + height + gap;
        var top = Math.Max(minTop, Math.Min(wanted, bottomLimit - shown));
        return new MenuPlace(top, shown, shown < contentHeight);

        bool Fits(double space)
        {
            return contentHeight <= space;
        }
    }
}
