using OhMatrix.Core.Calls;
using OhMatrix.Core.Calls.Gst;
using Xunit;

namespace OhMatrix.Tests.Calls;

public class GstPeerTests {
    private static readonly GstSources Test = new(
        "audiotestsrc is-live=true wave=silence",
        "fakesink sync=false",
        "videotestsrc is-live=true pattern=ball"
    );

    private static async Task<T> Within<T>(Func<T?> read, string what, int ms = 20_000)
        where T : class
    {
        for (var waited = 0; waited < ms; waited += 50) {
            if (read() is { } found)
                return found;
            await Task.Delay(50);
        }

        throw new TimeoutException("not in time: " + what);
    }

    [Fact]
    public async Task Two_peers_connect_and_the_picture_crosses()
    {
        Assert.SkipUnless(new GstCallPlatform().Available,
            "GStreamer with webrtcbin is not installed");
        using var a = new GstPeer([], Test);
        using var b = new GstPeer([], Test);
        var aState = new List<PeerState>();
        var bState = new List<PeerState>();
        a.Connection += aState.Add;
        b.Connection += bState.Add;
        // Candidates are carried across once the other side has its description.
        var toB = new List<IceCandidate>();
        var toA = new List<IceCandidate>();
        var aReady = false;
        var bReady = false;
        a.Candidate += c => {
            if (c is null)
                return;
            lock (toB) {
                if (bReady)
                    _ = b.AddIceCandidate(c);
                else
                    toB.Add(c);
            }
        };
        b.Candidate += c => {
            if (c is null)
                return;
            lock (toA) {
                if (aReady)
                    _ = a.AddIceCandidate(c);
                else
                    toA.Add(c);
            }
        };

        a.AddLocalMedia(true);
        var offer = await a.CreateOffer();
        Assert.Equal("offer", offer.Type);
        Assert.Contains("m=audio", offer.Sdp);
        Assert.Contains("m=video", offer.Sdp);
        Assert.Contains("opus", offer.Sdp, StringComparison.OrdinalIgnoreCase);
        await a.SetLocalDescription(offer);

        b.AddLocalMedia(true);
        await b.SetRemoteDescription(offer);
        var answer = await b.CreateAnswer();
        Assert.Equal("answer", answer.Type);
        await b.SetLocalDescription(answer);
        lock (toB) {
            bReady = true;
            foreach (var c in toB)
                _ = b.AddIceCandidate(c);
            toB.Clear();
        }

        await a.SetRemoteDescription(answer);
        lock (toA) {
            aReady = true;
            foreach (var c in toA)
                _ = a.AddIceCandidate(c);
            toA.Clear();
        }

        await Within(() => aState.Contains(PeerState.Connected) ? aState : null,
            "a connected; states " + string.Join(',', aState));
        await Within(() => bState.Contains(PeerState.Connected) ? bState : null, "b connected");

        // The picture of each reaches the other.
        var seen = await Within(() => {
            (int, int)? size = null;
            b.TryTakeFrame((data, w, h) => size = (w, h));
            return size is { } s
                ? new[] {
                        s.Item1, s.Item2
                }
                : null;
        },
            "picture at b; log: " +
            string.Join(" | ", OhMatrix.Core.State.AppLog.Snapshot().Select(l => l.Text)));
        Assert.Equal(640, seen[0]);
        Assert.Equal(480, seen[1]);
        var back = await Within(() => {
            (int, int)? size = null;
            a.TryTakeFrame((data, w, h) => size = (w, h));
            return size is { } s
                ? new[] {
                    s.Item1, s.Item2
                }
                : null;
        }, "picture at a");
        Assert.Equal(640, back[0]);
        // My own camera, small, for the corner of the screen.
        var own = await Within(() => {
            (int, int)? size = null;
            a.TryTakeLocalFrame((data, w, h) => size = (w, h));
            return size is { } s
                ? new[] {
                    s.Item1, s.Item2
                }
                : null;
        }, "my own picture");
        Assert.Equal((240, 180), (own[0], own[1]));
        a.SetMuted(true);
        a.SetCameraOff(true);
        a.SetMuted(false);
    }

    [Fact]
    public async Task The_microphones_and_cameras_are_listed_and_can_be_switched_to_in_a_call()
    {
        Assert.SkipUnless(new GstCallPlatform().Available,
            "GStreamer with webrtcbin is not installed");
        var platform = new GstCallPlatform(Test);
        var devices = platform.Media.Devices();
        Assert.All(devices.Microphones, d => Assert.False(string.IsNullOrEmpty(d.Label)));
        using var peer = new GstPeer([], Test);
        peer.AddLocalMedia(true);
        if (devices.Microphones.Count > 0)
            Assert.True(peer.UseMicrophone(devices.Microphones[0].Id));
        if (devices.Cameras.Count > 0)
            Assert.True(peer.UseCamera(devices.Cameras[0].Id));
        Assert.False(peer.UseMicrophone("no such microphone"));
        // The call still makes an offer with what was switched to.
        var offer = await peer.CreateOffer();
        Assert.Contains("m=audio", offer.Sdp);
        Assert.Contains("m=video", offer.Sdp);
    }
}
