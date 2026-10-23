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

  await pa.getByRole("button", { name: "Mute" }).click();
  await expect(pa.getByRole("button", { name: "Unmute" })).toBeVisible();
  // The browser has no earpiece to choose: the phone's speaker button is not there.
  await expect(pa.getByRole("button", { name: "Speaker" })).toHaveCount(0);

  await pb.getByRole("button", { name: "End", exact: true }).click();
  await expect(pb.getByText("Call ended")).toBeVisible();
  await expect(pa.getByText("Call ended")).toBeVisible({ timeout: 15000 });
  await expect(pa.getByRole("timer")).toBeHidden({ timeout: 10000 });
  await ctxA.close();
  await ctxB.close();
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
  await pa.getByRole("button", { name: "Camera off" }).click();
  await expect(pa.getByRole("button", { name: "Camera on" })).toBeVisible();
  await pa.getByRole("button", { name: "End", exact: true }).click();
  await expect(pb.getByText("Call ended")).toBeVisible({ timeout: 15000 });
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
  await pa.getByRole("button", { name: "Camera off" }).click();
  await pb.waitForTimeout(3000);
  await expect.poll(() => playing(pb), { timeout: 20000 }).toBe(false);
  await pa.getByRole("button", { name: "Camera on" }).click();
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
