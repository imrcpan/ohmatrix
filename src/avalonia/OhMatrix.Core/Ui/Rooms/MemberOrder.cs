using OhMatrix.Core.Model;

namespace OhMatrix.Core.Ui.Rooms;

/// <summary>
/// The order of the people in the chat info (<c>memberOrder.ts</c>): the most powerful first (the creator, then admins, moderators, members and
/// the levels in between), people of equal power by name.
/// </summary>
public static class MemberOrder {
    /// <summary>How many people the chat info lists before "View all".</summary>
    public const int Shown = 10;

    // A creator has no limit (no power level at all); a person with no level
    // given is as strong as their role says.
    private static int PowerOf(RoomMemberInfo m)
    {
        return m.Power ?? m.Role switch {
            MemberRole.Admin => int.MaxValue,
            MemberRole.Moderator => 50,
            _ => 0,
        };
    }

    public static int Compare(RoomMemberInfo a, RoomMemberInfo b)
    {
        var power = PowerOf(b).CompareTo(PowerOf(a));
        return power != 0
            ? power
            : string.Compare(
                a.Name.Length > 0 ? a.Name : a.UserId,
                b.Name.Length > 0 ? b.Name : b.UserId,
                StringComparison.CurrentCultureIgnoreCase);
    }

    /// <summary>The first <paramref name="count"/> of the people in that order, in one pass: a room of thousands is not sorted for the few shown.</summary>
    public static List<RoomMemberInfo> Top(IReadOnlyList<RoomMemberInfo> people,
        int count = Shown)
    {
        var top = new List<RoomMemberInfo>(count + 1);
        foreach (var m in people) {
            if (top.Count == count && Compare(m, top[count - 1]) >= 0)
                continue;
            var at = top.Count;
            while (at > 0 && Compare(m, top[at - 1]) < 0)
                at--;
            top.Insert(at, m);
            if (top.Count > count)
                top.RemoveAt(count);
        }

        return top;
    }

    /// <summary>All of them in that order (a copy: the list given is not touched).</summary>
    public static List<RoomMemberInfo> Sort(IEnumerable<RoomMemberInfo> people)
    {
        var all = people.ToList();
        all.Sort(Compare);
        return all;
    }
}
