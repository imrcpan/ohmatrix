import { expect, test } from "vitest";
import { sdpSummary } from "./sdpSummary.js";

const sdp = [
  "v=0",
  "o=- 1 2 IN IP4 127.0.0.1",
  "a=ice-ufrag:secret",
  "m=audio 9 UDP/TLS/RTP/SAVPF 111 63",
  "c=IN IP4 0.0.0.0",
  "a=sendrecv",
  "a=msid:s a",
  "a=rtpmap:111 opus/48000/2",
  "a=rtpmap:63 red/48000/2",
  "a=ssrc:111 cname:x",
  "a=ssrc:111 msid:s a",
  "m=video 9 UDP/TLS/RTP/SAVPF 96 97 102",
  "a=recvonly",
  "a=rtpmap:96 VP8/90000",
  "a=rtpmap:97 rtx/90000",
  "a=rtpmap:102 H264/90000",
  "m=video 0 UDP/TLS/RTP/SAVPF 96",
  "a=inactive",
  "",
].join("\r\n");

test("a section is one entry: kind, port, direction, codecs without the helper ones, and whether it has a source", () => {
  expect(sdpSummary(sdp)).toBe(
    "audio port=9 sendrecv opus ssrc=1 msid=yes ; video port=9 recvonly VP8+H264 ssrc=0 msid=no ; video port=0 inactive no-codec ssrc=0 msid=no",
  );
});

test("it carries nothing that identifies the connection", () => {
  expect(sdpSummary(sdp)).not.toMatch(/secret|127\.0\.0\.1|ufrag|cname/);
});

test("no description, or one without media, is said so", () => {
  expect(sdpSummary(undefined)).toBe("(none)");
  expect(sdpSummary("")).toBe("(none)");
  expect(sdpSummary("v=0\r\ns=-\r\n")).toBe("(no media)");
});
