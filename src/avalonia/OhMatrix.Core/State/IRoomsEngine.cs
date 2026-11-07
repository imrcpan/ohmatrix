using OhMatrix.Core.Model;

namespace OhMatrix.Core.State;

public enum SyncState {
    Stopped,
    Connecting,
    Syncing,
    Error,
}

/// <summary>The part of an engine that follows the chat list (<c>sync</c> and <c>rooms</c> of the TypeScript core). Events come on any thread.</summary>
public interface IRoomsEngine {
    /// <summary>The whole list, in no particular order, each time something in it changes.</summary>
    event Action<IReadOnlyList<RoomSummary>>? RoomsChanged;

    event Action<SyncState>? SyncChanged;

    /// <summary>Joins a room by its id or alias (<c>#room:server</c>) and gives its id.</summary>
    Task<string> JoinRoom(string idOrAlias);

    /// <summary>
    /// Makes a room and gives its id. A direct one is a one-to-one chat with <paramref name="invite"/>[0]; a group has a name and may invite people.
    /// </summary>
    Task<string> CreateRoom(string? name, bool direct, IReadOnlyList<string> invite);

    Task AcceptInvite(string roomId);
    Task DeclineInvite(string roomId);
    Task SetPinned(string roomId, bool pinned);
    Task SetMuted(string roomId, bool muted);
    Task SetMarkedUnread(string roomId, bool unread);

    /// <summary>Marks everything in the room as read, and removes the unread mark.</summary>
    Task MarkRoomRead(string roomId);

    /// <summary>The topic and the people of a room.</summary>
    Task<RoomDetails> Details(string roomId);

    Task SetRoomName(string roomId, string name);
    Task SetRoomTopic(string roomId, string topic);

    /// <summary>Sets the picture of the room from the bytes of an image file.</summary>
    Task SetRoomAvatar(string roomId, string mimeType, byte[] data);

    /// <summary>The public rooms of a server's directory (the homeserver's own when <paramref name="server"/> is null) that match the text.</summary>
    Task<IReadOnlyList<PublicRoom>> SearchPublicRooms(string filter, string? server);

    /// <summary>The rooms and spaces a space lists, joined or not (the first pages of it).</summary>
    Task<IReadOnlyList<SpaceChild>> SpaceChildren(string spaceId);

    /// <summary>Leaves the room; it goes from the chat list.</summary>
    Task LeaveRoom(string roomId);

    /// <summary>Ignores a person: their messages and invitations no longer reach me.</summary>
    Task BlockUser(string userId);

    /// <summary>People of the user directory whose name or id matches the text.</summary>
    Task<IReadOnlyList<PersonInfo>> SearchPeople(string term);

    Task InviteToRoom(string roomId, IReadOnlyList<string> userIds);

    /// <summary>Gives a person a role in the room (admin 100, moderator 50, member 0).</summary>
    Task SetMemberRole(string roomId, string userId, MemberRole role);

    /// <summary>Removes a person from the room.</summary>
    Task RemoveMember(string roomId, string userId);

    Task BanMember(string roomId, string userId, string? reason);

    Task StartSync();
    Task StopSync();
}
