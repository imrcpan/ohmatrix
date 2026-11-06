using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace OhMatrix.Core.Calls;

/// <summary>
/// One-to-one calls over Matrix VoIP (<c>m.call.*</c>, version 1), the part the SDK leaves to the app (<c>CallSignalling</c> of the TypeScript
/// engine): who invites, who answers, which candidates go where, and when it is over. The SDK sends and receives the events, the media goes through
/// a peer connection; both are handed in. Everything here runs on one thread (the UI thread). Left out, as in the first React Native version:
/// negotiating again in the middle of a call, changing the kind of a call, screen sharing and hold.
/// </summary>
public sealed partial class CallSignalling {
    private const string Version = "1";

    /// <summary>How long an invitation lasts: after this the one called no longer rings, and the caller gives up.</summary>
    public static readonly TimeSpan InviteLifetime = TimeSpan.FromSeconds(60);

    private static readonly TimeSpan CandidateBatch = TimeSpan.FromMilliseconds(150);

    private sealed class Live {
        public required CallInfo Info { get; set; }
        public IPeer? Peer;
        public required string Party;
        public string? RemoteParty;
        public readonly List<IceCandidate> PendingRemote = [];
        public bool RemoteSet;
        public readonly List<IceCandidate> Outgoing = [];
        public Action? StopBatch;
        public Action? StopTimer;
        public SessionDescription? Offer;
    }

    private readonly ICallTransport transport;
    private readonly Func<string> me;
    private readonly Action<CallInfo?> onChange;
    private Live? call;

    public CallSignalling(ICallTransport transport, Func<string> me, Action<CallInfo?> onChange)
    {
        this.transport = transport;
        this.me = me;
        this.onChange = onChange;
    }

    public CallInfo? Current => call?.Info;

    private void Emit()
    {
        onChange(call?.Info);
    }

    private JsonObject Content(Live c, JsonObject extra)
    {
        var content = new JsonObject {
            ["call_id"] = c.Info.CallId,
            ["party_id"] = c.Party,
            ["version"] = Version,
        };
        foreach (var (key, value) in extra.ToList()) {
            extra.Remove(key);
            content[key] = value;
        }

        return content;
    }

    private async Task Send(Live c, string type, JsonObject? extra = null)
    {
        try {
            await transport.Send(c.Info.RoomId, type, Content(c, extra ?? []));
        } catch (Exception) {
            // A hangup or a candidate that cannot be sent leaves nothing to do: the call goes on or ends by the other side's timeout.
        }
    }

    private static JsonNode Describe(SessionDescription d)
    {
        return new JsonObject {
            ["type"] = d.Type,
            ["sdp"] = d.Sdp
        };
    }

    private void Wire(Live c, IPeer peer)
    {
        c.Peer = peer;
        peer.Candidate += cand => {
            if (cand is null) {
                FlushCandidates(c);
                return;
            }

            c.Outgoing.Add(cand);
            c.StopBatch ??= transport.Later(() => FlushCandidates(c), CandidateBatch);
        };
        peer.Connection += state => {
            if (call != c || c.Info.Phase == CallPhase.Ended)
                return;
            switch (state) {
                case PeerState.Connected:
                    c.Info = c.Info with {
                        Poor = false
                    };
                    if (c.Info.Phase != CallPhase.Connected) {
                        c.Info = c.Info with {
                            Phase = CallPhase.Connected,
                            ConnectedAt = transport.Now
                        };
                        c.StopTimer?.Invoke();
                        c.StopTimer = null;
                    }

                    break;
                case PeerState.Disconnected:
                    c.Info = c.Info with {
                        Poor = true
                    };
                    break;
                default:
                    End(c, EndReason.Failed, true);
                    break;
            }

            Emit();
        };
    }

    private void FlushCandidates(Live c)
    {
        c.StopBatch?.Invoke();
        c.StopBatch = null;
        // Sent once the other side's session is known (an answer for a call I placed): until then they wait, so none is lost.
        if (c.Outgoing.Count == 0 || (!c.Info.Incoming && c.RemoteParty is null))
            return;
        var list = new JsonArray();
        foreach (var x in c.Outgoing) {
            list.Add((JsonNode)new JsonObject {
                ["candidate"] = x.Candidate,
                ["sdpMid"] = x.SdpMid ?? "",
                ["sdpMLineIndex"] = x.SdpMLineIndex ?? 0,
            });
        }

        c.Outgoing.Clear();
        _ = Send(c, "m.call.candidates", new JsonObject {
            ["candidates"] = list
        });
    }

    private Live Make(string roomId, string peerUser, bool video, bool incoming,
        string? callId = null)
    {
        return new Live {
            Info = new CallInfo {
                CallId = callId ?? transport.NewId(),
                RoomId = roomId,
                Peer = peerUser,
                Video = video,
                Incoming = incoming,
                CameraOff = !video,
            },
            Party = transport.NewId(),
        };
    }

    private JsonObject StreamMetadata(Live c)
    {
        // What the other client needs to tell my streams apart (MSC3077); without it matrix-js-sdk shows neither picture nor sound.
        if (transport.Media.StreamId is not { } id)
            return [];
        return new JsonObject {
            ["org.matrix.msc3077.sdp_stream_metadata"] = new JsonObject {
                [id] = new JsonObject {
                    ["purpose"] = "m.usermedia",
                    ["audio_muted"] = c.Info.Muted,
                    ["video_muted"] = c.Info.CameraOff,
                },
            },
        };
    }

    /// <summary>Calls the other person of a one-to-one room. Throws "busy" when a call is on and "no_media" when the devices are refused.</summary>
    public async Task Place(string roomId, string peerUser, bool video)
    {
        if (call is not null)
            throw new InvalidOperationException("busy");
        var c = Make(roomId, peerUser, video, false);
        call = c;
        Emit();
        IReadOnlyList<IceServer> servers;
        try {
            servers = await transport.IceServers();
        } catch (Exception) {
            servers = [];
        }

        var peer = transport.NewPeer(servers);
        Wire(c, peer);
        try {
            await transport.Media.Start(peer, video);
        } catch (Exception) {
            End(c, EndReason.NoMedia, false);
            throw new InvalidOperationException("no_media");
        }

        var offer = await peer.CreateOffer();
        await peer.SetLocalDescription(offer);
        var extra = StreamMetadata(c);
        extra["lifetime"] = (long)InviteLifetime.TotalMilliseconds;
        extra["offer"] = Describe(offer);
        extra["invitee"] = peerUser;
        await Send(c, "m.call.invite", extra);
        // Nobody picked up in time: the call is over, and the room is told so the other side stops ringing.
        c.StopTimer = transport.Later(() => {
            if (call == c && c.Info.Phase == CallPhase.Ringing) {
                _ = Send(c, "m.call.hangup", new JsonObject {
                    ["reason"] = "invite_timeout"
                });
                End(c, EndReason.Unanswered, true);
            }
        }, InviteLifetime);
    }

    /// <summary>Picks up the call that is ringing.</summary>
    public async Task Answer(bool video)
    {
        var c = call;
        if (c is null || !c.Info.Incoming || c.Info.Phase != CallPhase.Ringing || c.Offer is null)
            return;
        c.StopTimer?.Invoke();
        c.StopTimer = null;
        c.Info = c.Info with {
            Phase = CallPhase.Connecting
        };
        Emit();
        IReadOnlyList<IceServer> servers;
        try {
            servers = await transport.IceServers();
        } catch (Exception) {
            servers = [];
        }

        var peer = transport.NewPeer(servers);
        Wire(c, peer);
        try {
            await transport.Media.Start(peer, video && c.Info.Video);
        } catch (Exception) {
            _ = Send(c, "m.call.hangup", new JsonObject {
                ["reason"] = "user_media_failed"
            });
            End(c, EndReason.NoMedia, false);
            return;
        }

        await peer.SetRemoteDescription(c.Offer);
        c.RemoteSet = true;
        foreach (var x in c.PendingRemote.ToList()) {
            try {
                await peer.AddIceCandidate(x);
            } catch (Exception) {
                // A candidate that does not fit is skipped; the others may.
            }
        }

        c.PendingRemote.Clear();
        var answer = await peer.CreateAnswer();
        await peer.SetLocalDescription(answer);
        var extra = StreamMetadata(c);
        extra["answer"] = Describe(answer);
        await Send(c, "m.call.answer", extra);
        // The candidates found while the answer was being made go now.
        FlushCandidates(c);
    }

    /// <summary>Puts the phone down, or turns a ringing call away.</summary>
    public async Task Hangup()
    {
        var c = call;
        if (c is null || c.Info.Phase == CallPhase.Ended)
            return;
        var ringingIn = c.Info.Incoming && c.Info.Phase == CallPhase.Ringing;
        await Send(c, ringingIn ? "m.call.reject" : "m.call.hangup",
            ringingIn
                ? []
                : new JsonObject {
                    ["reason"] = "user_hangup"
                });
        End(c, EndReason.Hangup, true);
    }

    public void SetMuted(bool muted)
    {
        if (call is not { } c)
            return;
        c.Info = c.Info with {
            Muted = muted
        };
        transport.Media.SetMuted(muted);
        Emit();
    }

    public void SetCameraOff(bool off)
    {
        if (call is not { } c || !c.Info.Video)
            return;
        c.Info = c.Info with {
            CameraOff = off
        };
        transport.Media.SetCameraOff(off);
        Emit();
    }

    /// <summary>Takes an ended call off the screen.</summary>
    public void Dismiss()
    {
        if (call?.Info.Phase == CallPhase.Ended) {
            call = null;
            Emit();
        }
    }

    private void End(Live c, EndReason reason, bool keep)
    {
        if (c.Info.Phase == CallPhase.Ended)
            return;
        c.Info = c.Info with {
            Phase = CallPhase.Ended,
            EndReason = reason
        };
        c.StopTimer?.Invoke();
        c.StopBatch?.Invoke();
        c.Peer?.Close();
        transport.Media.Stop();
        if (call == c) {
            if (!keep)
                call = null;
            Emit();
        }
    }

    private static bool CameraOnIn(JsonObject content)
    {
        return content["org.matrix.msc3077.sdp_stream_metadata"] is JsonObject meta
               && meta.Any(m => m.Value is JsonObject o && (string?)o["purpose"] == "m.usermedia"
                                                        && o["video_muted"] is JsonValue v &&
                                                        v.TryGetValue<bool>(out var muted) &&
                                                        !muted);
    }

    private static SessionDescription? ReadDescription(JsonNode? node)
    {
        if (node is JsonObject o && (string?)o["sdp"] is { } sdp && (string?)o["type"] is { } type)
            return new SessionDescription(type, sdp);
        return null;
    }

    [GeneratedRegex("m=video")]
    private static partial Regex VideoLine();

    /// <summary>A call event arrived (from anyone, in any room).</summary>
    public async Task Receive(CallEvent e)
    {
        if ((string?)e.Content["call_id"] is not { Length: > 0 } callId)
            return;
        var mine = e.Sender == me();
        var c = call;

        if (e.Type == "m.call.invite") {
            // An invitation of my own other session (or my echo) is not for me.
            if (mine)
                return;
            if ((string?)e.Content["invitee"] is { } invitee && invitee != me())
                return;
            var lifetime = e.Content["lifetime"] is JsonValue lv &&
                           lv.TryGetValue<long>(out var ms) && ms > 0
                ? TimeSpan.FromMilliseconds(ms)
                : InviteLifetime;
            // Found by a sync after the call was over: nobody is rung for it.
            if (TimeSpan.FromMilliseconds(e.AgeMs) >=
                (lifetime < InviteLifetime ? lifetime : InviteLifetime))
                return;
            if (c is { Info.Phase: CallPhase.Ended })
                call = null;
            if (call is not null && call.Info.CallId != callId) {
                try {
                    await transport.Send(e.RoomId, "m.call.reject", new JsonObject {
                        ["call_id"] = callId,
                        ["party_id"] = transport.NewId(),
                        ["version"] = Version,
                        ["reason"] = "user_busy",
                    });
                } catch (Exception) {
                    // The caller learns by the timeout.
                }

                return;
            }

            // The same invitation again.
            if (call is not null)
                return;
            if (ReadDescription(e.Content["offer"]) is not { } offer)
                return;
            var next = Make(e.RoomId, e.Sender, VideoLine().IsMatch(offer.Sdp), true, callId);
            next.Offer = offer;
            next.RemoteParty = (string?)e.Content["party_id"];
            call = next;
            var left = lifetime - TimeSpan.FromMilliseconds(e.AgeMs);
            next.StopTimer = transport.Later(() => {
                if (call == next && next.Info.Phase == CallPhase.Ringing)
                    End(next, EndReason.Cancelled, true);
            }, left < TimeSpan.FromSeconds(1) ? TimeSpan.FromSeconds(1) : left);
            Emit();
            return;
        }

        if (c is null || c.Info.CallId != callId)
            return;

        switch (e.Type) {
            case "m.call.answer":
                await Answered(c, e, mine);
                break;
            case "m.call.candidates":
                if (mine)
                    return;
                foreach (var node in e.Content["candidates"] as JsonArray ?? []) {
                    if (node is not JsonObject o || (string?)o["candidate"] is not
                        { Length: > 0 } text)
                        continue;
                    var cand = new IceCandidate(
                        text,
                        (string?)o["sdpMid"],
                        o["sdpMLineIndex"] is JsonValue iv && iv.TryGetValue<int>(out var index)
                            ? index
                            : null
                    );
                    if (c.RemoteSet && c.Peer is not null) {
                        try {
                            await c.Peer.AddIceCandidate(cand);
                        } catch (Exception) {
                            // Skipped: another candidate may connect.
                        }
                    } else
                        c.PendingRemote.Add(cand);
                }

                break;
            case "m.call.hangup" or "m.call.reject":
                if (mine) {
                    if (c.Info.Incoming && c.Info.Phase == CallPhase.Ringing)
                        End(c, EndReason.Cancelled, true);
                    return;
                }

                var reason = (string?)e.Content["reason"];
                var wasRinging = c.Info.Phase == CallPhase.Ringing;
                End(c, reason switch {
                    "user_busy" => EndReason.Busy,
                    "invite_timeout" => EndReason.Unanswered,
                    _ when wasRinging => c.Info.Incoming ? EndReason.Cancelled : EndReason.Rejected,
                    _ => EndReason.Hangup,
                }, true);
                break;
        }
    }

    private async Task Answered(Live c, CallEvent e, bool mine)
    {
        if (mine) {
            // My other session picked up the call that rings here too.
            if (c.Info.Incoming && c.Info.Phase == CallPhase.Ringing
                                && (string?)e.Content["party_id"] != c.Party)
                End(c, EndReason.Cancelled, true);
            return;
        }

        // An answer to a call I did not place, or a second answer: the first one stands.
        if (c.Info.Incoming || c.RemoteParty is not null)
            return;
        c.RemoteParty = (string?)e.Content["party_id"] ?? "unknown";
        c.StopTimer?.Invoke();
        c.StopTimer = null;
        c.Info = c.Info with {
            Phase = CallPhase.Connecting
        };
        if (ReadDescription(e.Content["answer"]) is not { } answer || c.Peer is null) {
            End(c, EndReason.Failed, true);
            return;
        }

        try {
            await c.Peer.SetRemoteDescription(answer);
            c.RemoteSet = true;
            foreach (var x in c.PendingRemote.ToList()) {
                try {
                    await c.Peer.AddIceCandidate(x);
                } catch (Exception) {
                    // Skipped.
                }
            }

            c.PendingRemote.Clear();
        } catch (Exception) {
            End(c, EndReason.Failed, true);
            return;
        }

        await Send(c, "m.call.select_answer", new JsonObject {
            ["selected_party_id"] = c.RemoteParty
        });
        FlushCandidates(c);
        Emit();
    }
}
