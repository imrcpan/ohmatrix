using System.Text.Json.Nodes;
using OhMatrix.Core.Calls;
using Xunit;

namespace OhMatrix.Tests.Calls;

public class CallSignallingTests {
    private sealed class Clock {
        public DateTimeOffset Now = new(2026, 11, 7, 12, 0, 0, TimeSpan.Zero);

        private readonly List<(DateTimeOffset At, Action Run, bool[] Cancelled)>
            timers = [];

        public Action Later(Action run, TimeSpan delay)
        {
            var cancelled = new[] {
                false
            };
            timers.Add((Now + delay, run, cancelled));
            return () => cancelled[0] = true;
        }

        public void Advance(TimeSpan by)
        {
            Now += by;
            foreach (var t in timers.Where(t => t.At <= Now && !t.Cancelled[0])
                         .ToList()) {
                t.Cancelled[0] = true;
                t.Run();
            }
        }
    }

    private sealed class FakePeer : IPeer {
        public readonly List<string> Calls = [];
        public readonly List<IceCandidate> Added = [];
        public bool Closed;
        private bool local, remote;
        private static int counter;

        public event Action<IceCandidate?>? Candidate;
        public event Action<PeerState>? Connection;

        public Task<SessionDescription> CreateOffer() =>
            Task.FromResult(new SessionDescription("offer",
                "v=0\nm=audio\n" + (Video ? "m=video\n" : "")));

        public Task<SessionDescription> CreateAnswer() =>
            Task.FromResult(new SessionDescription("answer", "v=0\nm=audio\n"));

        public bool Video;

        public Task SetLocalDescription(SessionDescription d)
        {
            Calls.Add("local " + d.Type);
            local = true;
            Candidate?.Invoke(
                new IceCandidate("candidate:" + ++counter, "0", 0));
            Candidate?.Invoke(null);
            Check();
            return Task.CompletedTask;
        }

        public Task SetRemoteDescription(SessionDescription d)
        {
            Calls.Add("remote " + d.Type);
            remote = true;
            Check();
            return Task.CompletedTask;
        }

        public Task AddIceCandidate(IceCandidate c)
        {
            Added.Add(c);
            return Task.CompletedTask;
        }

        private void Check()
        {
            if (local && remote)
                Connection?.Invoke(PeerState.Connected);
        }

        public void Drop(PeerState state) => Connection?.Invoke(state);

        public void Close() => Closed = true;
    }

    private sealed class Media : ICallMedia {
        public readonly List<string> Log = [];
        public bool Refuse;
        public string? StreamId => "stream-1";

        public CallDevices Devices() => new([], []);

        public void UseDevice(bool camera, string id) =>
            Log.Add($"use {camera} {id}");

        public Task Start(IPeer peer, bool video)
        {
            if (Refuse)
                throw new InvalidOperationException("denied");
            Log.Add("start " + video);
            return Task.CompletedTask;
        }

        public void SetMuted(bool muted) => Log.Add("muted " + muted);

        public void SetCameraOff(bool off) => Log.Add("camera " + off);

        public void Stop() => Log.Add("stop");
    }

    private sealed class Side : ICallTransport {
        public readonly string User;
        public readonly Clock Clock;
        public readonly Media MediaFake = new();
        public readonly List<FakePeer> Peers = [];
        public readonly List<(string Type, JsonObject Content)> Sent = [];
        public readonly List<CallInfo?> Changes = [];
        public CallSignalling Signalling = null!;
        public Side? Other;
        public bool VideoOffer;
        private int ids;

        public Side(string user, Clock clock)
        {
            User = user;
            Clock = clock;
            Signalling = new CallSignalling(this, () => User, Changes.Add);
        }

        public ICallMedia Media => MediaFake;
        public DateTimeOffset Now => Clock.Now;

        public async Task Send(string roomId, string type, JsonObject content)
        {
            Sent.Add((type,
                JsonNode.Parse(content.ToJsonString())!.AsObject()));
            if (Other != null)
                await Other.Signalling.Receive(new CallEvent(roomId, type, User,
                    "$" + Sent.Count,
                    0,
                    JsonNode.Parse(content.ToJsonString())!.AsObject()));
        }

        public IPeer NewPeer(IReadOnlyList<IceServer> servers)
        {
            var peer = new FakePeer {
                Video = VideoOffer
            };
            Peers.Add(peer);
            return peer;
        }

        public Task<IReadOnlyList<IceServer>> IceServers() =>
            Task.FromResult<IReadOnlyList<IceServer>>([]);

        public Action Later(Action action, TimeSpan delay) =>
            Clock.Later(action, delay);

        public string NewId() => User + "-" + ++ids;
    }

    private static (Side Caller, Side Callee, Clock Clock) Pair()
    {
        var clock = new Clock();
        var caller = new Side("@a:s", clock);
        var callee = new Side("@b:s", clock);
        caller.Other = callee;
        callee.Other = caller;
        return (caller, callee, clock);
    }

    [Fact]
    public async Task A_call_rings_is_answered_connects_and_is_hung_up()
    {
        var (caller, callee, clock) = Pair();
        await caller.Signalling.Place("!r", "@b:s", false);
        Assert.Equal(CallPhase.Ringing, caller.Signalling.Current!.Phase);
        Assert.False(caller.Signalling.Current.Incoming);
        var ringing = callee.Signalling.Current!;
        Assert.Equal((CallPhase.Ringing, true, "@a:s"),
            (ringing.Phase, ringing.Incoming, ringing.Peer));
        Assert.Equal("m.call.invite", caller.Sent[0].Type);
        Assert.Equal("@b:s", (string?)caller.Sent[0].Content["invitee"]);
        Assert.Equal("1", (string?)caller.Sent[0].Content["version"]);

        await callee.Signalling.Answer(false);
        Assert.Equal(CallPhase.Connected, callee.Signalling.Current!.Phase);
        Assert.Equal(CallPhase.Connected, caller.Signalling.Current!.Phase);
        Assert.Equal(clock.Now, caller.Signalling.Current.ConnectedAt);
        Assert.Contains(caller.Sent, s => s.Type == "m.call.select_answer");

        await caller.Signalling.Hangup();
        Assert.Equal(EndReason.Hangup, caller.Signalling.Current!.EndReason);
        Assert.Equal(CallPhase.Ended, callee.Signalling.Current!.Phase);
        Assert.Contains("stop", caller.MediaFake.Log);
        Assert.True(caller.Peers[0].Closed);
        caller.Signalling.Dismiss();
        Assert.Null(caller.Signalling.Current);
    }

    [Fact]
    public async Task Candidates_go_in_one_event_and_wait_for_the_answer()
    {
        var (caller, callee, clock) = Pair();
        await caller.Signalling.Place("!r", "@b:s", false);
        // The caller found its candidates, but the other session is not known yet: nothing is sent.
        clock.Advance(TimeSpan.FromSeconds(1));
        Assert.DoesNotContain(caller.Sent, s => s.Type == "m.call.candidates");
        await callee.Signalling.Answer(false);
        var batch = caller.Sent.Single(s => s.Type == "m.call.candidates");
        Assert.Single(batch.Content["candidates"]!.AsArray());
        Assert.Single(callee.Peers[0].Added);
    }

    [Fact]
    public async Task Candidates_that_come_before_the_answer_are_kept_for_it()
    {
        var (caller, callee, _) = Pair();
        await caller.Signalling.Place("!r", "@b:s", false);
        await callee.Signalling.Receive(new CallEvent("!r", "m.call.candidates",
            "@a:s", "$c", 0,
            new JsonObject {
                ["call_id"] = caller.Signalling.Current!.CallId,
                ["candidates"] = new JsonArray(new JsonObject {
                    ["candidate"] = "candidate:early",
                    ["sdpMid"] = "0",
                    ["sdpMLineIndex"] = 0
                }),
            }));
        Assert.Empty(callee.Peers);
        await callee.Signalling.Answer(false);
        Assert.Contains(callee.Peers[0].Added,
            c => c.Candidate == "candidate:early");
    }

    [Fact]
    public async Task Turning_a_ringing_call_away_rejects_it()
    {
        var (caller, callee, _) = Pair();
        await caller.Signalling.Place("!r", "@b:s", false);
        await callee.Signalling.Hangup();
        Assert.Equal("m.call.reject", callee.Sent[0].Type);
        Assert.Equal(EndReason.Rejected, caller.Signalling.Current!.EndReason);
    }

    [Fact]
    public async Task
        Nobody_answering_ends_the_call_after_the_invitation_lifetime()
    {
        var (caller, callee, clock) = Pair();
        await caller.Signalling.Place("!r", "@b:s", false);
        clock.Advance(TimeSpan.FromSeconds(61));
        Assert.Equal(EndReason.Unanswered,
            caller.Signalling.Current!.EndReason);
        Assert.Equal("invite_timeout",
            (string?)caller.Sent.Last().Content["reason"]);
        // The one called stops ringing too: by its own timer or by the hangup, whichever comes first.
        Assert.Equal(CallPhase.Ended, callee.Signalling.Current!.Phase);
    }

    [Fact]
    public async Task A_second_invitation_is_told_the_line_is_busy()
    {
        var (caller, callee, _) = Pair();
        await caller.Signalling.Place("!r", "@b:s", false);
        await callee.Signalling.Receive(new CallEvent("!x", "m.call.invite",
            "@c:s", "$i", 0,
            new JsonObject {
                ["call_id"] = "other",
                ["lifetime"] = 60000,
                ["offer"] = new JsonObject {
                    ["type"] = "offer",
                    ["sdp"] = "v=0"
                },
            }));
        var reject = callee.Sent.Single(s => s.Type == "m.call.reject");
        Assert.Equal("user_busy", (string?)reject.Content["reason"]);
        Assert.Equal(caller.Signalling.Current!.CallId,
            callee.Signalling.Current!.CallId);
    }

    [Fact]
    public async Task An_invitation_found_late_is_not_rung_for()
    {
        var (_, callee, _) = Pair();
        await callee.Signalling.Receive(new CallEvent("!r", "m.call.invite",
            "@a:s", "$i", 61_000,
            new JsonObject {
                ["call_id"] = "old",
                ["lifetime"] = 60000,
                ["offer"] = new JsonObject {
                    ["type"] = "offer",
                    ["sdp"] = "v=0"
                },
            }));
        Assert.Null(callee.Signalling.Current);
    }

    [Fact]
    public async Task
        A_video_offer_is_a_video_call_and_the_camera_can_be_turned_off()
    {
        var (caller, callee, _) = Pair();
        caller.VideoOffer = true;
        await caller.Signalling.Place("!r", "@b:s", true);
        Assert.True(callee.Signalling.Current!.Video);
        await callee.Signalling.Answer(true);
        Assert.Contains("start True", callee.MediaFake.Log);
        callee.Signalling.SetCameraOff(true);
        callee.Signalling.SetMuted(true);
        Assert.Contains("camera True", callee.MediaFake.Log);
        Assert.Contains("muted True", callee.MediaFake.Log);
        Assert.True(callee.Signalling.Current!.Muted);
    }

    [Fact]
    public async Task Refused_devices_end_the_call_without_a_trace()
    {
        var (caller, _, _) = Pair();
        caller.MediaFake.Refuse = true;
        var e = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            caller.Signalling.Place("!r", "@b:s", false));
        Assert.Equal("no_media", e.Message);
        Assert.Null(caller.Signalling.Current);
    }

    [Fact]
    public async Task
        A_dropped_connection_is_poor_until_it_returns_and_a_failed_one_ends()
    {
        var (caller, callee, _) = Pair();
        await caller.Signalling.Place("!r", "@b:s", false);
        await callee.Signalling.Answer(false);
        caller.Peers[0].Drop(PeerState.Disconnected);
        Assert.True(caller.Signalling.Current!.Poor);
        caller.Peers[0].Drop(PeerState.Connected);
        Assert.False(caller.Signalling.Current!.Poor);
        caller.Peers[0].Drop(PeerState.Failed);
        Assert.Equal(EndReason.Failed, caller.Signalling.Current!.EndReason);
    }

    [Fact]
    public async Task A_call_placed_twice_is_busy()
    {
        var (caller, _, _) = Pair();
        await caller.Signalling.Place("!r", "@b:s", false);
        var e = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            caller.Signalling.Place("!r", "@b:s", false));
        Assert.Equal("busy", e.Message);
    }
}
