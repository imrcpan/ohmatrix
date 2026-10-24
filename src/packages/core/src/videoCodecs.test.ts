import { expect, test } from "vitest";
import { orderVideoCodecs, sdpVideoCodecs, VideoWatch } from "./videoCodecs.js";

const sdp = [
  "v=0",
  "m=audio 9 UDP/TLS/RTP/SAVPF 111",
  "a=rtpmap:111 opus/48000/2",
  "m=video 9 UDP/TLS/RTP/SAVPF 102 103 96 97 98 100",
  "a=rtpmap:102 H264/90000",
  "a=rtpmap:103 rtx/90000",
  "a=rtpmap:96 VP8/90000",
  "a=rtpmap:97 rtx/90000",
  "a=rtpmap:98 VP9/90000",
  "a=rtpmap:100 H264/90000",
  "",
].join("\r\n");

test("the codecs of an SDP's video, in its order, without the repairing ones and without repeats", () => {
  expect(sdpVideoCodecs(sdp)).toEqual(["H264", "VP8", "VP9"]);
  expect(sdpVideoCodecs("v=0\r\nm=audio 9 X 111\r\na=rtpmap:111 opus/48000/2\r\n")).toEqual([]);
  expect(sdpVideoCodecs(undefined)).toEqual([]);
});

test("the order keeps what the other side offered, with the codecs this side cannot send after the ones it can", () => {
  // Both can send everything: the offer's order stands (H264 first, as a phone offers it).
  expect(orderVideoCodecs({ offered: ["H264", "VP8", "VP9"], sendable: ["VP8", "VP9", "H264"], failed: [] })).toEqual(["H264", "VP8", "VP9"]);
  // This side has no H264 encoder: it is listed, but behind what can be sent.
  expect(orderVideoCodecs({ offered: ["H264", "VP8", "VP9"], sendable: ["VP8", "VP9"], failed: [] })).toEqual(["VP8", "VP9", "H264"]);
  // A codec that was tried and sent nothing goes last, even if it can be sent.
  expect(orderVideoCodecs({ offered: ["H264", "VP8", "VP9"], sendable: ["VP8", "VP9", "H264"], failed: ["H264"] })).toEqual(["VP8", "VP9", "H264"]);
  expect(orderVideoCodecs({ offered: ["VP8", "VP9"], sendable: ["VP8", "VP9", "H264"], failed: ["VP8"] })).toEqual(["VP9", "H264", "VP8"]);
  // A codec only this side knows is added after the offered ones of its rank.
  expect(orderVideoCodecs({ offered: ["VP8"], sendable: ["VP8", "AV1"], failed: [] })).toEqual(["VP8", "AV1"]);
  expect(orderVideoCodecs({ offered: [], sendable: [], failed: [] })).toEqual([]);
});

const watch = () => new VideoWatch(2000, 4000);
const at = (now: number, sentBytes: number, receivedBytes: number, over: { sending?: boolean; receiving?: boolean } = {}) => ({
  now,
  sentBytes,
  receivedBytes,
  sending: over.sending ?? true,
  receiving: over.receiving ?? true,
});

test("a picture that moves is fine, and the first moments are left alone", () => {
  const w = watch();
  for (let t = 0; t <= 20000; t += 1000) expect(w.sample(at(t, t * 10, t * 20))).toBe("ok");
});

test("a picture that is meant to be sent and does not move for four seconds is a stall of the send, once", () => {
  const w = watch();
  const seen: string[] = [];
  for (let t = 0; t <= 12000; t += 1000) seen.push(w.sample(at(t, 0, t * 10)));
  expect(seen.indexOf("send-stalled")).toBe(4); // four seconds after it started
  expect(seen.filter((v) => v === "send-stalled")).toHaveLength(1);
  expect(seen.includes("receive-stalled")).toBe(false);
});

test("a picture that is meant to arrive and does not is a stall of the receive", () => {
  const w = watch();
  const seen: string[] = [];
  for (let t = 0; t <= 8000; t += 1000) seen.push(w.sample(at(t, t * 10, 0)));
  expect(seen.filter((v) => v !== "ok")).toEqual(["receive-stalled"]);
});

test("a camera that is off sends nothing and that is no stall; turning it on starts the count", () => {
  const w = watch();
  for (let t = 0; t <= 10000; t += 1000) expect(w.sample(at(t, 0, t * 10, { sending: false }))).toBe("ok");
  const seen = [] as string[];
  for (let t = 11000; t <= 16000; t += 1000) seen.push(w.sample(at(t, 0, t * 10)));
  expect(seen.indexOf("send-stalled")).toBe(4);
});

test("after a codec is changed, the watch starts again and may say so again", () => {
  const w = watch();
  let said = 0;
  for (let t = 0; t <= 6000; t += 1000) if (w.sample(at(t, 0, t * 10)) === "send-stalled") said++;
  expect(said).toBe(1);
  w.reset(7000);
  for (let t = 7000; t <= 14000; t += 1000) if (w.sample(at(t, 0, t * 10)) === "send-stalled") said++;
  expect(said).toBe(2);
});
