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
        await rooms.StopSync();
        await auth.Logout();
    }
}
#endif
