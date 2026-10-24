import { createHmac } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";

const HS = "http://localhost:8008";

async function register(name: string) {
  const { nonce } = (await (await fetch(`${HS}/_synapse/admin/v1/register`)).json()) as { nonce: string };
  const mac = createHmac("sha1", "ohmatrix-dev-secret").update(`${nonce}\0${name}\0pw12345\0notadmin`).digest("hex");
  const r = await fetch(`${HS}/_synapse/admin/v1/register`, {
    method: "POST",
    body: JSON.stringify({ nonce, username: name, password: "pw12345", admin: false, mac }),
  });
  if (!r.ok) throw new Error(await r.text());
}

async function token(user: string) {
  const r = (await (
    await fetch(`${HS}/_matrix/client/v3/login`, {
      method: "POST",
      body: JSON.stringify({ type: "m.login.password", identifier: { type: "m.id.user", user }, password: "pw12345" }),
    })
  ).json()) as { access_token: string };
  return r.access_token;
}

async function signIn(page: Page, user: string) {
  await page.goto("/");
  await page.getByText("Sign in to your Matrix account").waitFor();
  const inputs = page.locator("input");
  await inputs.nth(1).fill(user);
  await inputs.nth(2).fill("pw12345");
  await inputs.nth(2).press("Enter");
  await expect(page.getByPlaceholder("Search")).toBeVisible({ timeout: 20000 });
}

/** An incoming call comes up as the full screen, where it can be accepted, declined or made small. */
async function openIncoming(page: Page, kind: "voice" | "video" = "voice") {
  await expect(page.getByText(kind === "voice" ? "Incoming voice call" : "Incoming video call")).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole("button", { name: "Accept" })).toBeVisible();
}

async function twoPeople(browser: Browser) {
  const stamp = Date.now().toString(36);
  const [a, b] = [`ca${stamp}`, `cb${stamp}`];
  await register(a);
  await register(b);
  // A direct chat between them, created the way a client does.
  const ta = await token(a);
  const made = (await (
    await fetch(`${HS}/_matrix/client/v3/createRoom`, {
      method: "POST",
      headers: { authorization: `Bearer ${ta}` },
      body: JSON.stringify({ is_direct: true, invite: [`@${b}:localhost`], preset: "trusted_private_chat" }),
    })
  ).json()) as { room_id: string };
  const tb = await token(b);
  await fetch(`${HS}/_matrix/client/v3/join/${encodeURIComponent(made.room_id)}`, { method: "POST", headers: { authorization: `Bearer ${tb}` }, body: "{}" });
  for (const [tk, user, peer] of [
    [ta, a, b],
    [tb, b, a],
  ] as const)
    await fetch(`${HS}/_matrix/client/v3/user/@${user}:localhost/account_data/m.direct`, {
      method: "PUT",
      headers: { authorization: `Bearer ${tk}` },
      body: JSON.stringify({ [`@${peer}:localhost`]: [made.room_id] }),
    });

  const ctxA = await browser.newContext({ viewport: { width: 420, height: 800 } });
  const ctxB = await browser.newContext({ viewport: { width: 420, height: 800 } });
  const [pa, pb] = [await ctxA.newPage(), await ctxB.newPage()];
  await Promise.all([signIn(pa, a), signIn(pb, b)]);

  return { a, b, pa, pb, ctxA, ctxB };
}

test("a one-to-one call: ring, answer, talk, hang up", async ({ browser }) => {
  const { b, pa, pb, ctxA, ctxB } = await twoPeople(browser);
  await pa.getByPlaceholder("Search").fill(b);
  await pa
    .getByRole("button", { name: new RegExp(b) })
    .first()
    .click();
  await pa.getByRole("button", { name: "Attach" }).click();
  await pa.getByRole("menuitem", { name: "Voice call" }).click();
  await expect(pa.getByText("The other person will be rung.")).toBeVisible();
  await pa.getByRole("button", { name: "Call", exact: true }).click();
  await expect(pa.getByText("Calling…")).toBeVisible({ timeout: 15000 });

  await openIncoming(pb);
  await pb.getByRole("button", { name: "Accept" }).click();
  await expect(pa.getByRole("timer")).toHaveText(/^\d\d:\d\d$/, { timeout: 30000 });
  await expect(pb.getByRole("timer")).toHaveText(/^\d\d:\d\d$/, { timeout: 30000 });

  await pa.getByRole("button", { name: "Microphone on" }).click();
  await expect(pa.getByRole("button", { name: "Microphone off" })).toBeVisible();
  // The browser has no earpiece to choose: the phone's speaker button is not there.
  await expect(pa.getByRole("button", { name: "Speaker" })).toHaveCount(0);

  await pb.getByRole("button", { name: "End", exact: true }).click();
  await expect(pb.getByText("Call ended")).toBeVisible();
  await expect(pa.getByText("Call ended")).toBeVisible({ timeout: 15000 });
  await expect(pa.getByRole("timer")).toBeHidden({ timeout: 10000 });
  await ctxA.close();
  await ctxB.close();
});

test("a group chat has no call buttons (calls are one to one for now); a chat of two still has them", async ({ browser }) => {
  const { a, b, pa, ctxA, ctxB } = await twoPeople(browser);
  // A group of three, made by the first of them.
  const third = `cc${Date.now().toString(36)}`;
  await register(third);
  const ta = await token(a);
  const name = `Crew ${Date.now().toString(36)}`;
  await fetch(`${HS}/_matrix/client/v3/createRoom`, {
    method: "POST",
    headers: { authorization: `Bearer ${ta}` },
    body: JSON.stringify({ name, invite: [`@${b}:localhost`, `@${third}:localhost`], preset: "private_chat" }),
  });
  await pa.getByPlaceholder("Search").fill(name);
  await pa
    .getByRole("button", { name: new RegExp(name) })
    .first()
    .click();
  await pa.getByRole("button", { name: "Attach" }).click();
  // The attach menu is there (photo, file), without the call entries.
  await expect(pa.getByRole("menuitem", { name: "Send file" })).toBeVisible();
  await expect(pa.getByRole("menuitem", { name: "Voice call" })).toHaveCount(0);
  await expect(pa.getByRole("menuitem", { name: "Video call" })).toHaveCount(0);

  // A room that has just the two of them, though it was not made as a direct chat, is a chat of two as well.
  await pa.keyboard.press("Escape");
  await pa.getByRole("button", { name: "Back" }).first().click();
  const pair = `Pair ${Date.now().toString(36)}`;
  const made = (await (
    await fetch(`${HS}/_matrix/client/v3/createRoom`, {
      method: "POST",
      headers: { authorization: `Bearer ${ta}` },
      body: JSON.stringify({ name: pair, invite: [`@${b}:localhost`], preset: "private_chat" }),
    })
  ).json()) as { room_id: string };
  await fetch(`${HS}/_matrix/client/v3/join/${encodeURIComponent(made.room_id)}`, {
    method: "POST",
    headers: { authorization: `Bearer ${await token(b)}` },
    body: "{}",
  });
  await pa.getByPlaceholder("Search").fill(pair);
  await pa
    .getByRole("button", { name: new RegExp(pair) })
    .first()
    .click();
  await expect(async () => {
    await pa.keyboard.press("Escape");
    await pa.getByRole("button", { name: "Attach" }).click();
    await expect(pa.getByRole("menuitem", { name: "Voice call" })).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 20000 });

  // The chat of two keeps them.
  await pa.keyboard.press("Escape");
  await pa.getByRole("button", { name: "Back" }).first().click();
  await pa.getByPlaceholder("Search").fill(b);
  await pa
    .getByRole("button", { name: new RegExp(b) })
    .first()
    .click();
  await pa.getByRole("button", { name: "Attach" }).click();
  await expect(pa.getByRole("menuitem", { name: "Voice call" })).toBeVisible();
  await expect(pa.getByRole("menuitem", { name: "Video call" })).toBeVisible();
  await ctxA.close();
  await ctxB.close();
});

test("the answer's video codec is one this browser can send: the offer's order stands unless its first cannot be encoded here", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Sign in to your Matrix account").waitFor();
  const r = await page.evaluate(
    async ([calls, core]) => {
      const c = (await import(/* @vite-ignore */ calls!)) as {
        sendableVideoCodecs(): string[];
        applyVideoCodecOrder(pc: RTCPeerConnection, order: string[]): void;
      };
      const k = (await import(/* @vite-ignore */ core!)) as {
        orderVideoCodecs(o: { offered: string[]; sendable: string[]; failed: string[] }): string[];
        sdpVideoCodecs(sdp: string): string[];
      };
      const first = (sdp: string) => k.sdpVideoCodecs(sdp)[0];
      const all = RTCRtpReceiver.getCapabilities("video")!.codecs;
      const h264 = all.filter((x) => /H264/i.test(x.mimeType));
      if (!h264.length) return { skipped: true as const };
      // An offer like the phone's: H264 is the first codec of the video.
      const phone = new RTCPeerConnection();
      const tr = phone.addTransceiver("video", { direction: "sendrecv" });
      tr.setCodecPreferences([...h264, ...all.filter((x) => !/H264/i.test(x.mimeType))]);
      const offer = await phone.createOffer();
      const answerFor = async (sendable: string[] | null) => {
        const pc = new RTCPeerConnection();
        await pc.setRemoteDescription(offer);
        if (sendable) c.applyVideoCodecOrder(pc, k.orderVideoCodecs({ offered: k.sdpVideoCodecs(offer.sdp!), sendable, failed: [] }));
        const answer = await pc.createAnswer();
        pc.close();
        return first(answer.sdp!);
      };
      const real = c.sendableVideoCodecs();
      const out = {
        skipped: false as const,
        sendable: real,
        offered: first(offer.sdp!),
        unaided: await answerFor(null),
        withThisBrowser: await answerFor(real),
        withoutH264: await answerFor(real.filter((n) => n !== "H264")),
        failedFirst: await (async () => {
          const pc = new RTCPeerConnection();
          await pc.setRemoteDescription(offer);
          c.applyVideoCodecOrder(pc, k.orderVideoCodecs({ offered: k.sdpVideoCodecs(offer.sdp!), sendable: real, failed: ["H264"] }));
          const answer = await pc.createAnswer();
          pc.close();
          return first(answer.sdp!);
        })(),
      };
      phone.close();
      return out;
    },
    ["/@fs/home/prc/Desktop/oh-matrix/repo/src/packages/engine-js/src/calls.ts", "/@fs/home/prc/Desktop/oh-matrix/repo/src/packages/core/src/videoCodecs.ts"],
  );
  if (r.skipped) test.skip(true, "this browser has no H264 to put first");
  else {
    expect(r.offered).toBe("H264");
    // Left to itself, an answer follows the offer: H264, which a browser without an encoder for it cannot send.
    expect(r.unaided).toBe("H264");
    // With this browser's own list of what it can send: H264 stays first if it can send it, and is passed over if it cannot.
    expect(r.withThisBrowser).toBe(r.sendable.includes("H264") ? "H264" : r.sendable[0]);
    // A browser that cannot send H264 (made so here) answers with a codec it can send.
    expect(r.withoutH264).not.toBe("H264");
    expect(r.sendable).toContain(r.withoutH264);
    // A codec that was tried and sent nothing is not asked for again.
    expect(r.failedFirst).not.toBe("H264");
  }
});

test("the codecs this browser encodes are found by trying: one that is listed and cannot be used is left out", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Sign in to your Matrix account").waitFor();
  const r = await page.evaluate(async (path) => {
    const m = (await import(/* @vite-ignore */ path)) as { probeEncodableVideoCodecs(n: string[], ms?: number): Promise<string[]> };
    const real = RTCRtpSender.getCapabilities.bind(RTCRtpSender);
    const plain = await m.probeEncodableVideoCodecs(["VP8"], 4000);
    // A browser that lists a codec it cannot use: the list has one more entry, which the connection refuses.
    (RTCRtpSender as unknown as { getCapabilities: (k: string) => unknown }).getCapabilities = (k: string) => {
      const c = real(k)!;
      return { ...c, codecs: [...c.codecs, { mimeType: "video/FAKE", clockRate: 90000 }] };
    };
    const lying = await m.probeEncodableVideoCodecs(["VP8", "FAKE"], 1500);
    // Where nothing can be tried, nothing is taken away.
    const none = await m.probeEncodableVideoCodecs(["ZZZ"], 500);
    return { plain, lying, none };
  }, "/@fs/home/prc/Desktop/oh-matrix/repo/src/packages/engine-js/src/videoProbe.ts");
  expect(r.plain).toEqual(["VP8"]);
  expect(r.lying).toEqual(["VP8"]);
  expect(r.none).toEqual(["ZZZ"]);
});

test("a video call: the picture shows on both sides, and the camera can be turned off", async ({ browser }) => {
  const { b, pa, pb, ctxA, ctxB } = await twoPeople(browser);
  await pa.getByPlaceholder("Search").fill(b);
  await pa
    .getByRole("button", { name: new RegExp(b) })
    .first()
    .click();
  await pa.getByRole("button", { name: "Attach" }).click();
  await pa.getByRole("menuitem", { name: "Video call" }).click();
  await pa.getByRole("button", { name: "Start video call" }).click();
  await openIncoming(pb, "video");
  await pb.getByRole("button", { name: "Accept" }).click();
  await expect(pa.getByRole("timer")).toHaveText(/^\d\d:\d\d$/, { timeout: 30000 });
  // The other side's picture is a playing video with a real size.
  for (const page of [pa, pb]) {
    await expect
      .poll(() => page.evaluate(() => [...document.querySelectorAll("video")].some((v) => v.videoWidth > 0 && !v.paused)), { timeout: 20000 })
      .toBe(true);
  }
  await pa.getByRole("button", { name: "Camera on" }).click();
  await expect(pa.getByRole("button", { name: "Camera off" })).toBeVisible();
  await pa.getByRole("button", { name: "End", exact: true }).click();
  await expect(pb.getByText("Call ended")).toBeVisible({ timeout: 15000 });
  await ctxA.close();
  await ctxB.close();
});

test("a picture that is not sent: the person is told another codec is being tried, and then that nothing more can be done", async ({ browser }) => {
  test.setTimeout(120000);
  const { b, pa, pb, ctxA, ctxB } = await twoPeople(browser);
  await pa.getByPlaceholder("Search").fill(b);
  await pa
    .getByRole("button", { name: new RegExp(b) })
    .first()
    .click();
  await pa.getByRole("button", { name: "Attach" }).click();
  await pa.getByRole("menuitem", { name: "Video call" }).click();
  await pa.getByRole("button", { name: "Start video call" }).click();
  await openIncoming(pb, "video");
  await pb.getByRole("button", { name: "Accept" }).click();
  await expect(pb.getByRole("timer")).toHaveText(/^\d\d:\d\d$/, { timeout: 30000 });
  // No notice while the picture goes.
  await expect(pb.getByRole("alert")).toHaveCount(0);

  // From here on the answering browser's statistics say that its video encodes no frame and leaves no byte, as when its codec has no working encoder.
  await pb.evaluate(() => {
    const orig = RTCPeerConnection.prototype.getStats;
    RTCPeerConnection.prototype.getStats = async function (...a: []) {
      const r = await orig.apply(this, a);
      const m = new Map<string, unknown>();
      r.forEach((v: Record<string, unknown>, k: string) =>
        m.set(k, v["type"] === "outbound-rtp" && (v["kind"] ?? v["mediaType"]) === "video" ? { ...v, bytesSent: 0, framesEncoded: 0, framesSent: 0 } : v),
      );
      return m as unknown as RTCStatsReport;
    };
  });
  // The person is told, in words, within a few seconds, instead of being left at a black picture ...
  await expect(pb.getByText("Trying another video format")).toBeVisible({ timeout: 25000 });
  await pb.screenshot({ path: ".out/call-video-switching.png" });
  // ... and, when every codec has been tried and none sends, that nothing more can be done (the call goes on with sound).
  await expect(pb.getByText("The picture can't be shown on this connection")).toBeVisible({ timeout: 80000 });
  await expect(pb.getByText("Trying another video format")).toHaveCount(0);
  await expect(pb.getByRole("timer")).toHaveText(/^\d\d:\d\d$/);
  await pb.getByRole("button", { name: "End", exact: true }).click();
  await ctxA.close();
  await ctxB.close();
});

test("a video call: camera off shows the person, screen sharing shows the screen, devices can be listed", async ({ browser }) => {
  const { b, pa, pb, ctxA, ctxB } = await twoPeople(browser);
  await pa.getByPlaceholder("Search").fill(b);
  await pa
    .getByRole("button", { name: new RegExp(b) })
    .first()
    .click();
  await pa.getByRole("button", { name: "Attach" }).click();
  await pa.getByRole("menuitem", { name: "Video call" }).click();
  await pa.getByRole("button", { name: "Start video call" }).click();
  await openIncoming(pb, "video");
  await pb.getByRole("button", { name: "Accept" }).click();
  await expect(pa.getByRole("timer")).toHaveText(/^\d\d:\d\d$/, { timeout: 30000 });
  const playing = (page: Page) =>
    page.evaluate(() => [...document.querySelectorAll("video")].some((v) => v.videoWidth > 0 && !v.paused && v.offsetWidth > 300));
  await expect.poll(() => playing(pb), { timeout: 20000 }).toBe(true);

  // A turns the camera off: B no longer sees a picture of A, and sees A's name and picture instead.
  await pa.getByRole("button", { name: "Camera on" }).click();
  await pb.waitForTimeout(3000);
  await expect.poll(() => playing(pb), { timeout: 20000 }).toBe(false);
  await pa.getByRole("button", { name: "Camera off" }).click();
  await expect.poll(() => playing(pb), { timeout: 20000 }).toBe(true);

  // A shares the screen: B is told, and the picture it gets is the screen.
  await pa.getByRole("button", { name: "Share screen" }).click();
  await expect(pa.getByText("You are sharing your screen")).toBeVisible({ timeout: 20000 });
  await expect(pb.getByText(/is sharing a screen/)).toBeVisible({ timeout: 20000 });
  // The big picture is the screen (a wide picture shown whole), not the other side's camera.
  await expect
    .poll(
      () =>
        pb.evaluate(() =>
          [...document.querySelectorAll("video")].some((v) => v.offsetWidth > 300 && getComputedStyle(v).objectFit === "contain" && v.videoWidth > 0),
        ),
      { timeout: 20000 },
    )
    .toBe(true);
  await pa.getByRole("button", { name: "Stop sharing" }).click();
  await expect(pb.getByText(/is sharing a screen/)).toBeHidden({ timeout: 20000 });

  // The devices menu lists what the browser has.
  await pa.getByRole("button", { name: "Devices" }).click();
  await expect(pa.getByRole("menuitem", { name: /Microphone:/ }).first()).toBeVisible();
  await expect(pa.getByRole("menuitem", { name: /Camera:/ }).first()).toBeVisible();
  await pa.keyboard.press("Escape");

  await pa.getByRole("button", { name: "End", exact: true }).click();
  await expect(pb.getByText("Call ended")).toBeVisible({ timeout: 15000 });
  await ctxA.close();
  await ctxB.close();
});

test("the chat keeps a line for each call, and a turned-down or unanswered one says so", async ({ browser }) => {
  const { a, b, pa, pb, ctxA, ctxB } = await twoPeople(browser);
  await pa.getByPlaceholder("Search").fill(b);
  await pa
    .getByRole("button", { name: new RegExp(b) })
    .first()
    .click();
  await pb.getByPlaceholder("Search").fill(a);
  await pb
    .getByRole("button", { name: new RegExp(a) })
    .first()
    .click();
  // B turns the first call down.
  await pa.getByRole("button", { name: "Attach" }).click();
  await pa.getByRole("menuitem", { name: "Voice call" }).click();
  await pa.getByRole("button", { name: "Call", exact: true }).click();
  await openIncoming(pb);
  await pb.getByRole("button", { name: "Decline" }).click();
  await expect(pa.getByText("Call declined")).toBeVisible({ timeout: 15000 });
  await expect(pa.getByText(/You called \(voice call\) · declined/).last()).toBeVisible({ timeout: 15000 });
  await expect(pb.getByText(/called you \(voice call\) · you declined/).last()).toBeVisible({ timeout: 15000 });
  // The second is answered and lasts a moment: the line carries its length.
  await pa.getByRole("button", { name: "Attach" }).click();
  await pa.getByRole("menuitem", { name: "Video call" }).click();
  await pa.getByRole("button", { name: "Start video call" }).click();
  await openIncoming(pb, "video");
  await pb.getByRole("button", { name: "Accept" }).click();
  await expect(pa.getByRole("timer")).toHaveText(/^\d\d:\d\d$/, { timeout: 30000 });
  await pa.waitForTimeout(2200);
  await pa.getByRole("button", { name: "End", exact: true }).click();
  await expect(pa.getByText(/You called \(video call\) · 0\d:\d\d/).last()).toBeVisible({ timeout: 15000 });
  await ctxA.close();
  await ctxB.close();
});

test("a call that is hung up before it is answered ends on the other side too", async ({ browser }) => {
  const { b, pa, pb, ctxA, ctxB } = await twoPeople(browser);
  await pa.getByPlaceholder("Search").fill(b);
  await pa
    .getByRole("button", { name: new RegExp(b) })
    .first()
    .click();
  await pa.getByRole("button", { name: "Attach" }).click();
  await pa.getByRole("menuitem", { name: "Voice call" }).click();
  await pa.getByRole("button", { name: "Call", exact: true }).click();
  await openIncoming(pb);
  // A changes their mind before B answers.
  await pa.getByRole("button", { name: "End", exact: true }).click();
  await expect(pb.getByText("Call cancelled")).toBeVisible({ timeout: 15000 });
  await ctxA.close();
  await ctxB.close();
});

test("an incoming call is the full screen at once; Minimize makes it a small window on the right, which opens it again", async ({ browser }) => {
  const { a, b, pa, pb, ctxA, ctxB } = await twoPeople(browser);
  await pb.getByPlaceholder("Search").fill(a);
  await pb
    .getByRole("button", { name: new RegExp(a) })
    .first()
    .click();
  await pb.getByPlaceholder("Message").fill("half a sentence");
  await pa.getByPlaceholder("Search").fill(b);
  await pa
    .getByRole("button", { name: new RegExp(b) })
    .first()
    .click();
  await pa.getByRole("button", { name: "Attach" }).click();
  await pa.getByRole("menuitem", { name: "Voice call" }).click();
  await pa.getByRole("button", { name: "Call", exact: true }).click();

  // It comes up over everything, with Accept, Decline and the button at the top left.
  await openIncoming(pb);
  await expect(pb.getByRole("button", { name: "Decline" })).toBeVisible();
  await expect(pb.getByRole("button", { name: "Minimize" })).toBeVisible();

  // Minimized, it is a small window on the right and the chat under it is as it was left.
  await pb.getByRole("button", { name: "Minimize" }).click();
  const mini = pb.getByRole("button", { name: "Incoming voice call" });
  await expect(mini).toBeVisible();
  const rect = (await mini.boundingBox())!;
  const view = pb.viewportSize()!;
  expect(rect.width).toBeLessThan(160);
  expect(rect.height).toBeLessThan(200);
  expect(rect.x + rect.width).toBeGreaterThan(view.width - 24);
  await expect(pb.getByRole("button", { name: "Accept" })).toBeHidden();
  await expect(pb.getByPlaceholder("Message")).toHaveValue("half a sentence");

  // Pressing it opens the screen again; accept from there.
  await mini.click();
  await pb.getByRole("button", { name: "Accept" }).click();
  await expect(pb.getByRole("timer")).toHaveText(/^\d\d:\d\d$/, { timeout: 30000 });

  // Minimized while the call is on, it shows the clock and the call goes on.
  await pb.getByRole("button", { name: "Minimize" }).click();
  const small = pb.getByRole("button", { name: "Open call" });
  await expect(small).toBeVisible();
  await expect(small).toContainText(/\d\d:\d\d/);
  await small.click();
  await pb.getByRole("button", { name: "End", exact: true }).click();
  await expect(pb.getByText("Call ended")).toBeVisible({ timeout: 15000 });
  await expect(pb.getByPlaceholder("Message")).toHaveValue("half a sentence", { timeout: 10000 });
  await ctxA.close();
  await ctxB.close();
});

test("the small call window can be dragged and keeps where it was put, against the nearer side", async ({ browser }) => {
  const { b, pa, pb, ctxA, ctxB } = await twoPeople(browser);
  await pa.getByPlaceholder("Search").fill(b);
  await pa
    .getByRole("button", { name: new RegExp(b) })
    .first()
    .click();
  await pa.getByRole("button", { name: "Attach" }).click();
  await pa.getByRole("menuitem", { name: "Voice call" }).click();
  await pa.getByRole("button", { name: "Call", exact: true }).click();
  await openIncoming(pb);
  await pb.getByRole("button", { name: "Minimize" }).click();
  const mini = pb.getByRole("button", { name: "Incoming voice call" });
  await expect(mini).toBeVisible();
  const view = pb.viewportSize()!;
  const before = (await mini.boundingBox())!;
  // Drag it to the lower left.
  await pb.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await pb.mouse.down();
  await pb.mouse.move(60, view.height - 160, { steps: 8 });
  await pb.mouse.up();
  await pb.waitForTimeout(600);
  const after = (await mini.boundingBox())!;
  expect(after.x).toBeLessThan(20); // settled against the left side
  expect(after.y).toBeGreaterThan(before.y + 200);
  // A drag does not open it.
  await expect(pb.getByRole("button", { name: "Accept" })).toBeHidden();
  // Ending the call from the other side removes it.
  await pa.getByRole("button", { name: "End", exact: true }).click();
  await expect(pb.getByText("Call cancelled")).toBeVisible({ timeout: 15000 });
  await ctxA.close();
  await ctxB.close();
});

test("an incoming call can be declined from its screen, and a call I place is the full screen too", async ({ browser }) => {
  const { b, pa, pb, ctxA, ctxB } = await twoPeople(browser);
  await pa.getByPlaceholder("Search").fill(b);
  await pa
    .getByRole("button", { name: new RegExp(b) })
    .first()
    .click();
  await pa.getByRole("button", { name: "Attach" }).click();
  await pa.getByRole("menuitem", { name: "Video call" }).click();
  await pa.getByRole("button", { name: "Start video call" }).click();
  // Mine is the full screen at once (with the button to make it small), saying who is being called; B's is the full screen as well.
  await expect(pa.getByRole("button", { name: "Minimize" })).toBeVisible({ timeout: 15000 });
  await expect(pa.getByText(b, { exact: true }).last()).toBeVisible();
  await expect(pa.getByText("?", { exact: true })).toBeHidden();
  await openIncoming(pb, "video");
  await pb.getByRole("button", { name: "Decline" }).click();
  await expect(pa.getByText("Call declined")).toBeVisible({ timeout: 15000 });
  await ctxA.close();
  await ctxB.close();
});

test("the devices menu keeps long names whole: each row is as tall as its text, and no two rows overlap", async ({ browser }) => {
  const { a, b, ctxA, ctxB, pb } = await twoPeople(browser);
  // A signs in again in a browser that lists devices with the long names real machines have.
  const ctxL = await browser.newContext({ viewport: { width: 420, height: 800 } });
  await ctxL.addInitScript(() => {
    const mics = [
      "Default - Microphone Array (Intel® Smart Sound Technology for Digital Microphones)",
      "Communications - Headset Microphone (Realtek High Definition Audio(SST))",
      "USB Audio Device Pro Studio Condenser Microphone (046d:0825)",
    ];
    const cams = ["Integrated Camera: Integrated C (04f2:b6cb)", "OBS Virtual Camera - 1080p60 Virtual Output Device With A Long Name"];
    const real = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
    navigator.mediaDevices.enumerateDevices = async () =>
      [
        ...mics.map((label, i) => ({ deviceId: `m${i}`, kind: "audioinput", label, groupId: "g" })),
        ...cams.map((label, i) => ({ deviceId: `c${i}`, kind: "videoinput", label, groupId: "g" })),
        ...(await real()).filter((d) => d.kind === "audiooutput"),
      ] as MediaDeviceInfo[];
  });
  const fresh = await ctxL.newPage();
  await fresh.goto("/");
  await fresh.getByText("Sign in to your Matrix account").waitFor();
  const inputs = fresh.locator("input");
  await inputs.nth(1).fill(a);
  await inputs.nth(2).fill("pw12345");
  await inputs.nth(2).press("Enter");
  await expect(fresh.getByPlaceholder("Search")).toBeVisible({ timeout: 20000 });
  await fresh.getByPlaceholder("Search").fill(b);
  await fresh
    .getByRole("button", { name: new RegExp(b) })
    .first()
    .click();
  await fresh.getByRole("button", { name: "Attach" }).click();
  await fresh.getByRole("menuitem", { name: "Video call" }).click();
  await fresh.getByRole("button", { name: "Start video call" }).click();
  await openIncoming(pb, "video");
  await pb.getByRole("button", { name: "Accept" }).click();
  await expect(fresh.getByRole("timer")).toHaveText(/^\d\d:\d\d$/, { timeout: 30000 });

  await fresh.getByRole("button", { name: "Devices" }).click();
  const rows = fresh.getByRole("menuitem");
  await expect(rows).toHaveCount(5);
  const boxes: { y: number; height: number; text: string }[] = [];
  for (let i = 0; i < 5; i++) {
    const row = rows.nth(i);
    const box = (await row.boundingBox())!;
    // The text is all there: it does not run past its row.
    const text = (await row.innerText()).trim();
    const overflow = await row.evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(overflow, text).toBeLessThanOrEqual(1);
    boxes.push({ y: box.y, height: box.height, text });
  }
  // The long ones are taller than a one-line row, and no row starts above where the one before it ends.
  expect(Math.max(...boxes.map((x) => x.height))).toBeGreaterThan(40);
  for (let i = 1; i < boxes.length; i++) expect(boxes[i]!.y).toBeGreaterThanOrEqual(boxes[i - 1]!.y + boxes[i - 1]!.height - 1);
  await fresh.screenshot({ path: "/tmp/devices_menu.png" });
  await fresh.keyboard.press("Escape");
  await fresh.getByRole("button", { name: "End", exact: true }).click();
  await ctxL.close();
  await ctxA.close();
  await ctxB.close();
});
