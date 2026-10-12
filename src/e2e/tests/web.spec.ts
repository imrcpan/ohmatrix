import { createHmac } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const shot = (page: Page, name: string) => page.screenshot({ path: `.out/${name}.png` });

/** Opens a chat by name through the search box (the list is virtualised and grows with every run). */
async function openRoom(page: Page, name: string, row: RegExp = new RegExp(name)) {
  const search = page.getByPlaceholder("Search");
  await search.fill(name);
  await page.getByRole("button", { name: row }).first().click();
  await search.fill("");
}

/** Searches the people picker in the open dialog and taps the result. */
async function pickPerson(page: Page, query: string, name: string) {
  await page
    .getByPlaceholder(/^Name or user id/)
    .last()
    .fill(query);
  await page.getByRole("button", { name, exact: true }).last().click();
}

async function login(page: Page) {
  await page.goto("/");
  await page.getByText("Sign in to your Matrix account").waitFor();
  const inputs = page.locator("input");
  await inputs.nth(1).fill("test");
  await inputs.nth(2).fill("123456");
  await inputs.nth(2).press("Enter");
  await expect(page.getByPlaceholder("Search")).toBeVisible({ timeout: 20000 });
}

test("landscape: login, two-pane, send message", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await shot(page, "01-login-landscape");
  await login(page);
  await shot(page, "02-list-landscape");
  await openRoom(page, "OhMatrix Dev");
  await expect(page.getByText(/Backlog message #30/)).toBeVisible();
  await shot(page, "03-chat-landscape");
  // Writes go to a scratch room so the seeded dev room stays stable for scroll/pagination tests.
  await openRoom(page, "Notes to self");
  const msg = `hello from e2e ${Date.now()}`;
  await page.getByPlaceholder("Message").fill(msg);
  await page.getByPlaceholder("Message").press("Enter");
  await expect(page.getByText(msg, { exact: true })).toBeVisible();
});

test("portrait: list → chat → back via UI and browser history", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await shot(page, "04-list-portrait");
  await openRoom(page, "OhMatrix Dev");
  await expect(page.getByPlaceholder("Message")).toBeVisible();
  await page.waitForTimeout(500);
  await shot(page, "05-chat-portrait");
  await page.goBack();
  await expect(page.getByPlaceholder("Message")).toBeHidden();
});

test("scrolling up paginates older history (wheel direction is natural)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  await openRoom(page, "OhMatrix Dev");
  await expect(page.getByText(/Backlog message #30/)).toBeVisible();
  await page.mouse.move(850, 400);
  for (let i = 0; i < 25; i++) {
    await page.mouse.wheel(0, -800);
    await page.waitForTimeout(120);
  }
  await expect(page.getByText(/Welcome to the OhMatrix dev room/)).toBeVisible({ timeout: 10000 });
  await shot(page, "06-scrolled-up");
});

test("dark theme", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  await openRoom(page, "alice", /^alice/);
  await expect(page.getByText("Direct chat")).toBeVisible();
  await shot(page, "07-dark-landscape");
});

test("avatars and image messages load through authenticated media", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  await openRoom(page, "OhMatrix Dev");
  await expect(page.getByText("Nice shot!").last()).toBeVisible();
  // Room avatar, sender avatars and the photo are blob: URLs fetched with the access token.
  await expect.poll(() => page.locator('img[src^="blob:"]').count(), { timeout: 10000 }).toBeGreaterThanOrEqual(3);
  const loaded = await page.locator('img[src^="blob:"]').evaluateAll((els) => els.every((e) => (e as HTMLImageElement).naturalWidth > 0));
  expect(loaded).toBe(true);
  await shot(page, "08-media");
});

async function registerUser(name: string, password: string) {
  const { nonce } = (await (await fetch("http://localhost:8008/_synapse/admin/v1/register")).json()) as { nonce: string };
  const mac = createHmac("sha1", "ohmatrix-dev-secret").update(`${nonce}\0${name}\0${password}\0notadmin`).digest("hex");
  const r = await fetch("http://localhost:8008/_synapse/admin/v1/register", {
    method: "POST",
    body: JSON.stringify({ nonce, username: name, password, admin: false, mac }),
  });
  if (!r.ok) throw new Error(await r.text());
}

async function loginAs(page: Page, user: string, password: string) {
  await page.goto("/");
  await page.getByText("Sign in to your Matrix account").waitFor();
  const inputs = page.locator("input");
  await inputs.nth(1).fill(user);
  await inputs.nth(2).fill(password);
  await inputs.nth(2).press("Enter");
}

test("encryption: set up on device 1, verify device 2 with the recovery key", async ({ browser }) => {
  const user = `ui${Date.now().toString(36)}`;
  await registerUser(user, "pw12345");

  const ctx1 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p1 = await ctx1.newPage();
  await loginAs(p1, user, "pw12345");
  await expect(p1.getByText("Set up encryption to read and send secure messages")).toBeVisible({ timeout: 30000 });
  await p1.getByRole("button", { name: "Set up", exact: true }).click();
  await p1.locator("input[type=password]").fill("pw12345");
  await p1.getByRole("button", { name: "Set up", exact: true }).last().click();
  await expect(p1.getByText("Save your recovery key")).toBeVisible({ timeout: 30000 });
  const key = (
    await p1
      .getByText(/^EsT?[A-Za-z0-9]{2}( [A-Za-z0-9]{4}){10,}/)
      .first()
      .innerText()
  ).trim();
  expect(key.length).toBeGreaterThan(40);
  await shot(p1, "09-recovery-key");
  await p1.getByRole("button", { name: "I have saved it" }).click();
  await expect(p1.getByText("Set up encryption to read and send secure messages")).toBeHidden();
  await ctx1.close();

  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p2 = await ctx2.newPage();
  await loginAs(p2, user, "pw12345");
  await expect(p2.getByText("Verify this device to read your encrypted history")).toBeVisible({ timeout: 30000 });
  await p2.getByRole("button", { name: "Verify", exact: true }).click();
  await p2.locator("input").last().fill("EsTc 1234 5678");
  await p2.getByRole("button", { name: "Verify", exact: true }).last().click();
  await expect(p2.getByText("Invalid recovery key")).toBeVisible();
  await shot(p2, "10-verify-error");
  await p2.locator("input").last().fill(key);
  await p2.getByRole("button", { name: "Verify", exact: true }).last().click();
  await expect(p2.getByText("Verify this device to read your encrypted history")).toBeHidden({ timeout: 30000 });
  await ctx2.close();
});

async function inviteTest(inviter: string, roomName: string) {
  const login = (await (
    await fetch("http://localhost:8008/_matrix/client/v3/login", {
      method: "POST",
      body: JSON.stringify({ type: "m.login.password", identifier: { type: "m.id.user", user: inviter }, password: "123456" }),
    })
  ).json()) as { access_token: string };
  const r = await fetch("http://localhost:8008/_matrix/client/v3/createRoom", {
    method: "POST",
    headers: { authorization: `Bearer ${login.access_token}` },
    body: JSON.stringify({ name: roomName, preset: "private_chat", invite: ["@test:localhost"] }),
  });
  if (!r.ok) throw new Error(await r.text());
}

test("invitations: accept joins the room, decline removes it", async ({ page }) => {
  const stamp = Date.now().toString(36);
  const yes = `Join me ${stamp}`,
    no = `Spam ${stamp}`;
  await inviteTest("alice", yes);
  await inviteTest("bob", no);
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  const rowYes = page.getByRole("button", { name: new RegExp(yes) });
  const rowNo = page.getByRole("button", { name: new RegExp(no) });
  await expect(rowYes).toBeVisible({ timeout: 15000 });
  await expect(rowYes).toContainText("Invitation from alice");
  await shot(page, "11-invites");
  await rowNo.getByRole("button", { name: "Decline" }).click();
  await expect(rowNo).toBeHidden();
  await rowYes.getByRole("button", { name: "Accept" }).click();
  await expect(page.getByPlaceholder("Message")).toBeVisible({ timeout: 15000 });
  await expect(rowYes).not.toContainText("Invitation from");
});

test("reactions: right-click a message, react, toggle off via the chip", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  await openRoom(page, "Notes to self");
  const text = `react to me ${Date.now()}`;
  await page.getByPlaceholder("Message").fill(text);
  await page.getByPlaceholder("Message").press("Enter");
  const msg = page.getByText(text, { exact: true });
  await expect(msg).toBeVisible();
  await msg.click({ button: "right" });
  await shot(page, "12-menu");
  await page.getByRole("button", { name: "React 😂" }).click();
  const chip = page.getByRole("button", { name: "😂 1" });
  await expect(chip).toBeVisible({ timeout: 10000 });
  await shot(page, "13-reaction");
  await chip.click();
  await expect(chip).toBeHidden({ timeout: 10000 });
});

test("replies: reply from the context menu shows a quote in the bubble", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  await openRoom(page, "Notes to self");
  const stamp = Date.now();
  const q = `question ${stamp}`,
    a = `answer ${stamp}`;
  const box = page.getByPlaceholder("Message");
  await box.fill(q);
  await box.press("Enter");
  const qMsg = page.getByText(q, { exact: true });
  await expect(qMsg).toBeVisible();
  await qMsg.click({ button: "right" });
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cancel reply" })).toBeVisible();
  await box.fill(a);
  await box.press("Enter");
  await expect(page.getByText(a, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel reply" })).toBeHidden();
  // The quoted original is rendered inside the reply bubble (a second occurrence of `q`).
  await expect(page.getByText(q, { exact: true })).toHaveCount(2, { timeout: 10000 });
  await shot(page, "14-reply");
});

test("edit and delete own messages", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  await openRoom(page, "Notes to self");
  const stamp = Date.now();
  const before = `typo ${stamp}`,
    after = `fixed ${stamp}`;
  const box = page.getByPlaceholder("Message");
  await box.fill(before);
  await box.press("Enter");
  await page.getByText(before, { exact: true }).click({ button: "right" });
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(box).toHaveValue(before);
  await box.fill(after);
  await box.press("Enter");
  await expect(page.getByText(after, { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(before, { exact: true })).toBeHidden({ timeout: 20000 });
  await expect(page.getByText(/^edited /).last()).toBeVisible();
  await shot(page, "15-edited");
  await page.getByText(after, { exact: true }).click({ button: "right" });
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).last().click();
  await expect(page.getByText(after, { exact: true })).toBeHidden({ timeout: 10000 });
});

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function attach(page: Page, file: { name: string; mimeType: string; buffer: Buffer }) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Attach" }).click();
  await (await chooser).setFiles(file);
}

test("attachments: send an image and a file, download the file", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  await openRoom(page, "Notes to self");
  const name = `notes-${Date.now()}.txt`;
  await attach(page, { name: "dot.png", mimeType: "image/png", buffer: PNG });
  await attach(page, { name, mimeType: "text/plain", buffer: Buffer.from("hello file") });
  await expect(page.getByRole("button", { name, exact: true })).toBeVisible({ timeout: 15000 });
  await expect
    .poll(() => page.locator('img[src^="blob:"]').evaluateAll((els) => els.some((e) => (e as HTMLImageElement).naturalWidth > 0)), { timeout: 15000 })
    .toBe(true);
  await shot(page, "16-attachments");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name, exact: true }).click();
  const d = await download;
  expect(d.suggestedFilename()).toBe(name);
  expect((await (await import("node:fs/promises")).readFile(await d.path()!)).toString()).toBe("hello file");
});

test("attachments in an encrypted room are encrypted end to end", async ({ page }) => {
  const user = `ue${Date.now().toString(36)}`;
  await registerUser(user, "pw12345");
  const login = (await (
    await fetch("http://localhost:8008/_matrix/client/v3/login", {
      method: "POST",
      body: JSON.stringify({ type: "m.login.password", identifier: { type: "m.id.user", user }, password: "pw12345" }),
    })
  ).json()) as { access_token: string };
  await fetch("http://localhost:8008/_matrix/client/v3/createRoom", {
    method: "POST",
    headers: { authorization: `Bearer ${login.access_token}` },
    body: JSON.stringify({
      name: "Secret files",
      preset: "private_chat",
      initial_state: [{ type: "m.room.encryption", state_key: "", content: { algorithm: "m.megolm.v1.aes-sha2" } }],
    }),
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await loginAs(page, user, "pw12345");
  await openRoom(page, "Secret files");
  await expect(page.getByPlaceholder("Message")).toBeVisible();
  await page.waitForTimeout(1500);
  const uploads: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/media/v3/upload")) uploads.push(r.postDataBuffer()?.subarray(0, 8).toString("hex") ?? "");
  });
  await attach(page, { name: "dot.png", mimeType: "image/png", buffer: PNG });
  await expect
    .poll(() => page.locator('img[src^="blob:"]').evaluateAll((els) => els.some((e) => (e as HTMLImageElement).naturalWidth > 0)), { timeout: 20000 })
    .toBe(true);
  expect(uploads.length).toBeGreaterThan(0);
  expect(uploads[0]).not.toBe("89504e470d0a1a0a"); // the uploaded bytes must not be a plain PNG
  await shot(page, "17-encrypted-attachment");
});

async function apiLogin(user: string) {
  const r = (await (
    await fetch("http://localhost:8008/_matrix/client/v3/login", {
      method: "POST",
      body: JSON.stringify({ type: "m.login.password", identifier: { type: "m.id.user", user }, password: "123456" }),
    })
  ).json()) as { access_token: string };
  return r.access_token;
}
const api = (token: string, method: string, path: string, body?: unknown) =>
  fetch(`http://localhost:8008/_matrix/client/v3${path}`, {
    method,
    headers: { authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : null,
  }).then((r) => r.json()) as Promise<Record<string, string>>;

test("unread: badge, then a New messages divider above the first unread", async ({ page }) => {
  const [alice, me] = [await apiLogin("alice"), await apiLogin("test")];
  const name = `Unread ${Date.now().toString(36)}`;
  const { room_id } = await api(alice, "POST", "/createRoom", { name, preset: "private_chat", invite: ["@test:localhost"] });
  await api(me, "POST", `/join/${encodeURIComponent(room_id)}`, {});
  for (const body of ["old one", "old two"])
    await api(alice, "PUT", `/rooms/${encodeURIComponent(room_id)}/send/m.room.message/o${body.length}${Date.now()}`, { msgtype: "m.text", body });
  await api(
    me,
    "POST",
    `/rooms/${encodeURIComponent(room_id)}/receipt/m.read/${encodeURIComponent(((await api(me, "GET", `/rooms/${encodeURIComponent(room_id)}/messages?dir=b&limit=1`)) as unknown as { chunk: { event_id: string }[] }).chunk[0]!.event_id)}`,
    {},
  );
  for (const body of ["fresh one", "fresh two", "fresh three"])
    await api(alice, "PUT", `/rooms/${encodeURIComponent(room_id)}/send/m.room.message/n${body.length}${Date.now()}`, { msgtype: "m.text", body });

  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  const row = page.getByRole("button", { name: new RegExp(name) });
  await expect(row).toContainText("3", { timeout: 15000 });
  await row.click();
  await expect(page.getByText("New messages", { exact: true })).toBeVisible({ timeout: 10000 });
  await shot(page, "18-unread-divider");
  const divY = (await page.getByText("New messages", { exact: true }).boundingBox())!.y;
  expect((await page.getByText("fresh one", { exact: true }).last().boundingBox())!.y).toBeGreaterThan(divY);
  expect((await page.getByText("old two", { exact: true }).last().boundingBox())!.y).toBeLessThan(divY);
});

test("profile and settings: navigation, theme, language, sign out", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await expect(page.getByText("@test:localhost").first()).toBeVisible();
  await expect(page.getByText("http://localhost:8008")).toBeVisible();
  await shot(page, "19-profile");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByText("Appearance")).toBeVisible();
  await page.getByRole("button", { name: "Sakura" }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("ohmatrix.prefs.v1") ?? "{}").theme)).toBe("sakura");
  await shot(page, "20-settings-sakura");
  // Language is a dropdown: one row showing the current language, options in a menu (native names, never translated).
  await expect(page.getByRole("button", { name: "简体中文" })).toHaveCount(0);
  await page.getByRole("button", { name: "Language", exact: true }).click();
  await shot(page, "29-language-menu");
  await expect(page.getByRole("menuitem", { name: "English" })).toBeVisible();
  await page.getByRole("menuitem", { name: "简体中文" }).click();
  await expect(page.getByText("外观")).toBeVisible();
  await expect(page.getByRole("button", { name: "语言", exact: true })).toContainText("简体中文"); // the row shows the current language in its own language
  await page.reload();
  await page
    .getByText("外观")
    .waitFor({ timeout: 15000 })
    .catch(() => {});
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("ohmatrix.prefs.v1") ?? "{}"))).toMatchObject({ theme: "sakura", locale: "zh-CN" });
  await expect(page.getByText("设置").first()).toBeVisible();
  await page.getByRole("button", { name: "语言", exact: true }).click();
  await page.getByRole("menuitem", { name: "English" }).click();
  await page.getByRole("button", { name: "Light" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("button", { name: "Sign out" }).last().click();
  await expect(page.getByText("Sign in to your Matrix account")).toBeVisible();
});

test("add menu: new chat, new group, join room", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  await page.getByRole("button", { name: "New", exact: true }).click();
  await shot(page, "21-add-menu");
  await page.getByRole("menuitem", { name: "New chat" }).click();
  await page.getByPlaceholder(/^Name or user id/).fill("@nobody-here:localhost");
  await expect(page.getByText("No people found")).toBeVisible({ timeout: 10000 });
  await page.getByPlaceholder(/^Name or user id/).fill("bob");
  await shot(page, "30-people-search");
  await page.getByRole("button", { name: "bob", exact: true }).last().click();
  await expect(page.getByPlaceholder("Message")).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("Direct chat")).toBeVisible();

  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("menuitem", { name: "New group" }).click();
  const group = `Team ${Date.now().toString(36)}`;
  await page.getByText("Group name").locator("..").locator("input").last().fill(group);
  await pickPerson(page, "bob", "bob");
  await pickPerson(page, "ali", "alice");
  await expect(page.getByRole("button", { name: "Remove bob" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove alice" })).toBeVisible();
  await page.getByRole("button", { name: "Remove bob" }).click(); // chips can be removed again
  await expect(page.getByRole("button", { name: "Remove bob" })).toBeHidden();
  await pickPerson(page, "bob", "bob");
  await shot(page, "31-group-picker");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByText(group).first()).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Chat info" }).click();
  await expect(page.getByText("Members · 3")).toBeVisible({ timeout: 10000 }); // me + two invited
  await page.getByRole("button", { name: "Close" }).click();

  const alice = await apiLogin("alice");
  const pub = await api(alice, "POST", "/createRoom", { name: `Open ${Date.now().toString(36)}`, preset: "public_chat" });
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("menuitem", { name: "Join room" }).click();
  await page.getByPlaceholder("#room:server").fill(pub.room_id!);
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page.getByPlaceholder("Message")).toBeVisible({ timeout: 15000 });
});

test("room context menu: pin and mark as unread (right-click)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  const row = page.getByRole("button", { name: /^NT Notes to self|Notes to self/ }).first();
  await row.click({ button: "right" });
  await shot(page, "22-room-menu");
  await page.getByRole("menuitem", { name: "Pin" }).click();
  // Pinned chats lead the list (after invitations) and show a pin glyph.
  // Invitations always sort above pinned chats, so skip them.
  const firstRowName = () =>
    page
      .getByRole("button")
      .filter({ hasText: /Notes to self|OhMatrix Dev|alice|bob|scratch|Join me|Team|Unread/ })
      .filter({ hasNotText: /Invitation from/ })
      .first()
      .innerText();
  await expect.poll(firstRowName, { timeout: 10000 }).toContain("Notes to self");
  await row.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Unpin" }).click();

  // Mark as unread shows a dot; opening the chat clears it.
  await page.getByPlaceholder("Search").fill("OhMatrix Dev"); // the list is virtualised; filter to keep the row rendered
  await page
    .getByRole("button", { name: /OhMatrix Dev/ })
    .first()
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Mark as unread" }).click();
  await expect(page.getByLabel("Marked unread")).toBeVisible({ timeout: 10000 });
  await page
    .getByRole("button", { name: /OhMatrix Dev/ })
    .first()
    .click();
  await expect(page.getByLabel("Marked unread")).toBeHidden({ timeout: 10000 });
});

test("landscape: drag the chat list border to resize; width persists; double-click resets", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  const sidebarRight = async () => {
    const b = (await page.getByLabel("Resize chat list").boundingBox())!;
    return b.x + b.width / 2;
  };
  const prefs = () => page.evaluate(() => JSON.parse(localStorage.getItem("ohmatrix.prefs.v1") ?? "{}") as { sidebarWidth?: number | null });
  const initial = await sidebarRight();
  expect(Math.abs(initial - 384)).toBeLessThan(6); // 30% of 1280

  await page.mouse.move(initial, 400);
  await page.mouse.down();
  await page.mouse.move(initial + 60, 400, { steps: 5 });
  await page.mouse.move(initial + 110, 400, { steps: 5 });
  await page.mouse.up();
  await expect.poll(sidebarRight).toBeGreaterThan(initial + 90);
  await expect.poll(async () => (await prefs()).sidebarWidth).toBeGreaterThan(initial + 90);
  await shot(page, "23-resized");

  await page.reload();
  await page.getByPlaceholder("Search").waitFor({ timeout: 20000 });
  expect(await sidebarRight()).toBeGreaterThan(initial + 90);

  // Limits: cannot be dragged beyond the maximum (520px) or below the minimum (260px).
  const x = await sidebarRight();
  await page.mouse.move(x, 400);
  await page.mouse.down();
  await page.mouse.move(1000, 400, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await prefs()).sidebarWidth).toBe(520);
  const x2 = await sidebarRight();
  await page.mouse.move(x2, 400);
  await page.mouse.down();
  await page.mouse.move(50, 400, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await prefs()).sidebarWidth).toBe(260);

  await page.mouse.dblclick(await sidebarRight(), 400);
  await expect.poll(async () => (await prefs()).sidebarWidth).toBeNull();
  await expect.poll(sidebarRight).toBeGreaterThan(378);
});

test("portrait: profile and settings push full screen; browser back pops them", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await expect(page.getByText("@test:localhost").first()).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByText("Appearance")).toBeVisible();
  await page.waitForTimeout(450);
  await shot(page, "24-settings-portrait");
  await page.goBack();
  await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByPlaceholder("Search")).toBeVisible();
});

/** Records the x of the element with the given aria-label on every animation frame for `ms`. */
function trackX(page: Page, label: string, ms: number): Promise<number[]> {
  return page.evaluate(
    ([l, duration]) =>
      new Promise<number[]>((resolve) => {
        const xs: number[] = [];
        const t0 = performance.now();
        const tick = () => {
          const el = document.querySelector(`[aria-label="${l}"]`);
          if (el) xs.push(el.getBoundingClientRect().x);
          if (performance.now() - t0 < (duration as number)) requestAnimationFrame(tick);
          else resolve(xs);
        };
        tick();
      }),
    [label, ms] as const,
  );
}

test("profile opens like a drawer: slides in from left to right", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  const click = page.getByRole("button", { name: "Profile", exact: true }).click();
  const xs = await trackX(page, "Settings", 700);
  await click;
  expect(xs.length).toBeGreaterThan(4);
  const final = xs[xs.length - 1]!;
  expect(Math.min(...xs)).toBeLessThan(final - 40); // starts well to the left of its resting place
  for (let i = 1; i < xs.length; i++) expect(xs[i]!).toBeGreaterThanOrEqual(xs[i - 1]! - 1); // moves rightwards only

  // Settings pushes in from the right, over the profile page.
  const settings = page.getByRole("button", { name: "Settings", exact: true }).click();
  const sx = await trackX(page, "Sign out", 700);
  await settings;
  expect(sx.length).toBeGreaterThan(4);
  const sfinal = sx[sx.length - 1]!;
  expect(Math.max(...sx)).toBeGreaterThan(sfinal + 40);
  for (let i = 1; i < sx.length; i++) expect(sx[i]!).toBeLessThanOrEqual(sx[i - 1]! + 1);
  await page.getByRole("button", { name: "Profile", exact: true }).last().click();
});

test("chat info: slides in from the right, shows members, leave group", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  // A fresh group so leaving it does not disturb other tests.
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("menuitem", { name: "New group" }).click();
  const group = `Leave ${Date.now().toString(36)}`;
  await page.getByText("Group name").locator("..").locator("input").last().fill(group);
  await pickPerson(page, "bob", "bob");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByPlaceholder("Message")).toBeVisible({ timeout: 15000 });

  const info = page.getByRole("button", { name: "Chat info" });
  const marker = () => page.getByText("Group info", { exact: true });
  await expect(marker()).toBeHidden();
  await info.click();
  // Slides in from the right: the panel's left edge moves leftwards to its resting place.
  const xs: number[] = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 600) {
    const b = await marker()
      .boundingBox()
      .catch(() => null);
    if (b) xs.push(b.x);
    await page.waitForTimeout(25);
  }
  expect(xs.length).toBeGreaterThan(3);
  expect(xs[0]!).toBeGreaterThan(xs[xs.length - 1]! + 40);
  for (let i = 1; i < xs.length; i++) expect(xs[i]!).toBeLessThanOrEqual(xs[i - 1]! + 1);
  await expect(page.getByText("Members · 2")).toBeVisible();
  await expect(page.getByText("@bob:localhost")).toBeVisible();
  await expect(page.getByText("Invited", { exact: true })).toBeVisible();
  await expect(page.getByText("Admin", { exact: true })).toBeVisible();
  await shot(page, "25-chat-info");

  await page.getByRole("button", { name: "Close" }).click();
  await expect(marker()).toBeHidden({ timeout: 5000 });
  await info.click();
  await page.getByRole("button", { name: "Leave group" }).click();
  await shot(page, "26-leave-confirm");
  await page.getByRole("button", { name: "Leave group" }).last().click();
  await expect(page.getByPlaceholder("Message")).toBeHidden({ timeout: 15000 });
  await expect(page.getByRole("button", { name: new RegExp(group) })).toBeHidden({ timeout: 15000 });
});

test("chat info: one-to-one chat shows Delete chat; portrait uses a full-screen overlay with back", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await openRoom(page, "alice", /^alice/);
  await page.getByRole("button", { name: "Chat info" }).click();
  await expect(page.getByText("User info", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete chat" })).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, "27-chat-info-portrait");
  await page.goBack();
  await expect(page.getByText("User info", { exact: true })).toBeHidden({ timeout: 5000 });
  await expect(page.getByPlaceholder("Message")).toBeVisible();
});

test("chat list rows have a fixed height and truncate previews with three dots", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  await openRoom(page, "Notes to self");
  const long = `This is a very long preview message that cannot possibly fit on a single line of the chat list ${Date.now()}`;
  const box = page.getByPlaceholder("Message");
  await box.fill(long);
  await box.press("Enter");
  await expect(page.getByText(long, { exact: true })).toBeVisible();
  const row = page.getByRole("button", { name: /^Notes to self|^NT Notes to self/ }).first();
  await expect(row).toContainText("...", { timeout: 10000 });
  const text = await row.innerText();
  expect(text).not.toContain("…");
  expect(text).toMatch(/You: This is a very long.*\.\.\./s);
  // Every ordinary row (non-invitation) is exactly the same height, however long its text is.
  const heights = await page
    .getByRole("button")
    .evaluateAll((els) =>
      els
        .filter(
          (e) =>
            /\d{1,2}:\d{2}|\bAM\b|\bPM\b/.test((e as HTMLElement).innerText) &&
            !/Invitation from/.test((e as HTMLElement).innerText) &&
            (e as HTMLElement).getBoundingClientRect().x < 100,
        )
        .map((e) => Math.round((e as HTMLElement).getBoundingClientRect().height)),
    );
  expect(heights.length).toBeGreaterThan(3);
  expect(new Set(heights).size).toBe(1);
  await shot(page, "28-fixed-rows");
});

test("signing in again after sign-out (new device) works and old crypto stores are removed", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const stores = () =>
    page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name ?? "").filter((n) => n.startsWith("ohmatrix-") && n !== "ohmatrix-secure"));
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await expect.poll(async () => (await stores()).length).toBeGreaterThan(0);
  const first = await stores();
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("button", { name: "Sign out" }).last().click();
  await expect(page.getByText("Sign in to your Matrix account")).toBeVisible({ timeout: 20000 });
  await expect.poll(async () => (await stores()).filter((n) => first.includes(n)).length, { timeout: 10000 }).toBe(0);
  // A second login is a new device; it must come up cleanly, with its own store.
  const inputs = page.locator("input");
  await inputs.nth(1).fill("test");
  await inputs.nth(2).fill("123456");
  await inputs.nth(2).press("Enter");
  await expect(page.getByPlaceholder("Search")).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole("button", { name: "Profile", exact: true })).toBeVisible();
  await expect.poll(async () => (await stores()).length).toBeGreaterThan(0);
  expect(errors.filter((m) => /account in the store/.test(m))).toEqual([]);
});

test("typing indicator and read receipts between two people", async ({ browser }) => {
  const mk = async (user: string) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await loginAs(page, user, "123456");
    await expect(page.getByPlaceholder("Search")).toBeVisible({ timeout: 20000 });
    return { ctx, page };
  };
  const me = await mk("test");
  const alice = await mk("alice");
  await openRoom(me.page, "alice"); // the seeded one-to-one chat, from test's side (search keeps only rooms named alice)
  await openRoom(alice.page, "test");

  // alice starts typing: test sees "typing..." in the header and in the chat list preview.
  await alice.page.getByPlaceholder("Message").pressSequentially("hel", { delay: 60 });
  await expect(me.page.getByText("typing...").first()).toBeVisible({ timeout: 10000 });
  await shot(me.page, "32-typing");
  // ...and it disappears when alice stops (clears the field → blur/stop).
  await alice.page.getByPlaceholder("Message").fill("");
  await alice.page.getByPlaceholder("Message").blur();
  await expect(me.page.getByText("typing...")).toHaveCount(0, { timeout: 10000 });

  // Receipts: test's message shows a single check until alice has read it, then a double check.
  const text = `receipt ${Date.now()}`;
  await alice.page.goto("/"); // alice leaves the chat view so she has not read it yet
  await me.page.getByPlaceholder("Message").fill(text);
  await me.page.getByPlaceholder("Message").press("Enter");
  await expect(me.page.getByText(text, { exact: true }).last()).toBeVisible();
  const readBefore = await me.page.getByLabel("Read").count(); // earlier messages may already be read
  await openRoom(alice.page, "test");
  await expect(alice.page.getByText(text, { exact: true }).last()).toBeVisible({ timeout: 15000 });
  await expect(me.page.getByLabel("Read")).toHaveCount(readBefore + 1, { timeout: 15000 });
  await shot(me.page, "33-read-receipt");
  await me.ctx.close();
  await alice.ctx.close();
});

const roomPath = (page: Page) => new URL(page.url()).pathname;

test("routing: clean chat URLs survive a reload (landscape)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  expect(roomPath(page)).toBe("/");
  await openRoom(page, "Notes to self");
  await expect.poll(() => roomPath(page)).toMatch(/^\/chat\/![^/]+$/);
  expect(page.url()).not.toContain("#");
  await expect.poll(() => page.title()).toMatch(/^(\(\d+\) )?Notes to self · OhMatrix$/);
  const url = page.url();
  await page.reload();
  await expect(page.getByPlaceholder("Message")).toBeVisible({ timeout: 20000 });
  await expect(page.getByText("Notes to self").first()).toBeVisible();
  expect(page.url()).toBe(url);

  // The info panel is part of the URL too.
  await page.getByRole("button", { name: "Chat info" }).click();
  await expect.poll(() => roomPath(page)).toMatch(/\/info$/);
  await page.reload();
  await expect(page.getByText(/^(Group|User) info$/)).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "Close" }).click();
  await expect.poll(() => roomPath(page)).not.toMatch(/\/info$/);
});

test("routing: portrait reload on a chat; back returns to the list", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await openRoom(page, "Notes to self");
  await expect(page.getByPlaceholder("Message")).toBeVisible();
  await page.reload();
  await expect(page.getByPlaceholder("Message")).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByPlaceholder("Search")).toBeVisible();
  expect(roomPath(page)).toBe("/");
});

test("routing: /profile and /settings are real pages; browser history walks them", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await expect.poll(() => roomPath(page)).toBe("/profile");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect.poll(() => roomPath(page)).toBe("/settings");
  await page.reload();
  await expect(page.getByText("Appearance")).toBeVisible({ timeout: 20000 });
  await page.goBack();
  await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeVisible();
  expect(roomPath(page)).toBe("/profile");
  await page.goForward();
  await expect(page.getByText("Appearance")).toBeVisible();
  // A chat can be open next to a left-pane page.
  await page.getByRole("button", { name: "Profile", exact: true }).last().click();
  await page.getByRole("button", { name: "Chats", exact: true }).click();
  await expect.poll(() => roomPath(page)).toBe("/");
});

test("routing: unknown chat shows Chat not found with a way back", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  await page.goto("/chat/!doesnotexist:localhost");
  await expect(page.getByText("Chat not found")).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "Back to chats" }).click();
  await expect.poll(() => roomPath(page)).toBe("/");
  await expect(page.getByText("Select a chat to start messaging")).toBeVisible();
});

test("routing: a deep link opens after signing in; old #/ links are upgraded", async ({ page, browser }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  await openRoom(page, "Notes to self");
  await expect.poll(() => roomPath(page)).toMatch(/^\/chat\//);
  const deep = new URL(page.url()).pathname;

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const fresh = await ctx.newPage();
  await fresh.goto(deep);
  await fresh.getByText("Sign in to your Matrix account").waitFor();
  expect(roomPath(fresh)).toBe(deep); // the login screen does not clobber the link
  const inputs = fresh.locator("input");
  await inputs.nth(1).fill("test");
  await inputs.nth(2).fill("123456");
  await inputs.nth(2).press("Enter");
  await expect(fresh.getByPlaceholder("Message")).toBeVisible({ timeout: 25000 });
  expect(roomPath(fresh)).toBe(deep);

  await fresh.goto("/#/settings");
  await expect(fresh.getByText("Appearance")).toBeVisible({ timeout: 20000 });
  expect(roomPath(fresh)).toBe("/settings");
  expect(fresh.url()).not.toContain("#");
  await ctx.close();
});

test("session is stored encrypted: no plaintext token; reload restores it; old plaintext sessions are upgraded", async ({ page, browser }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  const stored = () =>
    page.evaluate(() => ({
      v1: localStorage.getItem("ohmatrix.session.v1"),
      v2: localStorage.getItem("ohmatrix.session.v2"),
      all: JSON.stringify({ ...localStorage }),
    }));
  const s = await stored();
  expect(s.v1).toBeNull();
  expect(s.v2).toBeTruthy();
  const token = await page.evaluate(async () => {
    // the app's own copy of the token, read via the Matrix API the app is using (the Authorization header on /sync)
    return await new Promise<string>((resolve) => {
      const orig = window.fetch;
      window.fetch = (i, init) => {
        const h = new Headers(init?.headers);
        const a = h.get("Authorization");
        if (a) {
          window.fetch = orig;
          resolve(a.replace("Bearer ", ""));
        }
        return orig(i, init);
      };
    });
  });
  expect(token.length).toBeGreaterThan(10);
  expect(s.all).not.toContain(token);
  expect(s.all).not.toContain("accessToken");
  await page.reload();
  await expect(page.getByPlaceholder("Search")).toBeVisible({ timeout: 20000 }); // restored without signing in again

  // A browser that still holds a plaintext v1 session (from an earlier version) gets it re-encrypted on first load.
  const login2 = (await (
    await fetch("http://localhost:8008/_matrix/client/v3/login", {
      method: "POST",
      body: JSON.stringify({ type: "m.login.password", identifier: { type: "m.id.user", user: "test" }, password: "123456" }),
    })
  ).json()) as { access_token: string; device_id: string; user_id: string };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(
    (sess) => {
      if (!localStorage.getItem("ohmatrix.session.v2")) localStorage.setItem("ohmatrix.session.v1", JSON.stringify(sess));
    },
    { homeserver: "http://localhost:8008", userId: login2.user_id, deviceId: login2.device_id, accessToken: login2.access_token },
  );
  const old = await ctx.newPage();
  await old.goto("/");
  await expect(old.getByPlaceholder("Search")).toBeVisible({ timeout: 25000 });
  const after = await old.evaluate(() => ({ v1: localStorage.getItem("ohmatrix.session.v1"), v2: localStorage.getItem("ohmatrix.session.v2") }));
  expect(after.v1).toBeNull();
  expect(after.v2).toBeTruthy();
  await ctx.close();
});

test("crypto store is keyed: key sealed in storage, survives reload, a lost key sends the user back to sign in, sign-out removes it", async ({ page }) => {
  const user = `uk${Date.now().toString(36)}`;
  await registerUser(user, "pw12345");
  const tok = (await (
    await fetch("http://localhost:8008/_matrix/client/v3/login", {
      method: "POST",
      body: JSON.stringify({ type: "m.login.password", identifier: { type: "m.id.user", user }, password: "pw12345" }),
    })
  ).json()) as { access_token: string };
  await fetch("http://localhost:8008/_matrix/client/v3/createRoom", {
    method: "POST",
    headers: { authorization: `Bearer ${tok.access_token}` },
    body: JSON.stringify({
      name: "Keyed",
      preset: "private_chat",
      initial_state: [{ type: "m.room.encryption", state_key: "", content: { algorithm: "m.megolm.v1.aes-sha2" } }],
    }),
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await loginAs(page, user, "pw12345");
  await openRoom(page, "Keyed");
  await page.waitForTimeout(1500);
  const secret = `sealed ${Date.now()}`;
  await page.getByPlaceholder("Message").fill(secret);
  await page.getByPlaceholder("Message").press("Enter");
  await expect(page.getByText(secret, { exact: true }).last()).toBeVisible({ timeout: 15000 });
  // The local echo shows at once; only reload after the server really has the (encrypted) event.
  const rooms = (await (
    await fetch("http://localhost:8008/_matrix/client/v3/joined_rooms", { headers: { authorization: `Bearer ${tok.access_token}` } })
  ).json()) as { joined_rooms: string[] };
  await expect
    .poll(
      async () => {
        const r = (await (
          await fetch(`http://localhost:8008/_matrix/client/v3/rooms/${encodeURIComponent(rooms.joined_rooms[0]!)}/messages?dir=b&limit=5`, {
            headers: { authorization: `Bearer ${tok.access_token}` },
          })
        ).json()) as { chunk: { type: string }[] };
        return r.chunk.some((e) => e.type === "m.room.encrypted");
      },
      { timeout: 15000 },
    )
    .toBe(true);

  const keys = () => page.evaluate(() => Object.entries(localStorage).filter(([k]) => k.startsWith("ohmatrix.cryptokey.v1.")));
  const entries = await keys();
  expect(entries).toHaveLength(1);
  expect(entries[0]![1].length).toBeGreaterThan(60); // sealed (iv + ciphertext + tag), not a bare 32-byte key

  // The store reopens with its key after a reload and the encrypted history is still readable.
  await page.reload();
  await expect(page.getByPlaceholder("Message")).toBeVisible({ timeout: 25000 });
  await expect(page.getByText(secret, { exact: true }).last()).toBeVisible({ timeout: 20000 });
  expect(await keys()).toEqual(entries);

  // Lose the key: this device's encryption identity is gone, so the app sends the user back to sign in
  // (a new device) with an explanation, instead of hanging or silently running without encryption.
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith("ohmatrix.cryptokey.v1.")) localStorage.removeItem(k);
  });
  await page.reload();
  await expect(page.getByText("Sign in to your Matrix account")).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(/encryption keys of this device are unavailable/i)).toBeVisible();
  const again = page.locator("input");
  await again.nth(1).fill(user);
  await again.nth(2).fill("pw12345");
  await again.nth(2).press("Enter");
  await expect(page.getByPlaceholder("Search")).toBeVisible({ timeout: 30000 });
  await expect.poll(async () => (await keys()).length, { timeout: 15000 }).toBe(1);

  // Signing out removes the key together with the store.
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("button", { name: "Sign out" }).last().click();
  await expect(page.getByText("Sign in to your Matrix account")).toBeVisible({ timeout: 20000 });
  await expect.poll(async () => (await keys()).length, { timeout: 10000 }).toBe(0);
});

test("sync cache: after a reload the chat list appears from the cache even with no network sync", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  await expect(
    page
      .getByRole("button")
      .filter({ hasText: /\d{1,2}:\d\d/ })
      .first(),
  ).toBeVisible({ timeout: 20000 });
  await expect
    .poll(
      () =>
        page.evaluate(async () =>
          (await indexedDB.databases()).some((d) => (d.name ?? "").startsWith("matrix-js-sdk:ohmatrix-") && (d.name ?? "").endsWith("-sync")),
        ),
      { timeout: 15000 },
    )
    .toBe(true);
  await page.waitForTimeout(4000); // let the cache be written (it is flushed periodically)

  // Make every sync request hang: only the cache can populate the list now.
  await page.route("**/_matrix/client/v3/sync**", () => {
    /* never answered */
  });
  const started = Date.now();
  await page.reload();
  await expect(
    page
      .getByRole("button")
      .filter({ hasText: /\d{1,2}:\d\d/ })
      .first(),
  ).toBeVisible({ timeout: 15000 });
  const took = Date.now() - started;
  await shot(page, "34-cold-start-from-cache");
  expect(took).toBeLessThan(10000);
  await page.unroute("**/_matrix/client/v3/sync**");
});

test("sign-out deletes the sync cache", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  const caches = () => page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name ?? "").filter((n) => n.startsWith("matrix-js-sdk:ohmatrix-")));
  await expect.poll(async () => (await caches()).length, { timeout: 15000 }).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("button", { name: "Sign out" }).last().click();
  await expect(page.getByText("Sign in to your Matrix account")).toBeVisible({ timeout: 20000 });
  await expect.poll(async () => (await caches()).length, { timeout: 15000 }).toBe(0);
});

/** Replaces Notification with a recorder so tests can see what would be shown (and control permission). */
async function fakeNotifications(page: Page, initial: "default" | "granted" | "denied" = "default") {
  await page.addInitScript((perm) => {
    const w = window as unknown as { __perm: string; __notes: { title: string; body: string; tag: string; onclick: (() => void) | null }[] };
    w.__perm = perm;
    w.__notes = [];
    class FakeNotification {
      static get permission() {
        return w.__perm;
      }
      static async requestPermission() {
        if (w.__perm === "default") w.__perm = "granted";
        return w.__perm;
      } // a blocked site stays blocked
      onclick: (() => void) | null = null;
      constructor(
        public title: string,
        opts: { body?: string; tag?: string } = {},
      ) {
        w.__notes.push(Object.assign(this, { body: opts.body ?? "", tag: opts.tag ?? "" }) as never);
      }
      close() {}
    }
    (window as unknown as { Notification: unknown }).Notification = FakeNotification;
    document.hasFocus = () => true; // headless pages are never focused
  }, initial);
}
const notes = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __notes: { title: string; body: string; tag: string }[] }).__notes.map(({ title, body, tag }) => ({ title, body, tag })),
  );

async function dmWith(token: string, other: string): Promise<string> {
  const rooms = ((await api(token, "GET", "/joined_rooms")) as unknown as { joined_rooms: string[] }).joined_rooms;
  for (const id of rooms) {
    const m = ((await api(token, "GET", `/rooms/${encodeURIComponent(id)}/joined_members`)) as unknown as { joined: Record<string, unknown> }).joined;
    const ids = Object.keys(m);
    const named = (await api(token, "GET", `/rooms/${encodeURIComponent(id)}/state/m.room.name`)).name; // direct chats have no name
    if (ids.length === 2 && ids.includes(`@${other}:localhost`) && !named) return id;
  }
  throw new Error("no direct room");
}

test("notifications: opt in from Settings; system notification for other chats; title shows unread; respects text preview setting", async ({ page }) => {
  await fakeNotifications(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  // Off by default and nothing is requested until the user asks.
  expect(await page.evaluate(() => (window as unknown as { __perm: string }).__perm)).toBe("default");
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("switch", { name: "Desktop notifications" })).not.toBeChecked();
  await page.getByRole("switch", { name: "Desktop notifications" }).click();
  await expect(page.getByRole("switch", { name: "Desktop notifications" })).toBeChecked();
  await expect(page.getByRole("switch", { name: "Show message text" })).toBeChecked();
  await shot(page, "35-notification-settings");
  await page.getByRole("button", { name: "Profile", exact: true }).last().click();
  await page.getByRole("button", { name: "Chats", exact: true }).click();

  const [alice, me] = [await apiLogin("alice"), await apiLogin("test")];
  const dm = await dmWith(alice, "test");
  const say = (body: string) =>
    api(alice, "PUT", `/rooms/${encodeURIComponent(dm)}/send/m.room.message/n${Date.now()}${Math.random().toString(36).slice(2)}`, { msgtype: "m.text", body });
  void me;

  // A message in a chat that is not open → a notification with the sender as title and the text as body.
  const first = `ping ${Date.now()}`;
  await say(first);
  await expect.poll(async () => (await notes(page)).length, { timeout: 15000 }).toBe(1);
  expect((await notes(page))[0]).toMatchObject({ title: "alice", body: first, tag: dm });
  await expect.poll(() => page.title(), { timeout: 10000 }).toMatch(/^\(\d+\) OhMatrix$/);

  // Clicking the notification opens that chat.
  await page.evaluate(() => (window as unknown as { __notes: { onclick: () => void }[] }).__notes[0]!.onclick());
  await expect.poll(() => new URL(page.url()).pathname).toBe(`/chat/${dm}`);

  // The chat is open and the window active: no notification for what the user is already reading.
  await say(`seen ${Date.now()}`);
  await page.waitForTimeout(2500);
  expect(await notes(page)).toHaveLength(1);
  await expect.poll(() => page.title()).toMatch(/^(\(\d+\) )?alice · OhMatrix$/); // other chats may still have unread messages

  // Back on the list, with message text turned off: a generic body.
  await page.goBack(); // history pop: closes the chat without reloading (a reload would reset the fake Notification)
  await expect(page.getByText("Select a chat to start messaging")).toBeVisible();
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("switch", { name: "Show message text" }).click();
  await expect(page.getByRole("switch", { name: "Show message text" })).not.toBeChecked();
  await page.getByRole("button", { name: "Profile", exact: true }).last().click();
  await page.getByRole("button", { name: "Chats", exact: true }).click();
  const before = (await notes(page)).length;
  await say("secret text");
  await expect.poll(async () => (await notes(page)).length, { timeout: 15000 }).toBe(before + 1);
  expect((await notes(page)).at(-1)).toMatchObject({ title: "alice", body: "New message" });

  // Turning the switch off stops notifications.
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("switch", { name: "Desktop notifications" }).click();
  await page.getByRole("button", { name: "Profile", exact: true }).last().click();
  await page.getByRole("button", { name: "Chats", exact: true }).click();
  const after = (await notes(page)).length;
  await say("nobody hears this");
  await page.waitForTimeout(2500);
  expect(await notes(page)).toHaveLength(after);
});

test("notifications: a blocked browser permission is explained and cannot be switched on", async ({ page }) => {
  await fakeNotifications(page, "denied");
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByText(/Notifications are blocked/)).toBeVisible();
  await page.getByRole("switch", { name: "Desktop notifications" }).click();
  await expect(page.getByRole("switch", { name: "Desktop notifications" })).not.toBeChecked();
});

test("profile status and sessions", async ({ page }) => {
  const user = `ps${Date.now().toString(36)}`;
  await registerUser(user, "pw12345");
  const extraLogin = async (display: string) =>
    (await (
      await fetch("http://localhost:8008/_matrix/client/v3/login", {
        method: "POST",
        body: JSON.stringify({ type: "m.login.password", identifier: { type: "m.id.user", user }, password: "pw12345", initial_device_display_name: display }),
      })
    ).json()) as { device_id: string };
  await extraLogin("Tablet");
  await extraLogin("Laptop");
  await page.setViewportSize({ width: 1280, height: 800 });
  await loginAs(page, user, "pw12345");
  await expect(page.getByPlaceholder("Search")).toBeVisible({ timeout: 20000 });

  // Status: shown on the profile, survives a reload, can be cleared.
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  const statusRow = page.getByRole("button", { name: "Status", exact: true });
  await expect(statusRow).toContainText("Set a status");
  await statusRow.click();
  await page.getByPlaceholder("What are you up to?").fill("Busy building");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(statusRow).toContainText("Busy building", { timeout: 10000 });
  await shot(page, "36-profile-status");
  await page.reload();
  await expect(page.getByRole("button", { name: "Status", exact: true })).toContainText("Busy building", { timeout: 20000 });

  // Sessions: this device first, the others below; a wrong password is refused, the right one signs a session out.
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Sessions", exact: true }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/sessions");
  await expect(page.getByText("This device")).toBeVisible();
  await expect(page.getByRole("button", { name: "Tablet", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Laptop", exact: true })).toBeVisible();
  await page.waitForTimeout(500); // let the page finish sliding in
  await shot(page, "37-sessions");
  await page.getByRole("button", { name: "Tablet", exact: true }).click();
  await page.locator("input[type=password]").fill("wrong");
  await page.getByRole("button", { name: "Sign out", exact: true }).last().click();
  await expect(page.getByText("Wrong password.")).toBeVisible({ timeout: 10000 });
  await page.locator("input[type=password]").fill("pw12345");
  await page.getByRole("button", { name: "Sign out", exact: true }).last().click();
  await expect(page.getByRole("button", { name: "Tablet", exact: true })).toBeHidden({ timeout: 10000 });
  await expect(page.getByRole("button", { name: "Laptop", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign out all other sessions" }).click();
  await page.locator("input[type=password]").fill("pw12345");
  await page.getByRole("button", { name: "Sign out", exact: true }).last().click();
  await expect(page.getByText("No other sessions")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("This device")).toBeVisible();

  // Browser history and reload keep the page.
  await page.reload();
  await expect(page.getByText("This device")).toBeVisible({ timeout: 20000 });
  await page.goBack();
  await expect(page.getByText("Appearance")).toBeVisible();
});

async function newGroup(page: Page, name: string, members: string[]) {
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("menuitem", { name: "New group" }).click();
  await page.getByText("Group name").locator("..").locator("input").last().fill(name);
  for (const m of members) await pickPerson(page, m, m);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByPlaceholder("Message")).toBeVisible({ timeout: 20000 });
}

test("room administration UI: edit name and topic, invite, roles, remove, mute", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  const name = `Admin ${Date.now().toString(36)}`;
  await newGroup(page, name, ["bob"]);
  const roomId = decodeURIComponent(new URL(page.url()).pathname.replace("/chat/", ""));
  await api(await apiLogin("bob"), "POST", `/join/${encodeURIComponent(roomId)}`, {}); // bob accepts the invitation
  await page.getByRole("button", { name: "Chat info" }).click();
  await expect(page.getByText("Members · 2")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Invited", { exact: true })).toHaveCount(0, { timeout: 15000 });

  // Edit the name and the topic from the panel.
  const renamed = `${name} v2`;
  await page.getByRole("button", { name: "Group name", exact: true }).click();
  await page.locator("input").last().fill(renamed);
  await page.getByRole("button", { name: "Save", exact: true }).last().click();
  await expect(page.getByText(renamed).first()).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Topic", exact: true }).click();
  await page.locator("textarea").last().fill("Only shipping on Fridays");
  await page.getByRole("button", { name: "Save", exact: true }).last().click();
  await expect(page.getByText("Only shipping on Fridays")).toBeVisible({ timeout: 15000 });
  await shot(page, "38-room-admin");

  // Invite another person through the picker.
  await page.getByRole("button", { name: "Invite people" }).click();
  await pickPerson(page, "ali", "alice");
  await page.getByRole("button", { name: "Invite 1", exact: true }).click();
  await expect(page.getByText("Members · 3")).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("Invited", { exact: true })).toBeVisible();

  // Roles: promote bob (a pending invitation has no role to change, only withdrawal).
  await page.getByRole("button", { name: "alice", exact: true }).last().click();
  await expect(page.getByRole("menuitem", { name: "Withdraw invitation" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Make moderator" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.mouse.click(5, 5);
  await page.getByRole("button", { name: "bob", exact: true }).last().click();
  await page.getByRole("menuitem", { name: "Make moderator" }).click();
  await expect(page.getByText("Moderator", { exact: true })).toBeVisible({ timeout: 15000 });

  // Withdraw alice's invitation, remove bob (both ask first).
  await page.getByRole("button", { name: "alice", exact: true }).last().click();
  await page.getByRole("menuitem", { name: "Withdraw invitation" }).click();
  await page.getByRole("button", { name: "Withdraw invitation", exact: true }).last().click();
  await expect(page.getByText("Members · 2")).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "bob", exact: true }).last().click();
  await page.getByRole("menuitem", { name: "Remove from group" }).click();
  await expect(page.getByText("Remove bob?")).toBeVisible();
  await page.getByRole("button", { name: "Remove from group", exact: true }).last().click();
  await expect(page.getByText("Members · 1")).toBeVisible({ timeout: 15000 });

  // Mute from the panel: the switch is on and the chat list marks the chat.
  await page.getByRole("switch", { name: "Mute notifications" }).click();
  await expect(page.getByRole("switch", { name: "Mute notifications" })).toBeChecked({ timeout: 10000 });
  await page.getByRole("switch", { name: "Mute notifications" }).click();
  await expect(page.getByRole("switch", { name: "Mute notifications" })).not.toBeChecked({ timeout: 10000 });
});

test("room administration UI: members without rights see no editing; shared media lists the photo", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  await openRoom(page, "OhMatrix Dev");
  await page.getByRole("button", { name: "Chat info" }).click();
  await expect(page.getByText("Group info", { exact: true })).toBeVisible();
  await expect(page.getByText("Members · 3")).toBeVisible({ timeout: 15000 });
  // test is a plain member of alice's room: nothing to edit, invite or manage.
  await page
    .getByRole("button", { name: "Group name", exact: true })
    .click({ timeout: 2000 })
    .catch(() => {});
  await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Invite people" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "alice", exact: true })).toHaveCount(0);
  // Shared photos come from the loaded messages; older ones can be loaded on demand.
  await expect(page.getByText(/^Photos · \d+/)).toBeVisible({ timeout: 15000 });
  await shot(page, "39-shared-media");
  await page.getByRole("button", { name: "Load older messages" }).click();
  await expect(page.getByText(/^Photos · \d+/)).toBeVisible();
});
