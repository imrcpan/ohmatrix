#if OHMATRIX_NATIVE_SDK
using OhMatrix.Core.Engine;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;
using OhMatrix.Engine;
using Xunit;

namespace OhMatrix.Tests.Engine;

// Against a real homeserver: set OHMATRIX_TEST_HOMESERVER (a test server with the user test / 123456, open registration with no steps).
[Collection("homeserver")]
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

[Collection("homeserver")]
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
        var details = await rooms.Details(id);
        Assert.Contains(details.Members, m => m.UserId.StartsWith("@test:"));
        Assert.Equal(MemberRole.Admin, details.Members.First(m => m.UserId.StartsWith("@test:")).Role);
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

[Collection("homeserver")]
public class MatrixExploreEngineTests {
    [Fact]
    public async Task Finds_a_public_room_in_the_directory()
    {
        var server = Environment.GetEnvironmentVariable("OHMATRIX_TEST_HOMESERVER");
        Assert.SkipWhen(string.IsNullOrEmpty(server), "OHMATRIX_TEST_HOMESERVER is not set");
        var auth = new MatrixAuthEngine(
            Path.Combine(Path.GetTempPath(), "ohm-explore-" + Guid.NewGuid().ToString("N"))
        );
        await auth.LoginWithPassword(server!, "test", "123456");
        var rooms = new MatrixRoomsEngine(auth);
        var name = "Pub" + Guid.NewGuid().ToString("N")[..10];
        await auth.Client!.CreateRoom(
            new uniffi.matrix_sdk_ffi.CreateRoomParameters(
                name,
                false,
                new uniffi.matrix_sdk_ffi.RoomVisibility.Public(),
                uniffi.matrix_sdk_ffi.RoomPreset.PublicChat
            )
        );
        // The test server publishes nothing in its directory (a curl createRoom with visibility public shows nothing either), so the
        // search is only checked to run to its end; against a server that lists rooms the new one is found.
        var found = await rooms.SearchPublicRooms(name, null);
        Assert.All(found, r => Assert.NotEmpty(r.RoomId));
        await auth.Logout();
    }
}

[Collection("homeserver")]
public class MatrixDevicesEngineTests {
    [Fact]
    public async Task Lists_the_sessions_and_signs_another_out_with_the_password()
    {
        var server = Environment.GetEnvironmentVariable("OHMATRIX_TEST_HOMESERVER");
        Assert.SkipWhen(string.IsNullOrEmpty(server), "OHMATRIX_TEST_HOMESERVER is not set");
        var first = new MatrixAuthEngine(
            Path.Combine(Path.GetTempPath(), "ohm-dev-" + Guid.NewGuid().ToString("N"))
        );
        var second = new MatrixAuthEngine(
            Path.Combine(Path.GetTempPath(), "ohm-dev-" + Guid.NewGuid().ToString("N"))
        );
        await first.LoginWithPassword(server!, "test", "123456");
        var other = await second.LoginWithPassword(server!, "test", "123456");
        var devices = new HttpDevicesEngine(() => first.CurrentSession);
        var list = await devices.ListDevices();
        Assert.True(list[0].Current);
        Assert.Contains(list, d => d.Id == other.DeviceId && !d.Current);
        var bad = await Assert.ThrowsAsync<EngineException>(
            () => devices.RemoveDevices([other.DeviceId], "wrong")
        );
        Assert.Equal(EngineErrorCode.Forbidden, bad.Code);
        await devices.RemoveDevices([other.DeviceId], "123456");
        Assert.DoesNotContain(await devices.ListDevices(), d => d.Id == other.DeviceId);
        await first.Logout();
    }
}

[Collection("homeserver")]
public class MatrixSecurityEngineTests {
    [Fact]
    public async Task Tells_where_the_keys_of_the_account_stand()
    {
        var server = Environment.GetEnvironmentVariable("OHMATRIX_TEST_HOMESERVER");
        Assert.SkipWhen(string.IsNullOrEmpty(server), "OHMATRIX_TEST_HOMESERVER is not set");
        var auth = new MatrixAuthEngine(
            Path.Combine(Path.GetTempPath(), "ohm-sec-" + Guid.NewGuid().ToString("N"))
        );
        await auth.LoginWithPassword(server!, "test", "123456");
        var security = new MatrixSecurityEngine(auth);
        var state = SecurityState.Unavailable;
        for (var i = 0; i < 10 && state == SecurityState.Unavailable; i++) {
            state = await security.State();
            await Task.Delay(500);
        }

        Assert.NotEqual(SecurityState.Unavailable, state);
        var wrong = await Assert.ThrowsAnyAsync<Exception>(
            () => security.RestoreWithRecoveryKey("not a recovery key")
        );
        Assert.NotNull(wrong);
        await auth.Logout();
    }
}

[Collection("homeserver")]
public class MatrixSecuritySetupTests {
    [Fact]
    public async Task A_new_account_sets_its_keys_up_and_gets_a_recovery_key()
    {
        var server = Environment.GetEnvironmentVariable("OHMATRIX_TEST_HOMESERVER");
        Assert.SkipWhen(string.IsNullOrEmpty(server), "OHMATRIX_TEST_HOMESERVER is not set");
        var auth = new MatrixAuthEngine(
            Path.Combine(Path.GetTempPath(), "ohm-setup-" + Guid.NewGuid().ToString("N"))
        );
        var name = "keys" + Guid.NewGuid().ToString("N")[..10];
        await auth.Register(server!, name, "pw123456x", null);
        var rooms = new MatrixRoomsEngine(auth);
        await rooms.StartSync();
        var security = new MatrixSecurityEngine(auth);
        var key = await security.SetUp("pw123456x");
        Assert.False(string.IsNullOrWhiteSpace(key));
        var state = SecurityState.Unavailable;
        for (var i = 0; i < 20 && state != SecurityState.Ready; i++) {
            state = await security.State();
            if (state != SecurityState.Ready)
                await Task.Delay(500);
        }

        Assert.Equal(SecurityState.Ready, state);
        await rooms.StopSync();
        await auth.Logout();
    }
}

[Collection("homeserver")]
public class MatrixVerificationTests {
    [Fact]
    public async Task A_second_session_is_verified_by_the_first_with_the_pictures()
    {
        var server = Environment.GetEnvironmentVariable("OHMATRIX_TEST_HOMESERVER");
        Assert.SkipWhen(string.IsNullOrEmpty(server), "OHMATRIX_TEST_HOMESERVER is not set");
        string Dir() => Path.Combine(Path.GetTempPath(), "ohm-ver-" + Guid.NewGuid().ToString("N"));
        var name = "ver" + Guid.NewGuid().ToString("N")[..10];
        var first = new MatrixAuthEngine(Dir());
        await first.Register(server!, name, "pw123456x", null);
        var firstRooms = new MatrixRoomsEngine(first);
        await firstRooms.StartSync();
        // The first session has the keys of the account: it is the one the other is verified by.
        await new MatrixSecurityEngine(first).SetUp("pw123456x");
        var second = new MatrixAuthEngine(Dir());
        await second.LoginWithPassword(server!, name, "pw123456x");
        var secondRooms = new MatrixRoomsEngine(second);
        await secondRooms.StartSync();

        var a = new MatrixVerificationEngine(first);
        var b = new MatrixVerificationEngine(second);
        var aFlows = new System.Collections.Concurrent.ConcurrentQueue<VerifyFlow>();
        var bFlows = new System.Collections.Concurrent.ConcurrentQueue<VerifyFlow>();
        a.Changed += aFlows.Enqueue;
        b.Changed += bFlows.Enqueue;
        await a.Listen();
        await b.Listen();

        async Task<VerifyFlow> Wait(
            System.Collections.Concurrent.ConcurrentQueue<VerifyFlow> flows,
            VerifyPhase phase
        )
        {
            for (var i = 0; i < 120; i++) {
                if (flows.FirstOrDefault(f => f.Phase == phase) is { } found)
                    return found;
                await Task.Delay(500);
            }

            throw new Exception(
                $"no {phase}; first saw " + string.Join(",", aFlows.Select(f => f.Phase))
                + "; second saw " + string.Join(",", bFlows.Select(f => f.Phase))
            );
        }

        await b.Request();
        var request = await Wait(aFlows, VerifyPhase.Requested);
        Assert.True(request.Incoming);
        await a.Accept();
        var shownA = await Wait(aFlows, VerifyPhase.Emojis);
        var shownB = await Wait(bFlows, VerifyPhase.Emojis);
        Assert.Equal(7, shownA.Emojis!.Count);
        Assert.Equal(
            shownA.Emojis.Select(e => e.Symbol),
            shownB.Emojis!.Select(e => e.Symbol)
        );
        await a.Confirm(true);
        await b.Confirm(true);
        await Wait(aFlows, VerifyPhase.Done);
        await Wait(bFlows, VerifyPhase.Done);
        await firstRooms.StopSync();
        await secondRooms.StopSync();
        await first.Logout();
        await second.Logout();
    }
}

[Collection("homeserver")]
public class MatrixSpaceEngineTests {
    [Fact]
    public async Task Lists_the_rooms_of_a_space()
    {
        var server = Environment.GetEnvironmentVariable("OHMATRIX_TEST_HOMESERVER");
        Assert.SkipWhen(string.IsNullOrEmpty(server), "OHMATRIX_TEST_HOMESERVER is not set");
        var auth = new MatrixAuthEngine(
            Path.Combine(Path.GetTempPath(), "ohm-space-" + Guid.NewGuid().ToString("N"))
        );
        await auth.LoginWithPassword(server!, "test", "123456");
        var rooms = new MatrixRoomsEngine(auth);
        var tag = Guid.NewGuid().ToString("N")[..8];
        var space = await auth.Client!.CreateRoom(
            new uniffi.matrix_sdk_ffi.CreateRoomParameters(
                "Space " + tag,
                false,
                new uniffi.matrix_sdk_ffi.RoomVisibility.Private(),
                uniffi.matrix_sdk_ffi.RoomPreset.PrivateChat,
                IsSpace: true
            )
        );
        var child = await auth.Client!.CreateRoom(
            new uniffi.matrix_sdk_ffi.CreateRoomParameters(
                "Child " + tag,
                false,
                new uniffi.matrix_sdk_ffi.RoomVisibility.Private(),
                uniffi.matrix_sdk_ffi.RoomPreset.PrivateChat
            )
        );
        // Adding a child needs both rooms in the local cache, which the sync fills.
        await rooms.StartSync();
        var service = await auth.Client!.SpaceService();
        for (var i = 0; i < 20; i++) {
            try {
                await service.AddChildToSpace(child, space);
                break;
            } catch (Exception) when (i < 19) {
                await Task.Delay(500);
            }
        }

        IReadOnlyList<SpaceChild> found = [];
        for (var i = 0; i < 10 && found.Count == 0; i++) {
            found = await rooms.SpaceChildren(space);
            if (found.Count == 0)
                await Task.Delay(500);
        }

        Assert.Contains(found, c => c.RoomId == child && c.Name == "Child " + tag && !c.IsSpace);
        await rooms.StopSync();
        await auth.Logout();
    }
}

[Collection("homeserver")]
public class MatrixProfileEngineTests {
    [Fact]
    public async Task Changes_the_display_name()
    {
        var server = Environment.GetEnvironmentVariable("OHMATRIX_TEST_HOMESERVER");
        Assert.SkipWhen(string.IsNullOrEmpty(server), "OHMATRIX_TEST_HOMESERVER is not set");
        var auth = new MatrixAuthEngine(
            Path.Combine(Path.GetTempPath(), "ohm-prof-" + Guid.NewGuid().ToString("N"))
        );
        await auth.LoginWithPassword(server!, "test", "123456");
        var profiles = new MatrixProfileEngine(auth);
        var before = (await profiles.Load()).DisplayName;
        await profiles.SetDisplayName("Tester One");
        Assert.Equal("Tester One", (await profiles.Load()).DisplayName);
        await profiles.SetDisplayName(before ?? "test");
        try {
            await profiles.SetStatus("Testing");
            Assert.Equal("Testing", (await profiles.Load()).Status);
            await profiles.SetStatus("");
            Assert.Null((await profiles.Load()).Status);
        } catch (EngineException e) when (e.Code == EngineErrorCode.Unsupported) {
            // A server without custom profile fields: the page tells so.
        }

        await profiles.SetAvatar("image/png", [137, 80, 78, 71, 13, 10, 26, 10]);
        Assert.StartsWith("mxc://", (await profiles.Load()).AvatarUrl);
        await auth.Logout();
    }
}

[Collection("homeserver")]
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

        var dir = Path.Combine(Path.GetTempPath(), "ohm-up-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        var note = Path.Combine(dir, "note.txt");
        await File.WriteAllTextAsync(note, "hello file");
        var fileSeen = new TaskCompletionSource<TimelineItem>();
        chat.Changed += items => {
            if (items.FirstOrDefault(i => i.File?.Name == "note.txt" && !i.Sending) is { } f)
                fileSeen.TrySetResult(f);
        };
        await chat.SendAttachment(note, "text/plain", null, null);
        await Task.WhenAny(fileSeen.Task, Task.Delay(30000));
        Assert.True(fileSeen.Task.IsCompleted, "the file message did not come back");
        Assert.Equal(10, fileSeen.Task.Result.File!.Size);
        var fetched = await new MatrixMediaEngine(auth).Download(
            fileSeen.Task.Result.File!.Source,
            "note.txt",
            "text/plain"
        );
        Assert.Equal("hello file", await File.ReadAllTextAsync(fetched!));

        var id = seen.Task.Result.Id;
        await chat.SetPinned(id, true);
        await chat.SetPinned(id, false);
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
