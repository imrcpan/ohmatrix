/**
 * Which video codecs this browser really encodes, found by trying: a picture is drawn on a canvas and sent through two connections inside the
 * page, with the codec forced to each in turn, and the codec counts if frames were encoded. The browser's own list of what it can send
 * (`RTCRtpSender.getCapabilities`) is not enough: a browser may list H264 and have no encoder for it (many Linux systems), and then it
 * answers with H264 and sends no picture at all. Nothing leaves the machine and no camera is used.
 *
 * Where there is no way to try (no canvas, no connections: a test run in Node), or nothing could be found to encode, the answer is the list
 * of names that was given, because then nothing is known and nothing should be taken away.
 */
export async function probeEncodableVideoCodecs(names: readonly string[], perCodecMs = 2500): Promise<string[]> {
  const g = globalThis as unknown as {
    document?: { createElement(tag: string): HTMLCanvasElement };
    RTCPeerConnection?: typeof RTCPeerConnection;
    RTCRtpSender?: { getCapabilities?(kind: string): { codecs: RTCRtpCodec[] } | null };
  };
  if (!g.document || !g.RTCPeerConnection || !g.RTCRtpSender?.getCapabilities) return [...names];
  const caps = g.RTCRtpSender.getCapabilities("video")?.codecs ?? [];
  const works: string[] = [];
  for (const name of names) {
    const mine = caps.filter((c) => c.mimeType.replace(/^video\//i, "").toUpperCase() === name);
    if (!mine.length) continue;
    const result = await encodes(g.document, g.RTCPeerConnection, mine, perCodecMs);
    // The reason a codec was left out, in the log: an encoder that is missing is what makes a picture not leave.
    console.log("call: video encoder trial:", name, result === true ? "encodes" : `does NOT encode (${result})`);
    if (result === true) works.push(name);
  }
  return works.length ? works : [...names];
}

async function encodes(
  doc: { createElement(tag: string): HTMLCanvasElement },
  Peer: typeof RTCPeerConnection,
  codecs: RTCRtpCodec[],
  ms: number,
): Promise<true | string> {
  const canvas = doc.createElement("canvas");
  canvas.width = 320;
  canvas.height = 240;
  const ctx = canvas.getContext("2d");
  let n = 0;
  const draw = setInterval(() => {
    if (!ctx) return;
    ctx.fillStyle = `hsl(${(n * 23) % 360} 80% 50%)`;
    ctx.fillRect(0, 0, 320, 240);
    ctx.fillStyle = "#fff";
    ctx.fillRect((n * 7) % 280, (n * 5) % 200, 40, 40);
    n++;
  }, 50);
  const stream = canvas.captureStream(15);
  const a = new Peer();
  const b = new Peer();
  try {
    a.onicecandidate = (e) => e.candidate && void b.addIceCandidate(e.candidate).catch(() => {});
    b.onicecandidate = (e) => e.candidate && void a.addIceCandidate(e.candidate).catch(() => {});
    const t = a.addTransceiver(stream.getVideoTracks()[0]!, { direction: "sendonly", streams: [stream] });
    t.setCodecPreferences(codecs);
    await a.setLocalDescription(await a.createOffer());
    await b.setRemoteDescription(a.localDescription!);
    await b.setLocalDescription(await b.createAnswer());
    await a.setRemoteDescription(b.localDescription!);
    const until = Date.now() + ms;
    while (Date.now() < until) {
      await new Promise((r) => setTimeout(r, 250));
      let frames = 0;
      (await a.getStats()).forEach((v: Record<string, unknown>) => {
        if (v["type"] === "outbound-rtp" && (v["kind"] ?? v["mediaType"]) === "video") frames += Number(v["framesEncoded"] ?? 0) || Number(v["bytesSent"] ?? 0);
      });
      if (frames > 0) return true;
    }
    return `no frame was encoded in ${ms} ms`;
  } catch (e) {
    return e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  } finally {
    clearInterval(draw);
    for (const tr of stream.getTracks()) tr.stop();
    a.close();
    b.close();
  }
}
