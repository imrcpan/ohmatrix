#if OHMATRIX_NATIVE_SDK
using OhMatrix.Core.Model;
using OhMatrix.Core.State;
using OhMatrix.Engine;
using Xunit;

namespace OhMatrix.Tests.Engine;

// Against a real homeserver: set OHMATRIX_TEST_HOMESERVER (a test server with the user test / 123456, open registration with no steps).
public class MatrixAuthEngineTests {
    private static string Server()
    {
        var url = Environment.GetEnvironmentVariable("OHMATRIX_TEST_HOMESERVER");
        Assert.SkipWhen(string.IsNullOrEmpty(url), "OHMATRIX_TEST_HOMESERVER is not set");
        return url!;
    }

    private static string Data()
    {
        return Path.Combine(Path.GetTempPath(), "ohm-engine-" + Guid.NewGuid().ToString("N"));
    }

    [Fact]
    public async Task Signs_in_restores_and_signs_out()
    {
        var server = Server();
        var dir = Data();
        var engine = new MatrixAuthEngine(dir);
        var session = await engine.LoginWithPassword(server, "test", "123456");
        Assert.StartsWith("@test:", session.UserId);
        Assert.NotNull(engine.Client);

        var again = new MatrixAuthEngine(dir);
        await again.Restore(session);
        Assert.Equal(session.UserId, again.Client!.UserId());
        await again.Logout();
        Assert.Null(again.Client);
    }

    [Fact]
    public async Task A_wrong_password_is_forbidden()
    {
        var engine = new MatrixAuthEngine(Data());
        var e = await Assert.ThrowsAsync<EngineException>(() =>
            engine.LoginWithPassword(Server(), "test", "wrong")
        );
        Assert.Equal(EngineErrorCode.Forbidden, e.Code);
    }

    [Fact]
    public async Task An_unreachable_server_is_a_network_error()
    {
        var engine = new MatrixAuthEngine(Data());
        var e = await Assert.ThrowsAsync<EngineException>(() =>
            engine.LoginWithPassword("http://127.0.0.1:1", "test", "123456")
        );
        Assert.Equal(EngineErrorCode.Network, e.Code);
    }

    [Fact]
    public async Task Registers_a_new_account_and_a_taken_name_conflicts()
    {
        var server = Server();
        var name = "u" + Guid.NewGuid().ToString("N")[..12];
        var session =
            await new MatrixAuthEngine(Data()).Register(server, name, "pw-12345678", null);
        Assert.StartsWith("@" + name + ":", session.UserId);
        var e = await Assert.ThrowsAsync<EngineException>(() =>
            new MatrixAuthEngine(Data()).Register(server, name, "pw-12345678", null)
        );
        Assert.Equal(EngineErrorCode.Conflict, e.Code);
    }
}

public class MatrixRoomsEngineTests {
    [Fact]
    public async Task Syncs_and_lists_the_rooms()
    {
        var server = Environment.GetEnvironmentVariable("OHMATRIX_TEST_HOMESERVER");
        Assert.SkipWhen(string.IsNullOrEmpty(server), "OHMATRIX_TEST_HOMESERVER is not set");
        var auth = new MatrixAuthEngine(
            Path.Combine(Path.GetTempPath(), "ohm-rooms-" + Guid.NewGuid().ToString("N"))
        );
        await auth.LoginWithPassword(server!, "test", "123456");
        var rooms = new MatrixRoomsEngine(auth);
        var syncing = new TaskCompletionSource();
        var listed = new TaskCompletionSource<IReadOnlyList<RoomSummary>>();
        rooms.SyncChanged += s => {
            if (s == SyncState.Syncing)
                syncing.TrySetResult();
        };
        rooms.RoomsChanged += list => listed.TrySetResult(list);
        var name = "Room " + Guid.NewGuid().ToString("N")[..8];
        var found = new TaskCompletionSource<RoomSummary>();
        rooms.RoomsChanged += list => {
            if (list.FirstOrDefault(r => r.Name == name && r.LastActivityTs > 0) is { } room)
                found.TrySetResult(room);
        };
        await rooms.StartSync();
        Assert.Same(syncing.Task, await Task.WhenAny(syncing.Task, Task.Delay(30000)));
        await auth.Client!.CreateRoom(
            new uniffi.matrix_sdk_ffi.CreateRoomParameters(
                name,
                false,
                new uniffi.matrix_sdk_ffi.RoomVisibility.Private(),
                uniffi.matrix_sdk_ffi.RoomPreset.PrivateChat
            )
        );
        Assert.Same(found.Task, await Task.WhenAny(found.Task, Task.Delay(30000)));
        Assert.False(found.Task.Result.Invite);
        Assert.True(found.Task.Result.LastActivityTs > 0);

        var id = found.Task.Result.Id;
        var changed = new TaskCompletionSource();
        rooms.RoomsChanged += list => {
            if (list.FirstOrDefault(r => r.Id == id) is { Pinned: true, Muted: true })
                changed.TrySetResult();
        };
        await rooms.SetPinned(id, true);
        await rooms.SetMuted(id, true);
        Assert.Same(changed.Task, await Task.WhenAny(changed.Task, Task.Delay(30000)));
        await rooms.StopSync();
        await auth.Logout();
    }
}

public class MatrixChatEngineTests {
    [Fact]
    public async Task Sends_a_message_and_reads_it_back()
    {
        var server = Environment.GetEnvironmentVariable("OHMATRIX_TEST_HOMESERVER");
        Assert.SkipWhen(string.IsNullOrEmpty(server), "OHMATRIX_TEST_HOMESERVER is not set");
        var auth = new MatrixAuthEngine(
            Path.Combine(Path.GetTempPath(), "ohm-chat-" + Guid.NewGuid().ToString("N"))
        );
        await auth.LoginWithPassword(server!, "test", "123456");
        var rooms = new MatrixRoomsEngine(auth);
        await rooms.StartSync();
        var roomId = await auth.Client!.CreateRoom(
            new uniffi.matrix_sdk_ffi.CreateRoomParameters(
                "Chat " + Guid.NewGuid().ToString("N")[..8],
                false,
                new uniffi.matrix_sdk_ffi.RoomVisibility.Private(),
                uniffi.matrix_sdk_ffi.RoomPreset.PrivateChat
            )
        );
        var chat = await new MatrixChatEngine(auth).Open(roomId);
        var text = "hello " + Guid.NewGuid().ToString("N")[..6];
        var seen = new TaskCompletionSource<TimelineItem>();
        chat.Changed += items => {
            if (items.FirstOrDefault(i => i.Body == text && !i.Sending) is { } m)
                seen.TrySetResult(m);
        };
        await chat.Send(text);
        Assert.Same(seen.Task, await Task.WhenAny(seen.Task, Task.Delay(30000)));
        Assert.True(seen.Task.Result.IsOwn);
        Assert.Contains(chat.Items, i => i.Kind == TimelineKind.Date);

        var id = seen.Task.Result.Id;
        var edited = new TaskCompletionSource();
        chat.Changed += items => {
            if (items.Any(i => i.Id == id && i.Edited && i.Body == "changed " + text))
                edited.TrySetResult();
        };
        await chat.Edit(id, "changed " + text);
        await Task.WhenAny(edited.Task, Task.Delay(30000));
        Assert.True(
            edited.Task.IsCompleted,
            "edit not seen: " + string.Join(" | ", chat.Items.Select(i => $"{i.Id}:{i.Body}:{i.Edited}"))
        );

        var gone = new TaskCompletionSource();
        chat.Changed += items => {
            if (items.All(i => i.Body != "changed " + text))
                gone.TrySetResult();
        };
        await chat.Delete(id);
        await Task.WhenAny(gone.Task, Task.Delay(30000));
        Assert.True(
            gone.Task.IsCompleted,
            "delete not seen: " + string.Join(" | ", chat.Items.Select(i => $"{i.Id}:{i.Body}:{i.Edited}"))
        );
        chat.Dispose();
        await rooms.StopSync();
        await auth.Logout();
    }
}
#endif
