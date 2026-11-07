namespace OhMatrix.Core.Ui;

/// <summary>The widths of the panes (<c>layout.ts</c>).</summary>
public static class Layout {
    public const double SidebarMin = 260;
    public const double SidebarMax = 520;

    /// <summary>
    /// The narrow strip with only the pictures: the width of a chat row's picture (44) with the room on each side of it that the rows of the full list
    /// have (6 outside the row, 8 inside), so a picture stands in the strip as it stands in the list.
    /// </summary>
    public const double SidebarRail = 72;

    /// <summary>Dragged narrower than this the list is the strip; wider, it is a list (at least <see cref="SidebarMin"/>). Nothing in between: the width jumps.</summary>
    public static readonly double SidebarSnap = Math.Round((SidebarRail + SidebarMin) / 2);

    /// <summary>Keeps the chat list usable and leaves at least half the window for the conversation. Below the snap width it is the strip.</summary>
    public static double ClampSidebar(double width, double windowWidth)
    {
        if (width < SidebarSnap)
            return SidebarRail;
        var max = Math.Max(SidebarMin, Math.Min(SidebarMax, Math.Floor(windowWidth / 2)));
        return Math.Round(Math.Min(max, Math.Max(SidebarMin, width)));
    }

    /// <summary>The width when the divider has not been dragged: 30% of the window.</summary>
    public static double AutoSidebar(double windowWidth)
    {
        return ClampSidebar(Math.Round(windowWidth * 0.3), windowWidth);
    }

    /// <summary>The width of the chat info beside the chat (docked), and of the same panel when it floats over the chat.</summary>
    public const double InfoDock = 340;

    public const double InfoFloat = 400;

    /// <summary>Whether a width is the strip with only the pictures.</summary>
    public static bool IsRail(double width)
    {
        return width <= SidebarRail;
    }
}
