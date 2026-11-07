#if OHMATRIX_NATIVE_SDK
using OhMatrix.Core.Model;
using uniffi.matrix_sdk_ffi;

namespace OhMatrix.Engine;

/// <summary>The lines of the events that are not messages, from the content the SDK gives.</summary>
public static class ServiceLines {
    /// <summary>The line for an event that is not a message, or null when the chat does not show it.</summary>
    public static string? For(TimelineItemContent content, string by)
    {
        switch (content) {
            case TimelineItemContent.RoomMembership m:
                return ServiceText.ForMembership(
                    m.Change switch {
                        MembershipChange.Joined
                            or MembershipChange.InvitationAccepted =>
                            MembershipKind.Joined,
                        MembershipChange.Left => MembershipKind.Left,
                        MembershipChange.Kicked
                            or MembershipChange.KickedAndBanned =>
                            MembershipKind.Kicked,
                        MembershipChange.Invited => MembershipKind.Invited,
                        _ => MembershipKind.None,
                    },
                    ServiceText.PersonName(m.UserDisplayName, m.UserId),
                    by
                );
            case TimelineItemContent.State { Content: OtherState.RoomCreate }:
                return ServiceText.ForState("RoomCreate", null, by);
            case TimelineItemContent.State { Content: OtherState.RoomName n }:
                return ServiceText.ForState("RoomName", n.Name, by);
            case TimelineItemContent.State { Content: OtherState.RoomTopic }:
                return ServiceText.ForState("RoomTopic", null, by);
            default:
                return null;
        }
    }
}
#endif
