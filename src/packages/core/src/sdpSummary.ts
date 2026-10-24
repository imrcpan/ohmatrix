/**
 * What an SDP says about the media, in one line for the log: for each section the kind, the port (0 = refused), the direction, the first
 * codecs, and whether it names a source of its own (`ssrc`, `msid`). It has no address, no ICE or key line: it can be kept in a log. A
 * picture that does not arrive is read from it: a section that is `recvonly` or `inactive` on one side, or without a source, is not sent.
 */
export function sdpSummary(sdp: string | undefined | null): string {
  if (!sdp) return "(none)";
  const out: string[] = [];
  for (const section of sdp.split(/\r?\nm=/).slice(1)) {
    const lines = section.split(/\r?\n/);
    const [kind = "?", port = "?", , ...types] = (lines[0] ?? "").split(" ");
    const names = types
      .slice(0, 4)
      .map(
        (pt) =>
          lines
            .find((l) => l.startsWith(`a=rtpmap:${pt} `))
            ?.slice(`a=rtpmap:${pt} `.length)
            .split("/")[0],
      )
      .filter((n): n is string => !!n && !/^(rtx|red|ulpfec|flexfec-03)$/i.test(n));
    const direction = lines.find((l) => /^a=(sendrecv|sendonly|recvonly|inactive)$/.test(l))?.slice(2) ?? "-";
    const sources = new Set(lines.filter((l) => l.startsWith("a=ssrc:")).map((l) => l.split(" ")[0])).size;
    const msid = lines.some((l) => l.startsWith("a=msid:"));
    out.push(`${kind} port=${port} ${direction} ${names.join("+") || "no-codec"} ssrc=${sources} msid=${msid ? "yes" : "no"}`);
  }
  return out.join(" ; ") || "(no media)";
}
