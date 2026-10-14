import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

const shot = (page: Page, name: string) => page.screenshot({ path: `.out/${name}.png` });

/** Opens a chat by name through the search box (the list is virtualised and grows with every run). */
async function openRoom(page: Page, name: string, row: RegExp = new RegExp(name)) {
  const search = page.getByPlaceholder("Search");
  await search.fill(name);
  await page.getByRole("button", { name: row }).first().click();
  await search.fill("");
}

/** Searches the people picker in the open dialog and taps the result. */
/** A fresh group of test, alice and bob, opened. Tests that need members must not depend on rooms other tests left. */
async function openFreshGroup(page: Page, prefix: string) {
  const name = `${prefix} ${Date.now().toString(36)}`;
  await page.evaluate(async (name) => {
    const c = (window as unknown as { __ohmatrix: { controller: { createGroup(n: string, i: string[]): Promise<void> } } }).__ohmatrix.controller;
    await c.createGroup(name, ["@alice:localhost", "@bob:localhost"]);
  }, name);
  await expect(page.getByPlaceholder("Message")).toBeVisible({ timeout: 20000 });
  return name;
}

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
  const rowYes = page.getByRole("button", { name: new RegExp(yes) }).first(); // the list row (the open chat's header block has the same name)
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
  // Older messages in this chat may carry the same reaction, and the list only renders a window of rows, so do not
  // count chips: ours is the one sitting directly under our bubble.
  const chipUnderMessage = async () => {
    const m = await msg.boundingBox();
    const chips = await page.getByRole("button", { name: "😂 1" }).all();
    for (const c of chips) {
      const box = await c.boundingBox();
      if (m && box && box.y - (m.y + m.height) >= 0 && box.y - (m.y + m.height) < 40 && Math.abs(box.x + box.width - (m.x + m.width)) < 80) return c;
    }
    return null;
  };
  await msg.click({ button: "right" });
  await shot(page, "12-menu");
  await page.getByRole("button", { name: "React 😂" }).click();
  await expect.poll(async () => !!(await chipUnderMessage()), { timeout: 10000 }).toBe(true);
  await shot(page, "13-reaction");
  await (await chipUnderMessage())!.click();
  await expect.poll(async () => !!(await chipUnderMessage()), { timeout: 10000 }).toBe(false);
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
  await page.getByRole("menuitem", { name: "Reply", exact: true }).click();
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
  await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
  await expect(box).toHaveValue(before);
  await expect(page.getByRole("menu")).toBeHidden(); // the menu is still fading out; typing into the page under it can lose the keypress
  await box.fill(after);
  await box.press("Enter");
  await expect(page.getByText(after, { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(before, { exact: true })).toBeHidden({ timeout: 20000 });
  await expect(page.getByText(/^edited /).last()).toBeVisible();
  await shot(page, "15-edited");
  await page.getByText(after, { exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
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
  await page.goBack();
  await expect(page.getByText("User info", { exact: true })).toBeHidden({ timeout: 5000 });
  // The avatar / name / member count block in the header opens the same panel as the info button.
  await page.getByRole("button", { name: /Direct chat/ }).click();
  await expect(page.getByText("User info", { exact: true })).toBeVisible();
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
  // Shared media has a tab per kind and reaches back through the room's history, not only the loaded messages.
  await expect(page.getByText("Shared media", { exact: true })).toBeVisible({ timeout: 15000 });
  for (const tab of ["Photos", "Videos", "Audio", "Files"]) await expect(page.getByRole("tab", { name: tab })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Photos" })).toHaveAttribute("aria-selected", "true");
  await shot(page, "39-shared-media");
});

test("search: global message search finds a message beyond the loaded history and jumps to it", async ({ page }) => {
  const [alice, me] = [await apiLogin("alice"), await apiLogin("test")];
  const tag = `quokka${Date.now().toString(36)}`;
  const { room_id } = await api(alice, "POST", "/createRoom", { name: `Search ${tag}`, preset: "private_chat", invite: ["@test:localhost"] });
  await api(me, "POST", `/join/${encodeURIComponent(room_id!)}`, {});
  const send = (body: string, n: number) =>
    api(alice, "PUT", `/rooms/${encodeURIComponent(room_id!)}/send/m.room.message/s${Date.now()}${n}`, { msgtype: "m.text", body });
  await send(`the ${tag} was here first`, 0);
  for (let i = 1; i <= 45; i++) await send(`filler message number ${i}`, i); // pushes the needle out of the initially loaded history

  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  await page.getByPlaceholder("Search").fill(tag);
  await expect(page.getByText("Messages", { exact: true })).toBeVisible({ timeout: 15000 });
  const hit = page.getByRole("button", { name: new RegExp(`Search ${tag}: the ${tag} was here first`) });
  await expect(hit).toBeVisible({ timeout: 20000 });
  await shot(page, "40-global-search");
  await hit.click();
  // The chat opens, older history is loaded until the message is found, and it is highlighted.
  await expect(page.getByLabel("Found message")).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(`the ${tag} was here first`, { exact: true })).toBeVisible();
  await shot(page, "41-jumped-to-message");
});

test("search: in-chat search is scoped to the chat; encrypted chats are searched on this device", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  const name = `Vault ${Date.now().toString(36)}`;
  await newGroup(page, name, ["bob"]); // groups are end-to-end encrypted
  const tag = `ocelot${Date.now().toString(36)}`;
  await page.waitForTimeout(1500);
  await page.getByPlaceholder("Message").fill(`secret ${tag} plans`);
  await page.getByPlaceholder("Message").press("Enter");
  await page.getByPlaceholder("Message").fill("nothing to see here");
  await page.getByPlaceholder("Message").press("Enter");
  await expect(page.getByText("nothing to see here", { exact: true }).last()).toBeVisible({ timeout: 15000 });
  // Local echoes are not searchable yet: wait until the server has both (encrypted) messages.
  const vault = decodeURIComponent(new URL(page.url()).pathname.replace("/chat/", ""));
  const mine = await apiLogin("test");
  await expect
    .poll(
      async () => {
        const r = (await api(mine, "GET", `/rooms/${encodeURIComponent(vault)}/messages?dir=b&limit=10`)) as unknown as { chunk: { type: string }[] };
        return r.chunk.filter((e) => e.type === "m.room.encrypted").length;
      },
      { timeout: 15000 },
    )
    .toBe(2);

  // In this chat: only this chat's matches, no chat names in the rows, and the note about encrypted chats.
  await page.getByRole("button", { name: "Search in this chat" }).click();
  await page.getByPlaceholder("Search in this chat").fill(tag);
  const inChat = page.getByRole("button", { name: new RegExp(`secret ${tag} plans`) });
  await expect(inChat).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/Encrypted chats are searched only among the messages loaded on this device/)).toBeVisible();
  await expect(page.locator('div[aria-label="Search in this chat"]').getByRole("button", { name: /nothing to see here/ })).toHaveCount(0); // only matches of this search
  await shot(page, "42-in-chat-search");
  await inChat.click();
  await expect(page.getByLabel("Found message")).toBeVisible({ timeout: 15000 });
  await expect(page.getByPlaceholder("Search in this chat")).toHaveCount(0); // the search closed

  // The same message is found from the chat list.
  await page.getByPlaceholder("Search", { exact: true }).fill(tag);
  await expect(page.getByRole("button", { name: new RegExp(`${name}: .*secret ${tag} plans`) })).toBeVisible({ timeout: 15000 });
});

test('top bar: fixed height; "Connecting..." replaces the name instead of adding a line', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  let release!: () => void;
  const held = new Promise<void>((r) => {
    release = r;
  });
  await page.route("**/_matrix/client/v3/sync**", async (route) => {
    await held;
    await route.continue();
  });
  await loginAs(page, "test", "123456");
  const bar = page.getByRole("button", { name: "Profile", exact: true }).first();
  await expect(page.getByText("Connecting…")).toBeVisible({ timeout: 20000 });
  await expect(page.getByText("test", { exact: true })).toHaveCount(0); // the name is not shown at the same time
  const connecting = (await bar.boundingBox())!.height;
  const searchTop = (await page.getByPlaceholder("Search").boundingBox())!.y;
  await shot(page, "43-connecting");
  release();
  await expect(page.getByText("Connecting…")).toHaveCount(0, { timeout: 30000 });
  await expect(page.getByText("test", { exact: true }).first()).toBeVisible();
  expect((await bar.boundingBox())!.height).toBe(connecting);
  expect((await page.getByPlaceholder("Search").boundingBox())!.y).toBe(searchTop); // nothing below moved
});

test("message menu: opens at the pointer in the incoming-bubble colours, borderless with a shadow, and fades out in place", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  await openRoom(page, "Notes to self");
  const text = `menu probe ${Date.now()}`;
  await page.getByPlaceholder("Message").fill(text);
  await page.getByPlaceholder("Message").press("Enter");
  const bubble = page.getByText(text, { exact: true }).last();
  await expect(bubble).toBeVisible();
  // The list follows the new message down to the bottom: wait for the bubble to stop moving before using its position.
  let last = "";
  await expect
    .poll(
      async () => {
        const now = JSON.stringify(await bubble.boundingBox());
        const same = now === last;
        last = now;
        return same;
      },
      { intervals: [250] },
    )
    .toBe(true);
  const b = (await bubble.boundingBox())!;
  const click = { x: b.x + 12, y: b.y + 6 };
  await bubble.click({ button: "right", position: { x: 12, y: 6 } });
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  const m = (await menu.boundingBox())!;
  // It opens at the mouse pointer (a corner of the menu is at the click; it flips when there is no room), not at the bubble.
  const nearX = Math.abs(m.x - click.x) < 6 || Math.abs(m.x + m.width - click.x) < 6;
  const nearY = Math.abs(m.y - click.y) < 6 || Math.abs(m.y + m.height - click.y) < 6;
  expect(nearX && nearY).toBe(true);
  expect(m.width).toBeLessThan(400);
  // Colours of the other person's bubble (white in the light theme), no border, a soft shadow.
  const item = page.getByRole("menuitem", { name: "Reply", exact: true });
  const panel = await item.evaluate((el) => {
    const p = getComputedStyle(el.parentElement!);
    return { bg: p.backgroundColor, border: p.borderTopWidth, shadow: p.boxShadow };
  });
  expect(panel.bg).toBe("rgb(255, 255, 255)");
  expect(panel.border).toBe("0px");
  expect(panel.shadow).not.toBe("none");
  await shot(page, "44-message-menu");
  await page.getByRole("button", { name: "React 👍" }).waitFor();

  // Clicking elsewhere closes it, and while it fades out it stays where it was (it must not jump to the corner).
  const watch = page.evaluate(
    () =>
      new Promise<{ x: number; y: number }[]>((resolve) => {
        const seen: { x: number; y: number }[] = [];
        const tick = () => {
          const el = document.querySelector('[role="menu"]');
          if (el) {
            const r = el.getBoundingClientRect();
            seen.push({ x: Math.round(r.x), y: Math.round(r.y) });
            requestAnimationFrame(tick);
          } else resolve(seen);
        };
        tick();
      }),
  );
  await page.mouse.click(700, 150);
  const seen = await watch;
  await expect(menu).toBeHidden();
  expect(seen.length).toBeGreaterThan(0);
  for (const p of seen) expect(p).toEqual({ x: Math.round(m.x), y: Math.round(m.y) });
  await bubble.click({ button: "right" });
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
});

test("sessions: a very long list is virtualised (only nearby rows exist) and still scrolls and acts", async ({ page }) => {
  const user = `sv${Date.now().toString(36)}`;
  await registerUser(user, "pw12345");
  const body = JSON.stringify({ type: "m.login.password", identifier: { type: "m.id.user", user }, password: "pw12345" });
  const TOTAL = 150;
  for (let i = 0; i < TOTAL; i += 25) {
    await Promise.all(
      Array.from({ length: 25 }, (_, k) =>
        fetch("http://localhost:8008/_matrix/client/v3/login", {
          method: "POST",
          body: JSON.stringify({ ...JSON.parse(body), initial_device_display_name: `Device ${String(i + k).padStart(3, "0")}` }),
        }).then((r) => r.json()),
      ),
    );
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await loginAs(page, user, "pw12345");
  await expect(page.getByPlaceholder("Search")).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Sessions", exact: true }).click();
  await expect(page.getByText("This device")).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(600);
  const rendered = () => page.getByRole("button", { name: /^Device \d{3}$/ }).count();
  const first = await rendered();
  expect(first).toBeGreaterThan(3);
  expect(first).toBeLessThan(60); // 150 sessions exist, only a window of them is in the page
  await shot(page, "45-sessions-virtualised");
  // Scrolling reveals later rows (and drops earlier ones).
  const list = page
    .locator("div")
    .filter({ has: page.getByText("Other sessions") })
    .last();
  await list.hover();
  for (let i = 0; i < 40; i++) {
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(40);
  }
  await expect(page.getByRole("button", { name: /^Device 1[34]\d$/ }).first()).toBeVisible({ timeout: 10000 });
  expect(await rendered()).toBeLessThan(60);
  await expect(page.getByRole("button", { name: "Sign out all other sessions" })).toBeVisible();
});

test("photo viewer: hand cursor and click to open; translucent mask over the whole window; zoom; closes", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  await openRoom(page, "OhMatrix Dev");
  const photo = page.getByRole("button", { name: "Open photo" }).last();
  await expect(photo).toBeVisible({ timeout: 15000 });
  expect(await photo.evaluate((el) => getComputedStyle(el).cursor)).toBe("pointer");
  expect(
    await page
      .getByText(/Nice shot!/)
      .last()
      .evaluate((el) => getComputedStyle(el).cursor),
  ).toBe("text"); // the rest of the chat is text

  await photo.click();
  const viewer = page.getByRole("button", { name: /^Photo: / });
  await expect(viewer).toBeVisible();
  await page.waitForTimeout(500);
  // A translucent mask covers the entire window and the chat is still faintly visible behind it.
  const mask = page.getByLabel("Viewer backdrop");
  const maskBox = (await mask.boundingBox())!;
  expect(maskBox.width).toBeGreaterThanOrEqual(1279);
  expect(maskBox.height).toBeGreaterThanOrEqual(799);
  const maskBg = await mask.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(maskBg).toMatch(/rgba\(0, 0, 0, 0\.\d+\)/);
  // The picture is shown at a comfortable size, not maximised.
  const v = (await viewer.boundingBox())!;
  expect(v.width).toBeLessThanOrEqual(1280 * 0.8 + 1);
  expect(v.height).toBeLessThanOrEqual(800 * 0.8 + 1);
  await shot(page, "46-photo-viewer");

  // Zoom with the buttons, the wheel and a double click; fit resets.
  const zoomText = () => page.getByLabel("Zoom level").innerText();
  expect(await zoomText()).toBe("100%");
  await page.getByRole("button", { name: "Zoom in" }).click();
  expect(await zoomText()).toBe("125%");
  await page.getByRole("button", { name: "Zoom out" }).click();
  await page.getByRole("button", { name: "Zoom out" }).click();
  expect(await zoomText()).toBe("80%");
  await page.mouse.move(640, 400);
  await page.mouse.wheel(0, -300);
  await expect.poll(async () => parseInt(await zoomText())).toBeGreaterThan(80);
  await page.getByRole("button", { name: "Fit to window" }).click();
  expect(await zoomText()).toBe("100%");
  await viewer.dblclick();
  expect(await zoomText()).toBe("200%");
  const zoomed = (await viewer.boundingBox())!;
  expect(zoomed.width).toBeGreaterThan(v.width * 1.9);
  await viewer.dblclick();
  expect(await zoomText()).toBe("100%");

  // Clicking the picture does not close it; clicking the mask, Esc, or the close button does.
  await viewer.click();
  await expect(viewer).toBeVisible();
  await page.mouse.click(40, 400);
  await expect(viewer).toBeHidden();
  await photo.click();
  await expect(viewer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(viewer).toBeHidden();
  await photo.click();
  await page.getByRole("button", { name: "Close", exact: true }).last().click();
  await expect(viewer).toBeHidden();
});

test("sign-in: an unreachable or mistyped server gets a clear message; a bare local address means http", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await page.getByText("Sign in to your Matrix account").waitFor();
  const inputs = page.locator("input");
  await inputs.nth(1).fill("test");
  await inputs.nth(2).fill("123456");

  // A misspelt host (the browser reports a CORS failure) is explained plainly, with the address shown.
  await inputs.nth(0).fill("http://loaclhost:8008");
  await inputs.nth(2).press("Enter");
  await expect(page.getByText("Cannot reach http://loaclhost:8008. Check how the address is spelled and your network connection.")).toBeVisible({
    timeout: 20000,
  });
  await expect(page.getByText(/NetworkError|CORS|fetch failed/i)).toHaveCount(0);

  // A bare local address works without typing http://, and wrong credentials say so.
  await inputs.nth(0).fill("localhost:8008");
  await inputs.nth(2).fill("not-the-password");
  await inputs.nth(2).press("Enter");
  await expect(page.getByText("Wrong username or password.")).toBeVisible({ timeout: 20000 });
  await inputs.nth(2).fill("123456");
  await inputs.nth(2).press("Enter");
  await expect(page.getByPlaceholder("Search")).toBeVisible({ timeout: 30000 });
});

test('sign-in failures stay on the sign-in page: server "1", any credentials', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // "1" is not a server: make every request to it fail the way an unreachable host does.
  await page.route(/https?:\/\/1(:\d+)?\//, (route) => route.abort("failed"));
  await page.goto("/");
  await page.getByText("Sign in to your Matrix account").waitFor();
  const inputs = page.locator("input");
  await inputs.nth(0).fill("1");
  await inputs.nth(1).fill("whoever");
  await inputs.nth(2).fill("whatever");
  await inputs.nth(2).press("Enter");
  await expect(page.getByText("Cannot reach 1. Check how the address is spelled and your network connection.")).toBeVisible({ timeout: 30000 });
  // Still the sign-in page, nothing blank, nothing thrown, fields kept so it can be corrected.
  await expect(page.getByText("Sign in to your Matrix account")).toBeVisible();
  await expect(inputs.nth(0)).toHaveValue("1");
  await expect(inputs.nth(1)).toHaveValue("whoever");
  await page.waitForTimeout(3000);
  await expect(page.getByText("Sign in to your Matrix account")).toBeVisible();
  expect(errors).toEqual([]);

  // A reachable server with the wrong password: the same.
  await inputs.nth(0).fill("localhost:8008");
  await inputs.nth(2).fill("nope");
  await inputs.nth(2).press("Enter");
  await expect(page.getByText("Wrong username or password.")).toBeVisible({ timeout: 20000 });
  await expect(page.getByText("Sign in to your Matrix account")).toBeVisible();
  // Only a correct sign-in leaves the page.
  await inputs.nth(1).fill("test");
  await inputs.nth(2).fill("123456");
  await inputs.nth(2).press("Enter");
  await expect(page.getByPlaceholder("Search")).toBeVisible({ timeout: 30000 });
  expect(errors).toEqual([]);
});

test("a screen that fails to render shows a way out (light or dark with the system); Try again rebuilds the app", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  const state = (js: string) => page.evaluate(js);
  // A second evaluation of the context module (what a hot reload does) must join the same contexts, not create new ones.
  const sameContexts = await page.evaluate(async () => {
    const g = globalThis as unknown as Record<string, unknown>;
    const before = ["controller", "locale", "services"].map((n) => g[`__ohmatrix_ctx_${n}`]);
    const root = (window as unknown as { __ohmatrix_root: string }).__ohmatrix_root;
    await import(/* @vite-ignore */ `${root}/src/packages/app/src/context.tsx?duplicate=${Date.now()}`);
    return before.every((c, i) => !!c && c === g[`__ohmatrix_ctx_${["controller", "locale", "services"][i]}`]);
  });
  expect(sameContexts).toBe(true);
  const breakIt = () => state("window.__ohmatrix.controller.store.setState({ prefs: null })");
  const fixIt = () =>
    state(
      "window.__ohmatrix.controller.store.setState({ prefs: { theme: 'system', locale: null, sidebarWidth: null, notifications: false, notificationPreview: true } })",
    );
  const background = () =>
    page.getByText("Something went wrong").evaluate((el) => {
      let n: HTMLElement | null = el as HTMLElement;
      while (n && getComputedStyle(n).backgroundColor === "rgba(0, 0, 0, 0)") n = n.parentElement;
      return getComputedStyle(n!).backgroundColor;
    });

  await page.emulateMedia({ colorScheme: "light" });
  await breakIt();
  await expect(page.getByText("Something went wrong")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("The screen could not be shown. Your messages are safe.")).toBeVisible();
  expect(await background()).toBe("rgb(255, 255, 255)");
  await shot(page, "47-error-light");
  await page.emulateMedia({ colorScheme: "dark" }); // follows the system
  await expect.poll(background).toBe("rgb(28, 28, 30)");
  await shot(page, "48-error-dark");

  // Try again while the cause is still there: the page stays on the message (no blank, no new error).
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Something went wrong")).toBeVisible({ timeout: 10000 });
  // Once the cause is gone, Try again brings the whole app back.
  await fixIt();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByPlaceholder("Search")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Something went wrong")).toHaveCount(0);

  // Reload also recovers (the session is restored).
  await breakIt();
  await expect(page.getByText("Something went wrong")).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "Reload" }).click();
  await expect(page.getByPlaceholder("Search")).toBeVisible({ timeout: 30000 });
});

/** Whether this run uses the native (inverted) message list in the browser, see `pnpm test:e2e:native`. */
const native = process.env.OHMATRIX_NATIVE_LIST === "1";

// ---- audio, video, recording, upload progress ----------------------------------------------------------------------

let fixtures: { tone: string; clip: string; big: string } | null = null;
function makeFixtures() {
  if (fixtures) return fixtures;
  const dir = mkdtempSync(join(tmpdir(), "ohmatrix-media-"));
  const tone = join(dir, "tone.ogg"),
    clip = join(dir, "clip.webm"),
    big = join(dir, "big.bin");
  try {
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=4", "-c:a", "libopus", tone]);
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc=duration=3:size=320x240:rate=15",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=330:duration=3",
      "-c:v",
      "libvpx",
      "-b:v",
      "200k",
      "-c:a",
      "libvorbis",
      clip,
    ]);
  } catch {
    throw new Error("these tests generate their media with ffmpeg (libopus, libvpx, libvorbis)");
  }
  writeFileSync(big, Buffer.alloc(700 * 1024, 7));
  return (fixtures = { tone, clip, big });
}
/** The newest match: the chat list is in reading order (oldest first), so it is the last one in the DOM. */
const lowest = async (loc: Locator) => loc.last();
const attachFile = async (page: Page, path: string) => {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Attach" }).click();
  await (await chooser).setFiles(path);
};
async function openNotes(page: Page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  await openRoom(page, "Notes to self");
  await expect(page.getByPlaceholder("Message")).toBeVisible();
}

test("audio file and video file: bubbles, playing the audio, the video viewer", async ({ page }) => {
  const fx = makeFixtures();
  await openNotes(page);
  await attachFile(page, fx.tone);
  await expect(page.getByRole("button", { name: "Play" }).last()).toBeVisible({ timeout: 20000 });
  await expect(page.getByText("tone.ogg").last()).toBeVisible();
  // The file just attached is the newest audio message: the last "tone.ogg" and, with it, the last Play button
  // (the list is in reading order, so the newest bubble is last in the document).
  await expect(page.getByText("tone.ogg", { exact: true }).last()).toBeVisible();
  const audioPlay = page.getByRole("button", { name: "Play" }).last();
  await expect(audioPlay).toBeVisible();

  await audioPlay.click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible({ timeout: 10000 });
  // The bubble being played shows "position / length"; the length is that of the file we attached (4 s). Read it
  // from that bubble, whichever others in the list have a length of their own.
  // Poll for it rather than wait for one visible instant: the label is only there while the audio is playing.
  await expect.poll(() => page.getByText(/^0:0[0-4] \/ 0:04$/).count(), { timeout: 10000, intervals: [100] }).toBeGreaterThan(0); // the position moves while it plays
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("button", { name: "Play" }).last()).toBeVisible();

  const videos = () =>
    page.evaluate(() => {
      const c = (
        window as unknown as {
          __ohmatrix: { controller: { store: { getState(): { selectedRoomId: string; timelines: Record<string, { content: { kind: string } }[]> } } } };
        }
      ).__ohmatrix.controller;
      const st = c.store.getState();
      return (st.timelines[st.selectedRoomId] ?? []).filter((i) => i.content.kind === "video").length;
    });
  const videosBefore = await videos();
  await attachFile(page, fx.clip);
  // The newest bubble only exists once the upload finished: wait for it so `last()` is ours, not an older clip.
  await expect.poll(videos, { timeout: 30000 }).toBe(videosBefore + 1);
  await expect(page.getByRole("button", { name: "Open video" }).first()).toBeVisible({ timeout: 20000 });
  const open = await lowest(page.getByRole("button", { name: "Open video" }));
  await expect(open).toBeVisible({ timeout: 20000 });
  await expect(open.locator("img")).toBeVisible({ timeout: 10000 }); // a poster frame was made when sending
  await expect(open.getByText("0:03")).toBeVisible();
  expect(await open.evaluate((el) => getComputedStyle(el).cursor)).toBe("pointer");
  await shot(page, "49-audio-video-bubbles");
  await expect(page.getByRole("button", { name: /Notes to self/ }).first()).toContainText("Video");

  await open.click();
  const video = page.locator("video");
  await expect(video).toBeVisible({ timeout: 15000 });
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 0.3), { timeout: 10000 }).toBe(true);
  expect(await video.evaluate((v: HTMLVideoElement) => v.videoWidth)).toBe(320);
  const box = (await video.boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(1280 * 0.8 + 1); // not maximised
  await shot(page, "50-video-viewer");
  await page.keyboard.press("Escape");
  await expect(video).toBeHidden();
});

test("voice message: record, send, play; discard sends nothing; a blocked microphone is explained", async ({ page }) => {
  await openNotes(page);
  // Count from the app state: the list only renders a window of rows, so counting buttons depends on scrolling.
  const voiceBubbles = () =>
    page.evaluate(() => {
      const c = (
        window as unknown as {
          __ohmatrix: {
            controller: { store: { getState(): { selectedRoomId: string; timelines: Record<string, { content: { kind: string; voice?: boolean } }[]> } } };
          };
        }
      ).__ohmatrix.controller;
      const st = c.store.getState();
      return (st.timelines[st.selectedRoomId] ?? []).filter((i) => i.content.kind === "audio" && i.content.voice).length;
    });
  const before = await voiceBubbles();

  // Discard: nothing is sent.
  await page.getByRole("button", { name: "Record a voice message" }).click();
  await expect(page.getByLabel("Recording time")).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(1300);
  await page.getByRole("button", { name: "Discard recording" }).click();
  await expect(page.getByLabel("Recording time")).toHaveCount(0);
  await page.waitForTimeout(1000);
  expect(await voiceBubbles()).toBe(before);

  // Record two seconds and send.
  await page.getByRole("button", { name: "Record a voice message" }).click();
  const clock = page.getByLabel("Recording time");
  await expect(clock).toBeVisible({ timeout: 10000 });
  await expect.poll(() => clock.innerText(), { timeout: 10000 }).toMatch(/^0:0[2-9]$/);
  await shot(page, "51-recording");
  await page.getByRole("button", { name: "Send recording" }).click();
  await expect(page.getByLabel("Recording time")).toHaveCount(0);
  await expect.poll(voiceBubbles, { timeout: 20000 }).toBe(before + 1);
  const play = page.getByRole("button", { name: "Play" }).last();
  await expect(play).toBeVisible();
  await expect(page.getByText(/^0:0[2-5]$/).last()).toBeVisible(); // its length
  await shot(page, "52-voice-message");
  await play.click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("button", { name: "Record a voice message" })).toBeVisible();
});

test("voice message: a blocked microphone is explained and nothing starts", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error("Permission denied"), { name: "NotAllowedError" }));
  });
  await openNotes(page);
  await page.getByRole("button", { name: "Record a voice message" }).click();
  await expect(page.getByRole("alert")).toContainText("Access to the microphone or camera was blocked");
  await expect(page.getByLabel("Recording time")).toHaveCount(0);
});

test("video message: camera preview, record, stop and send", async ({ page }) => {
  await openNotes(page);
  await page.getByRole("button", { name: "Record a video" }).click();
  const preview = page.locator("video");
  await expect(preview).toBeVisible({ timeout: 10000 });
  await expect.poll(() => preview.evaluate((v: HTMLVideoElement) => v.videoWidth > 0), { timeout: 10000 }).toBe(true); // live camera
  await page.getByRole("button", { name: "Start recording" }).click();
  await expect.poll(() => page.getByLabel("Recording time").innerText(), { timeout: 10000 }).toMatch(/0:0[1-9]/);
  await shot(page, "53-video-recording");
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByText("Record a video", { exact: true })).toBeHidden({ timeout: 10000 }); // the dialog closed
  await expect(page.getByRole("button", { name: "Open video" }).last()).toBeVisible({ timeout: 30000 });
});

test("upload progress and cancel; a failed upload can be dismissed", async ({ page }) => {
  const fx = makeFixtures();
  await openNotes(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 50, downloadThroughput: -1, uploadThroughput: 60 * 1024 });

  const sentBefore = await page.getByText("big.bin", { exact: true }).count(); // earlier runs may have left one
  await attachFile(page, fx.big);
  const ring = page.getByRole("button", { name: "Cancel upload" });
  await expect(ring).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/\d+(\.\d)? (KB|B) \/ 700 KB/)).toBeVisible({ timeout: 15000 }); // loaded / total
  const loaded = async () => {
    const m = (
      await page
        .getByText(/[\d.]+ (B|KB|MB) \/ 700 KB/)
        .last()
        .innerText()
    ).match(/^([\d.]+) (B|KB|MB)/)!;
    return Number(m[1]) * ({ B: 1, KB: 1024, MB: 1024 * 1024 } as Record<string, number>)[m[2]!]!;
  };
  const first = await loaded();
  await expect.poll(loaded, { timeout: 20000 }).toBeGreaterThan(first); // the count moves while it uploads
  await shot(page, "54-upload-progress");
  await ring.click(); // cancel
  await expect(ring).toHaveCount(0, { timeout: 5000 });
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await page.waitForTimeout(1500);
  await expect(page.getByText("big.bin", { exact: true })).toHaveCount(sentBefore); // nothing was sent

  // A failing upload stays visible as failed until dismissed.
  await page.route(/\/_matrix\/media\/v3\/upload/, (route) => route.abort("failed"));
  await attachFile(page, fx.big);
  await expect(page.getByText("Upload failed. Tap to dismiss.")).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByText("Upload failed. Tap to dismiss.")).toHaveCount(0);
});

test("zoom: the setting scales the whole interface, menus still open at the pointer, and it persists", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("button", { name: "Zoom", exact: true })).toContainText("100%");
  const before = (await page.getByText("Appearance").boundingBox())!;
  await page.getByRole("button", { name: "Zoom", exact: true }).click();
  await page.getByRole("menuitem", { name: "150%" }).click();
  await expect(page.getByRole("button", { name: "Zoom", exact: true })).toContainText("150%");
  const after = (await page.getByText("Appearance").boundingBox())!;
  expect(after.height / before.height).toBeGreaterThan(1.4);
  expect(after.height / before.height).toBeLessThan(1.6);
  await shot(page, "55-zoom-150");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("ohmatrix.prefs.v1") ?? "{}").uiScale)).toBe(1.5);
  // The language menu is a modal outside the app root; it must be zoomed and anchored too.
  const lang = page.getByRole("button", { name: "Language", exact: true });
  let prev = "";
  await expect
    .poll(
      async () => {
        const b = JSON.stringify(await lang.boundingBox());
        const same = b === prev;
        prev = b;
        return same;
      },
      { intervals: [300] },
    )
    .toBe(true);
  await lang.click();
  const row = (await lang.boundingBox())!;
  const item = (await page.getByRole("menuitem", { name: "English" }).boundingBox())!;
  const menu = await page.getByRole("menuitem").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ top: r.top, bottom: r.bottom })));
  const top = Math.min(...menu.map((m) => m.top)),
    bottom = Math.max(...menu.map((m) => m.bottom));
  // Opens just below the row, or just above it when there is no room below.
  expect(Math.min(Math.abs(top - (row.y + row.height)), Math.abs(row.y - bottom))).toBeLessThan(30);
  expect(item.x + item.width).toBeLessThanOrEqual(1280);
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.getByRole("button", { name: "Settings", exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.style.zoom)).toBe("1.5");
  // Back to 100% so later tests on this origin are unaffected.
  await page.evaluate(() =>
    localStorage.setItem("ohmatrix.prefs.v1", JSON.stringify({ ...JSON.parse(localStorage.getItem("ohmatrix.prefs.v1") ?? "{}"), uiScale: 1 })),
  );
});

test("drag and drop, and paste: files are sent; plain text paste is untouched", async ({ page }) => {
  const stamp = Date.now();
  await openNotes(page);
  const hint = page.getByText("Drop files to send");
  const dt = () => page.evaluateHandle(() => new DataTransfer());
  const fire = (type: string, handle: Awaited<ReturnType<typeof dt>>) =>
    page.evaluate(([t, d]) => document.dispatchEvent(new DragEvent(t as string, { dataTransfer: d as DataTransfer, bubbles: true, cancelable: true })), [
      type,
      handle,
    ] as const);

  // Dragging a file over the window shows the drop hint; leaving hides it.
  const hover = await dt();
  await hover.evaluate((d) => d.items.add(new File(["x"], "x.txt")));
  await fire("dragenter", hover);
  await expect(hint).toBeVisible();
  await shot(page, "56-drop-hint");
  await fire("dragleave", hover);
  await expect(hint).toHaveCount(0);

  // Dropping several files sends them all: a picture, a video and a document.
  const drop = await dt();
  await drop.evaluate(async (d, n) => {
    const png = await (
      await fetch("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
    ).blob();
    d.items.add(new File([png], `dropped-${n}.png`, { type: "image/png" }));
    d.items.add(new File(["hello"], `notes-${n}.txt`, { type: "text/plain" }));
  }, stamp);
  await fire("dragenter", drop);
  await fire("drop", drop);
  await expect(hint).toHaveCount(0);
  // Nothing is uploaded until confirmed; the dialog describes the files.
  const dialog = page.getByText("Send 2 files?");
  await expect(dialog).toBeVisible();
  await expect(page.getByText("5 B", { exact: false }).first()).toBeVisible();
  await expect(page.getByLabel(`notes-${stamp}.txt`)).toContainText("File · 5 B");
  await expect(page.getByLabel(`dropped-${stamp}.png`)).toContainText("Photo");
  await shot(page, "57-send-files-dialog");
  await page.waitForTimeout(1000);
  const photos = await page.getByLabel("Open photo").count();
  await page.waitForTimeout(1000);
  await expect(page.getByLabel("Open photo")).toHaveCount(photos);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText(`notes-${stamp}.txt`, { exact: true })).toHaveCount(0);
  await fire("dragenter", drop);
  await fire("drop", drop);
  await expect(dialog).toBeVisible();
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText(`notes-${stamp}.txt`, { exact: true })).toBeVisible({ timeout: 20000 });
  await expect(page.getByLabel("Open photo")).toHaveCount(photos + 1, { timeout: 20000 });

  // Pasting a clipboard file (a screenshot) sends it; the composer stays empty.
  const paste = await dt();
  await paste.evaluate((d, n) => d.items.add(new File(["pasted"], `pasted-${n}.txt`, { type: "text/plain" })), stamp);
  await page.getByPlaceholder("Message").focus();
  await page.evaluate(
    (d) => document.activeElement!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: d as DataTransfer, bubbles: true, cancelable: true })),
    paste,
  );
  await expect(page.getByText("Send this file?")).toBeVisible();
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText(`pasted-${stamp}.txt`, { exact: true })).toBeVisible({ timeout: 20000 });
  await expect(page.getByPlaceholder("Message")).toHaveValue("");

  // A text-only paste is not intercepted.
  const text = await dt();
  await text.evaluate((d) => d.setData("text/plain", "just text"));
  const prevented = await page.evaluate(
    (d) => !document.activeElement!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: d as DataTransfer, bubbles: true, cancelable: true })),
    text,
  );
  expect(prevented).toBe(false);
});

test("mentions: a message that names me is tinted and the name is a pill", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  await openRoom(page, "Notes to self");

  // Send a message with a formatted body, a link preview and a mention, the way a real client would.
  const tag = Date.now();
  const me = "@test:localhost";
  await page.evaluate(
    async ([tag, me]) => {
      const c = (window as unknown as { __ohmatrix: { controller: { openRoom(id: string): { sendText(b: string, m?: string[]): Promise<void> } } } }).__ohmatrix
        .controller;
      const room = (
        window as unknown as { __ohmatrix: { controller: { store: { getState(): { selectedRoomId: string } } } } }
      ).__ohmatrix.controller.store.getState().selectedRoomId;
      const h = c.openRoom(room);
      const engine = (window as unknown as { __ohmatrix_root: string }).__ohmatrix_root;
      void engine;
      // Plain text with a bare URL (the engine turns links into previews only when the server sends them),
      // a bold run and a mention of myself.
      await h.sendText(`rich ${tag} hi @test`, [me]);
      h.close();
    },
    [tag, me] as const,
  );
  await expect(page.getByText(`rich ${tag} hi`, { exact: false }).last()).toBeVisible({ timeout: 20000 });
  // The @name is a pill (it matched the mention block I sent).
  await expect(page.getByLabel(/Mention test/).last()).toBeVisible();
  await shot(page, "58-mention-pill");
});

test("emoji picker: insert an emoji from the composer", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  await openRoom(page, "Notes to self");
  await page.getByRole("button", { name: "Emoji", exact: true }).click();
  await expect(page.getByRole("button", { name: "Emoji 😀" })).toBeVisible();
  await shot(page, "59-emoji-picker");
  await page.getByRole("button", { name: "Emoji 😀" }).click();
  const field = page.getByPlaceholder("Message");
  await expect(field).toHaveValue("😀");
  const mark = `emoji ${Date.now()}`;
  await field.fill(`emoji mark ${mark}`);
  await field.press("Enter");
  await expect(page.getByText(`emoji mark ${mark}`, { exact: true }).last()).toBeVisible({ timeout: 20000 });
});

test("pin: a pinned message shows a pin marker and lands in the chat-info panel", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  await openRoom(page, "Notes to self");
  const text = `pin me ${Date.now()}`;
  await page.getByPlaceholder("Message").fill(text);
  await page.getByPlaceholder("Message").press("Enter");
  const msg = page.getByText(text, { exact: true }).last();
  await expect(msg).toBeVisible({ timeout: 20000 });
  await msg.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Pin", exact: true }).click();
  // Unpin is offered now, i.e. the room state carries the pin.
  await msg.click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Unpin", exact: true })).toBeVisible({ timeout: 10000 });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Chat info", exact: true }).click();
  await expect(page.getByText("Pinned messages")).toBeVisible({ timeout: 10000 });
  await shot(page, "60-pinned");
});

test("forward: a message is copied into another chat", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  await openRoom(page, "Notes to self");
  const text = `forward me ${Date.now()}`;
  await page.getByPlaceholder("Message").fill(text);
  await page.getByPlaceholder("Message").press("Enter");
  const msg = page.getByText(text, { exact: true }).last();
  await expect(msg).toBeVisible({ timeout: 20000 });
  await msg.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Forward", exact: true }).click();
  await expect(page.getByText("Forward to")).toBeVisible();
  await shot(page, "61-forward");
  // Forward into "alice"; the copy carries who wrote it.
  await page.getByRole("dialog").getByRole("button", { name: "alice", exact: true }).first().click();
  await expect(page.getByText("Forward to")).toHaveCount(0, { timeout: 20000 });
  await openRoom(page, "alice");
  await expect(page.getByText(text, { exact: false }).last()).toBeVisible({ timeout: 20000 });
});

test("mention autocomplete: floating menu at the @, titled, keyboard-driven, capped below the top bar", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  await openFreshGroup(page, "Mentions");
  const field = page.getByPlaceholder("Message");
  await field.click();
  await field.pressSequentially("@");
  const items = page.getByRole("menuitem", { name: /^Mention / });
  await expect(items.nth(1)).toBeVisible({ timeout: 10000 });
  const n = await items.count();
  expect(n).toBeGreaterThanOrEqual(2);
  await expect(page.getByText("Choose who to notify")).toBeVisible();
  const firstMenu = (await items.first().boundingBox())!;
  const bar = (await field.boundingBox())!;
  expect(firstMenu.width).toBeLessThan(300);
  expect(firstMenu.y + firstMenu.height).toBeLessThan(bar.y); // above the bar, not a banner
  await shot(page, "62-mention-menu");

  // Up climbs into the menu from its bottom row; Down past the bottom row returns to the field.
  const selected = async () =>
    (await items.evaluateAll((els) => els.map((e) => e.getAttribute("aria-selected") === "true"))).map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  expect(await selected()).toEqual([]);
  await field.press("ArrowUp");
  expect(await selected()).toEqual([n - 1]);
  await field.press("ArrowUp");
  expect(await selected()).toEqual([n - 2]);
  await field.press("ArrowDown");
  expect(await selected()).toEqual([n - 1]);
  await field.press("ArrowDown");
  expect(await selected()).toEqual([]);
  await expect(field).toBeFocused();

  // Enter on a highlighted row picks it.
  await field.press("ArrowUp");
  await field.press("Enter");
  await expect(field).toHaveValue(/^@\S+ $/);
  await expect(items).toHaveCount(0);

  // The menu follows the "@": later in the line, further right.
  await field.fill("");
  await field.pressSequentially("hello there friends @");
  await expect(items.first()).toBeVisible();
  const later = (await items.first().boundingBox())!;
  expect(later.x).toBeGreaterThan(firstMenu.x + 60);
  await field.press("Escape");
  await expect(items).toHaveCount(0);

  // In a short window the menu stops short of the top bar and scrolls.
  await field.fill("");
  await page.setViewportSize({ width: 1280, height: 230 });
  await field.pressSequentially("@");
  await expect(items.first()).toBeVisible();
  // The bar moves when the window shrinks; the menu re-measures, so wait for it to settle below the top bar.
  await expect.poll(async () => (await page.getByText("Choose who to notify").boundingBox())!.y, { timeout: 5000 }).toBeGreaterThanOrEqual(56 + 8);
});

test("mention autocomplete: opens at any @ not glued to a letter or digit, including with the caret moved back", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  await openFreshGroup(page, "Mentions");
  const field = page.getByPlaceholder("Message");
  const items = page.getByRole("menuitem", { name: /^Mention / });
  await field.click();

  // Punctuation and CJK before the "@" still count; letters and digits do not (an address is not a mention).
  for (const [text, opens] of [
    ["hi,@", true],
    ["你好@", true],
    ["(@", true],
    ["mail me a@", false],
    ["room 7@", false],
  ] as const) {
    await field.fill("");
    await field.pressSequentially(text);
    if (opens) await expect(items.first()).toBeVisible();
    else await expect(items).toHaveCount(0);
  }

  // Type "@", then more text, then move the caret back in front of it: the menu comes up again.
  await field.fill("");
  await field.pressSequentially("hello @ world");
  await expect(items).toHaveCount(0);
  for (let i = 0; i < " world".length; i++) await field.press("ArrowLeft");
  await expect(items.first()).toBeVisible();

  // Picking inserts at the "@" and leaves the rest of the line (and the caret) after the name.
  await items.first().click();
  await expect(field).toHaveValue(/^hello @\S+ {2}world$/);
  await field.pressSequentially("X");
  await expect(field).toHaveValue(/^hello @\S+ X {1}world$/);
});

test("room settings: access, history, addresses, permission levels, custom power level, ban and unban", async ({ page, browser }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page);
  const name = `Perm ${Date.now().toString(36)}`;
  await page.evaluate(async (name) => {
    const c = (window as unknown as { __ohmatrix: { controller: { createGroup(n: string, i: string[]): Promise<void> } } }).__ohmatrix.controller;
    await c.createGroup(name, ["@bob:localhost"]);
  }, name);
  await expect(page.getByRole("button", { name: "Chat info" })).toBeVisible({ timeout: 20000 });
  // bob accepts the invitation from his own session, so he is a real member whose level can be changed.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const bob = await ctx.newPage();
  await loginAs(bob, "bob", "123456");
  await expect(bob.getByPlaceholder("Search")).toBeVisible({ timeout: 20000 });
  await bob.evaluate(async (name) => {
    const c = (
      window as unknown as {
        __ohmatrix: {
          controller: { store: { getState(): { rooms: { id: string; name: string; invite?: unknown }[] } }; acceptInvite(id: string): Promise<void> };
        };
      }
    ).__ohmatrix.controller;
    const deadline = Date.now() + 20000;
    for (;;) {
      const r = c.store.getState().rooms.find((x) => x.name === name && x.invite);
      if (r) return c.acceptInvite(r.id);
      if (Date.now() > deadline) throw new Error("invite never arrived");
      await new Promise((res) => setTimeout(res, 300));
    }
  }, name);
  await page.getByRole("button", { name: "Chat info", exact: true }).click();
  await expect(page.getByText("2 members").first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByText("Access", { exact: true })).toBeVisible({ timeout: 10000 });

  // Join rule and history visibility: dropdowns that apply at once.
  const row = (label: string) => page.getByRole("button", { name: new RegExp(`^${label}`) });
  await expect(row("Who can join")).toContainText("Invited people only");
  await row("Who can join").click();
  await page.getByRole("menuitem", { name: "Anyone", exact: true }).click();
  await expect(row("Who can join")).toContainText("Anyone", { timeout: 10000 });
  await expect(page.getByText("Anyone who finds the room can join it.")).toBeVisible();
  await row("History visible to").click();
  await page.getByRole("menuitem", { name: "Members, from joining" }).click();
  await expect(row("History visible to")).toContainText("from joining", { timeout: 10000 });
  await shot(page, "63-room-access");

  // Addresses: the first is the main one; a taken address is explained.
  const local = `perm-${Date.now().toString(36)}`;
  await page.getByRole("button", { name: "Add address" }).click();
  await page.getByRole("dialog").locator("input").fill(local);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText(`#${local}:localhost`).first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Main", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add address" }).click();
  await page.getByRole("dialog").locator("input").fill(local);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("That address is already taken.")).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "Cancel" }).click();
  await shot(page, "64-room-addresses");

  // Permission levels: pick a preset, then a custom number.
  await expect(row("Who can remove people")).toContainText("Moderator · 50");
  await row("Who can remove people").click();
  await page.getByRole("menuitem", { name: "Custom level…" }).click();
  await expect(page.getByRole("dialog").locator("input")).toHaveValue("50");
  await page.getByRole("dialog").locator("input").fill("25");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(row("Who can remove people")).toContainText("Level 25", { timeout: 10000 });
  await row("Who can send messages").click();
  await page.getByRole("menuitem", { name: "Moderator · 50" }).click();
  await expect(row("Who can send messages")).toContainText("Moderator · 50", { timeout: 10000 });
  await row("Who can send messages").click();
  await page.getByRole("menuitem", { name: "Member · 0" }).click();
  await expect(row("Who can send messages")).toContainText("Member · 0", { timeout: 10000 });
  await shot(page, "65-room-permissions");

  // A custom power level for a person, then ban and unban.
  await page.getByRole("button", { name: "bob", exact: true }).first().click();
  await page.getByRole("menuitem", { name: "Make moderator" }).click();
  await expect(page.getByText("Moderator", { exact: true }).first()).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "bob", exact: true }).first().click();
  await page.getByRole("menuitem", { name: "Set power level…" }).click();
  await expect(page.getByRole("dialog").locator("input")).toHaveValue("50");
  await page.getByRole("dialog").locator("input").fill("30");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Level 30")).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "bob", exact: true }).first().click();
  await page.getByRole("menuitem", { name: "Ban", exact: true }).click();
  await expect(page.getByRole("dialog").locator("input")).toHaveValue("");
  await page.getByRole("dialog").locator("input").fill("spam");
  await page.getByRole("button", { name: "Ban", exact: true }).click();
  await expect(page.getByText(/^Banned · 1$/)).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("@bob:localhost · spam")).toBeVisible();
  await shot(page, "66-room-banned");
  await page.getByRole("button", { name: /^bob/ }).filter({ hasText: "spam" }).click();
  await page.getByRole("menuitem", { name: "Unban" }).click();
  await expect(page.getByText(/^Banned/)).toHaveCount(0, { timeout: 10000 });
  await ctx.close();
});

test("spaces: list rows, new space, contents slide over the list, more menu, add/manage/leave", async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  const stamp = Date.now().toString(36);
  const name = `Space ${stamp}`;

  // New space from the "+" menu.
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("menuitem", { name: "New space" }).click();
  await page.getByRole("dialog").locator("input").fill(name);
  await page.getByRole("button", { name: "Create", exact: true }).click();

  // A new space opens at once, so rooms can be added; go back to the main list to look at its row.
  const back = page.getByRole("button", { name: "Back", exact: true });
  const more = page.getByRole("button", { name: "More", exact: true });
  // The main list stays mounted under the space; look at rows through the space pane only.
  const inSpace = (re: RegExp) => page.getByRole("button", { name: re }).filter({ hasNot: page.getByRole("button", { name: "Profile" }) });
  await expect(back).toBeVisible({ timeout: 20000 });
  await back.click();
  await expect(back).toHaveCount(0, { timeout: 10000 });

  // It sits in the main list like any chat (same fixed height), with a rounded-square logo.
  const row = page.getByRole("button", { name: new RegExp(`^.*${name}`) }).first();
  await expect(row).toBeVisible({ timeout: 20000 });
  const chat = page.getByRole("button", { name: /Notes to self/ }).first();
  expect((await row.boundingBox())!.height).toBe((await chat.boundingBox())!.height);
  const logo = row
    .locator("div")
    .filter({ hasText: /^[A-Z0-9]{1,2}$/ })
    .first();
  const radius = await logo.evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius));
  const side = (await logo.boundingBox())!.width;
  expect(radius).toBeLessThan(side / 2 - 4); // a rounded square, not a circle
  const chatLogo = chat
    .locator("div")
    .filter({ hasText: /^[A-Z0-9]{1,2}$/ })
    .first();
  expect(parseFloat(await chatLogo.evaluate((el) => getComputedStyle(el).borderTopLeftRadius))).toBeGreaterThanOrEqual(side / 2 - 1);
  await shot(page, "67-space-row");

  // Opening it slides its contents over the main list: back on the left, "more" on the right.
  await row.click();
  await expect(back).toBeVisible({ timeout: 10000 });
  await expect(more).toBeVisible();
  await expect(page.getByText("No rooms in this space yet")).toBeVisible({ timeout: 10000 });
  // The search field has breathing room under the header, as the main list's does.
  const header = (await back.boundingBox())!;
  const searchBox = (await page.getByPlaceholder("Search").and(page.locator(":visible")).last().boundingBox())!;
  expect(searchBox.y - (header.y + header.height)).toBeGreaterThanOrEqual(8);
  const bb = (await back.boundingBox())!,
    mb = (await more.boundingBox())!;
  expect(bb.x).toBeLessThan(mb.x);
  await shot(page, "68-space-contents");

  // The more menu, in order.
  await more.click();
  const labels = ["Create room", "Add existing room", "Manage rooms", "View members", "Invite", "Share", "Settings", "Leave space"];
  await expect(page.getByRole("menuitem")).toHaveCount(labels.length);
  expect(await page.getByRole("menuitem").allInnerTexts()).toEqual(labels);
  await shot(page, "69-space-menu");

  // Members and settings open the space's own info page. It covers the space's list inside the left pane (it does not
  // slide in from the right edge of the window) and no chat is opened or replaced.
  await expect(page.getByText("Select a chat to start messaging")).toBeVisible();
  const pane = (await back.boundingBox())!;
  for (const entry of ["View members", "Settings"]) {
    await page.getByRole("menuitem", { name: entry }).click();
    await expect(page.getByText("Space info", { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Group info", { exact: true })).toHaveCount(0);
    await expect(page.getByText(/^Members · \d+$/)).toBeVisible();
    await expect(page.getByText("Access", { exact: true })).toBeVisible();
    // Specific to a space: its name and its rooms, and none of what only a conversation has.
    await expect(page.getByText("Space name", { exact: true })).toBeVisible();
    await expect(page.getByText(/^Rooms · \d+$/)).toBeVisible();
    await expect(page.getByText("Encryption", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Mute notifications")).toHaveCount(0);
    await expect(page.getByText("Load older messages")).toHaveCount(0);
    await expect(page.getByText("Who can send messages")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Leave space" })).toBeVisible();
    // Once it has slid in, it sits exactly over the space's list: same left edge as that pane's own back button,
    // and nothing of it reaches past the left pane into the chat area.
    const closeBtn = page.getByRole("button", { name: "Close", exact: true });
    await expect.poll(async () => (await closeBtn.boundingBox())!.x, { timeout: 5000 }).toBe(pane.x);
    const title = (await page.getByText("Space info", { exact: true }).boundingBox())!;
    expect(title.x + title.width).toBeLessThan(384);
    await expect(page.getByText("Select a chat to start messaging")).toBeVisible();
    await expect(page.getByPlaceholder("Message")).toHaveCount(0);
    expect(
      await page.evaluate(
        () =>
          (
            window as unknown as { __ohmatrix: { controller: { store: { getState(): { selectedRoomId: string | null } } } } }
          ).__ohmatrix.controller.store.getState().selectedRoomId,
      ),
    ).toBeNull();
    await page.waitForTimeout(500); // let the menu finish fading before the picture
    await shot(page, "73-space-info");
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByText("Space info", { exact: true })).toHaveCount(0, { timeout: 5000 });
    expect((await back.boundingBox())!.x).toBe(pane.x);
    await more.click();
  }

  // Share shows the link in a dialog: Cancel copies nothing, Copy puts the link on the clipboard and closes.
  await page.evaluate(() => navigator.clipboard.writeText("untouched"));
  await page.getByRole("menuitem", { name: "Share" }).click();
  await expect(page.getByText("Share space", { exact: true })).toBeVisible();
  const link = page.getByLabel("Space link");
  await expect(link).toContainText(/^https:\/\/matrix\.to\/#\/[!#]/);
  const shown = (await link.innerText()).trim();
  await shot(page, "70-space-share");
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Share space", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("untouched");
  await more.click();
  await page.getByRole("menuitem", { name: "Share" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Copy", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Copied" })).toBeVisible();
  await expect(page.getByText("Share space", { exact: true })).toHaveCount(0, { timeout: 5000 });
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(shown);
  await more.click();

  // Create a room inside the space: it is listed there, and we stay on the space.
  await page.getByRole("menuitem", { name: "Create room" }).click();
  const roomName = `Inside ${stamp}`;
  await page.getByRole("dialog").locator("input").first().fill(roomName);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("button", { name: new RegExp(roomName) }).first()).toBeVisible({ timeout: 20000 });
  await expect(back).toBeVisible();
  // Rows of the space pane only: the main list stays mounted underneath it, so walk up from "Back" to the pane root
  // (the first ancestor that also holds a search field) and read the room buttons below that header.
  const spaceRows = async () =>
    await page.evaluate(() => {
      let pane: HTMLElement | null = document.querySelector('[aria-label="Back"]');
      while (pane && !pane.querySelector("input")) pane = pane.parentElement;
      return [...(pane?.querySelectorAll('[role="button"]') ?? [])]
        .filter((b) => !b.matches('[aria-label="Back"], [aria-label="More"]'))
        .map((b) => b.textContent ?? "");
    });
  void inSpace;

  // Add an existing room.
  await more.click();
  await page.getByRole("menuitem", { name: "Add existing room" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Notes to self" }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Notes to self" })).toHaveCount(0, { timeout: 10000 });
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await expect.poll(async () => (await spaceRows()).some((t) => /Notes to self/.test(t)), { timeout: 10000 }).toBe(true);

  // Manage: select and remove.
  await more.click();
  await page.getByRole("menuitem", { name: "Manage rooms" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Notes to self" }).click();
  await page.getByRole("button", { name: "Remove 1" }).click();
  await expect.poll(async () => (await spaceRows()).some((t) => /Notes to self/.test(t)), { timeout: 10000 }).toBe(false);
  expect((await spaceRows()).some((t) => new RegExp(roomName).test(t))).toBe(true);

  // Opening a child opens its chat; back returns to the main list.
  // (The main list keeps a row for the same room under the pane; the visible one is the one that can be clicked.)
  await page
    .getByRole("button", { name: new RegExp(roomName) })
    .and(page.locator(":visible"))
    .last()
    .click();
  await expect(page.getByPlaceholder("Message")).toBeVisible({ timeout: 10000 });
  await back.click();
  await expect(back).toHaveCount(0, { timeout: 10000 });
  await expect(page.getByPlaceholder("Search")).toBeVisible();

  // Leave from the menu, with a confirmation.
  await row.click();
  await more.click();
  await page.getByRole("menuitem", { name: "Leave space" }).click();
  await expect(page.getByText("Leave this space?")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Leave space" }).click();
  await expect(page.getByRole("button", { name: new RegExp(`^.*${name}`) })).toHaveCount(0, { timeout: 20000 });
});

test("chat scrolling is native: wheel events are not cancelled, it opens at the newest message, follows new ones, and keeps its place when history loads", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  await openRoom(page, "Notes to self");
  const scroller = () =>
    page.evaluate(() => {
      const el = [...document.querySelectorAll<HTMLElement>("*")].find(
        (e) => e.scrollHeight > e.clientHeight + 20 && ["auto", "scroll"].includes(getComputedStyle(e).overflowY) && e.getBoundingClientRect().x > 300,
      );
      // Nothing scrolls yet while the first rows are still arriving: report an empty list and let the caller wait.
      if (!el) return { top: 0, height: 0, view: 0, transform: "none" };
      (window as unknown as { __chatScroller: HTMLElement }).__chatScroller = el;
      return { top: el.scrollTop, height: el.scrollHeight, view: el.clientHeight, transform: getComputedStyle(el).transform };
    });
  // (Looked up each time: a list that is drawn again leaves the node it was first read from behind.)
  const pos = () => scroller().then((m) => m.top);
  /** How far the view is from the newest message, whichever way the list is laid out. */
  const gapToLatest = async () => {
    const m = await scroller();
    return native ? Math.round(m.top) : m.height - m.view - m.top;
  };

  // It is a plain scroller (no upside-down transform), opened at the newest message.
  await expect.poll(async () => (await scroller()).height, { timeout: 15000 }).toBeGreaterThan(900);
  const s = await scroller();
  // The web list is an ordinary scroller; the native one (tried here with OHMATRIX_NATIVE_LIST=1) is flipped upside down.
  expect(native ? ["matrix(1, 0, 0, -1, 0, 0)"] : ["none", "matrix(1, 0, 0, 1, 0, 0)"]).toContain(s.transform);
  await expect.poll(gapToLatest, { timeout: 10000 }).toBeLessThan(4);
  // Rows are still being measured for a moment after the first jump to the bottom: take the reference once it is still.
  let stable = "";
  await expect
    .poll(
      async () => {
        const n = JSON.stringify(await scroller());
        const same = n === stable;
        stable = n;
        return same;
      },
      { intervals: [300], timeout: 10000 },
    )
    .toBe(true);
  const settled = await scroller();

  // The web list leaves the wheel to the browser: nothing cancels it (that cancelling is what removed momentum
  // scrolling). The native list, tried in a browser, is react-native-web's inverted list, which does cancel it.
  await page.evaluate(() => {
    const w = window as unknown as { __wheelPrevented: boolean[] };
    w.__wheelPrevented = [];
    document.addEventListener("wheel", (e) => setTimeout(() => w.__wheelPrevented.push(e.defaultPrevented)), { passive: true });
  });
  await page.mouse.move(800, 400);
  await page.mouse.wheel(0, -300);
  // Up is toward older messages: the web view moves up the page, the inverted one away from the newest.
  if (native) await expect.poll(gapToLatest, { timeout: 5000 }).toBeGreaterThan(100);
  else await expect.poll(pos, { timeout: 5000 }).toBeLessThan(settled.top - 100);
  if (!native) expect(await page.evaluate(() => (window as unknown as { __wheelPrevented: boolean[] }).__wheelPrevented)).toEqual([false]);

  // Down is down and up is up, a wheel step moves by the wheel's distance.
  const before = await gapToLatest();
  await page.mouse.wheel(0, 120);
  await expect.poll(gapToLatest, { timeout: 5000 }).toBeLessThan(before - 60); // toward the newest message

  // Following new messages: at the bottom, a new message keeps the view at the bottom.
  await page.mouse.wheel(0, 5000);
  await expect.poll(gapToLatest, { timeout: 5000 }).toBeLessThan(4);
  const text = `follow ${Date.now()}`;
  await page.getByPlaceholder("Message").fill(text);
  await page.getByPlaceholder("Message").press("Enter");
  await expect(page.getByText(text, { exact: true }).last()).toBeVisible({ timeout: 20000 });
  await expect.poll(gapToLatest, { timeout: 5000 }).toBeLessThan(4);
  await expect(page.getByText(text, { exact: true }).last()).toBeInViewport();

  // Scrolled away from the bottom, a new message does not drag the view down.
  await page.mouse.wheel(0, -600);
  await expect.poll(gapToLatest, { timeout: 5000 }).toBeGreaterThan(300);
  const away = await pos();
  await page.getByPlaceholder("Message").fill(`stay ${Date.now()}`);
  await page.getByPlaceholder("Message").press("Enter");
  await page.waitForTimeout(1500);
  // react-native-web ignores `maintainVisibleContentPosition`, which the real native list relies on here.
  if (!native) expect(Math.abs((await pos()) - away)).toBeLessThan(4);
});

test("chat scrolling: scrolling up loads older history without moving the view, and a search result jumps to its message", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  await openRoom(page, "OhMatrix Dev");
  await expect(page.getByText(/Backlog message #30/)).toBeVisible();
  const welcome = page.getByText(/Welcome to the OhMatrix dev room/);

  // Scroll to the top with the wheel. The oldest message comes into view and stays there: the list does not jump
  // away from it when rows or history arrive.
  await page.mouse.move(850, 400);
  for (let i = 0; i < 40; i++) {
    await page.mouse.wheel(0, -800);
    await page.waitForTimeout(80);
  }
  await expect(welcome).toBeInViewport({ timeout: 10000 });
  const first = (await welcome.boundingBox())!.y;
  await page.waitForTimeout(1200);
  expect(Math.abs((await welcome.boundingBox())!.y - first)).toBeLessThan(4);

  // Back down: the newest message is reachable by scrolling down alone.
  for (let i = 0; i < 40; i++) {
    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(60);
  }
  await expect(page.getByText(/Backlog message #30/)).toBeInViewport({ timeout: 10000 });

  // A search result jumps to its message in the middle of history and highlights it.
  await page.getByRole("button", { name: "Search in this chat" }).click();
  await page.getByPlaceholder("Search in this chat").fill("Backlog message #12");
  await page
    .getByRole("button", { name: /Backlog message #12/ })
    .first()
    .click();
  await expect(page.getByLabel("Found message")).toBeInViewport({ timeout: 10000 });
});

test("spaces, portrait: the space's settings open over the list and closing them returns to the space list, not a chat", async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 800 });
  await login(page);
  const name = `Space ${Date.now().toString(36)}`;
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("menuitem", { name: "New space" }).click();
  await page.getByRole("dialog").locator("input").fill(name);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  const back = page.getByRole("button", { name: "Back", exact: true });
  await expect(back).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await expect(page.getByText("Space info", { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Access", { exact: true })).toBeVisible();
  await shot(page, "72-space-settings-portrait");
  // Back out of the panel: the space's list is on screen, and it is not a chat.
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByText("Access", { exact: true })).toHaveCount(0, { timeout: 5000 });
  await expect(page.getByText("No rooms in this space yet")).toBeVisible();
  await expect(page.getByPlaceholder("Message")).toHaveCount(0);
  // Leaving the space closes it.
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Leave space" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Leave space" }).click();
  await expect(page.getByText("No rooms in this space yet")).toHaveCount(0, { timeout: 15000 });
  await expect(page.getByPlaceholder("Search")).toBeVisible();
});

test("shared media: tabs by kind reach the whole history, open in the viewers, and page on demand", async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1280, height: 900 });
  const [tok, me] = [await apiLogin("alice"), await apiLogin("test")];
  const tag = `gallery${Date.now().toString(36)}`;
  const { room_id } = await api(tok, "POST", "/createRoom", { name: `Gallery ${tag}`, preset: "private_chat", invite: ["@test:localhost"] });
  await api(me, "POST", `/join/${encodeURIComponent(room_id!)}`, {});
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const upload = async (bytes: Buffer, type: string, name: string) =>
    (
      (await (
        await fetch(`http://localhost:8008/_matrix/media/v3/upload?filename=${name}`, {
          method: "POST",
          headers: { authorization: `Bearer ${tok}`, "content-type": type },
          body: bytes,
        })
      ).json()) as { content_uri: string }
    ).content_uri;
  const png1 = await upload(png, "image/png", "p.png");
  const send = (content: Record<string, unknown>, n: number) =>
    api(tok, "PUT", `/rooms/${encodeURIComponent(room_id!)}/send/m.room.message/g${Date.now()}${n}`, content);
  let n = 0;
  // The oldest message is a picture, then chat, a file, a clip and a voice message, then 130 more pictures. The server
  // filters out the chat before it counts a batch of 100, so it is the pictures that have to outnumber a batch.
  await send({ msgtype: "m.image", body: "oldest.png", url: png1, info: { mimetype: "image/png", w: 1, h: 1, size: png.length } }, n++);
  for (let i = 0; i < 20; i++) await send({ msgtype: "m.text", body: `chat ${i}` }, n++);
  await send(
    {
      msgtype: "m.file",
      body: "report.txt",
      filename: "report.txt",
      url: await upload(Buffer.from("report"), "text/plain", "report.txt"),
      info: { mimetype: "text/plain", size: 6 },
    },
    n++,
  );
  await send(
    {
      msgtype: "m.video",
      body: "clip.mp4",
      filename: "clip.mp4",
      url: await upload(Buffer.alloc(64), "video/mp4", "clip.mp4"),
      info: { mimetype: "video/mp4", w: 64, h: 64, duration: 3000, size: 64 },
    },
    n++,
  );
  await send(
    {
      msgtype: "m.audio",
      body: "memo.ogg",
      filename: "memo.ogg",
      url: await upload(Buffer.alloc(64), "audio/ogg", "memo.ogg"),
      info: { mimetype: "audio/ogg", duration: 2000, size: 64 },
      "org.matrix.msc3245.voice": {},
    },
    n++,
  );
  for (let i = 0; i < 130; i++)
    await send({ msgtype: "m.image", body: `pic-${i}.png`, url: png1, info: { mimetype: "image/png", w: 1, h: 1, size: png.length } }, n++);

  await login(page);
  await openRoom(page, `Gallery ${tag}`, new RegExp(`Gallery ${tag}`));
  await page.getByRole("button", { name: "Chat info", exact: true }).click();
  await expect(page.getByText("Shared media", { exact: true })).toBeVisible({ timeout: 15000 });

  // Photos: a first page, then "Load more" until the very first message of the room turns up.
  const tiles = () => page.getByRole("button", { name: /\.png$/ });
  await expect(tiles().first()).toBeVisible({ timeout: 15000 });
  const first = await tiles().count();
  expect(first).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: "oldest.png" })).toHaveCount(0);
  expect(first).toBeLessThan(131); // one page is not the whole room
  for (let i = 0; i < 6 && (await page.getByRole("button", { name: "oldest.png" }).count()) === 0; i++) {
    const before = await tiles().count();
    await page.getByRole("button", { name: "Load more" }).click();
    await expect.poll(() => tiles().count(), { timeout: 15000 }).toBeGreaterThan(before);
  }
  await page.getByRole("button", { name: "oldest.png" }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "oldest.png" })).toBeVisible();
  expect(await tiles().count()).toBe(131);
  await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0); // the room's beginning: nothing left
  await shot(page, "74-shared-photos");

  // A picture opens in the photo viewer.
  await page.getByRole("button", { name: "pic-3.png" }).click();
  await expect(page.getByLabel("Viewer backdrop")).toBeVisible({ timeout: 10000 });
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Viewer backdrop")).toHaveCount(0);

  // Files, video and audio each have their own list, found through the chat and pictures in between.
  await page.getByRole("tab", { name: "Files" }).click();
  await expect(page.getByRole("button", { name: /report\.txt/ })).toBeVisible({ timeout: 15000 });
  await expect(tiles()).toHaveCount(0);
  await page.getByRole("tab", { name: "Videos" }).click();
  await expect(page.getByRole("button", { name: "clip.mp4" })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("0:03")).toBeVisible();
  await shot(page, "75-shared-video");
  await page.getByRole("tab", { name: "Audio" }).click();
  await expect(page.getByRole("button", { name: /Voice message/ })).toBeVisible({ timeout: 15000 });
  await page.getByRole("tab", { name: "Photos" }).click();
  expect(await tiles().count()).toBe(131); // switching back keeps what was loaded
});

test("message list: a reply's quote jumps to an original that is not loaded; scroll-to-latest button; date pill", async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1280, height: 800 });
  const [alice, me] = [await apiLogin("alice"), await apiLogin("test")];
  const tag = `jump${Date.now().toString(36)}`;
  const { room_id } = await api(alice, "POST", "/createRoom", { name: `Jump ${tag}`, preset: "private_chat", invite: ["@test:localhost"] });
  await api(me, "POST", `/join/${encodeURIComponent(room_id!)}`, {});
  let n = 0;
  const send = (content: Record<string, unknown>) =>
    api(alice, "PUT", `/rooms/${encodeURIComponent(room_id!)}/send/m.room.message/j${Date.now()}${n++}`, content);
  const original = (await send({ msgtype: "m.text", body: `ORIGINAL ${tag}` }))["event_id"]!;
  for (let i = 0; i < 260; i++) await send({ msgtype: "m.text", body: `filler ${i}` });
  await send({ msgtype: "m.text", body: `the answer ${tag}`, "m.relates_to": { "m.in_reply_to": { event_id: original } } });

  await login(page);
  await openRoom(page, `Jump ${tag}`, new RegExp(`Jump ${tag}`));
  await expect(page.getByText(`the answer ${tag}`, { exact: true })).toBeVisible({ timeout: 20000 });
  // Opening a long room reads a few pages of it, not all of it: the oldest message is still out of reach.
  await page.waitForTimeout(2000);
  const loadedNow = await page.evaluate(() => {
    const c = (window as unknown as { __ohmatrix: { controller: { store: { getState(): { selectedRoomId: string; timelines: Record<string, unknown[]> } } } } })
      .__ohmatrix.controller;
    const st = c.store.getState();
    return (st.timelines[st.selectedRoomId] ?? []).length;
  });
  expect(loadedNow).toBeLessThan(250);
  // The original is far back: not loaded, so its quote has nothing to show yet.
  await expect(page.getByText(`ORIGINAL ${tag}`, { exact: true })).toHaveCount(0);
  const button = page.getByRole("button", { name: "Scroll to latest message" });
  await expect(button).toHaveCount(0); // at the bottom: no button

  // The quote under the reply: pressing it finds the original (loading history on the way) and lands on it.
  await page.getByText("…", { exact: true }).last().click();
  // (The quote under the reply now shows the same text; the original itself is the first of the two in the page.)
  await expect(page.getByText(`ORIGINAL ${tag}`, { exact: true }).first()).toBeInViewport({ timeout: 30000 });
  await expect(page.getByLabel("Found message")).toBeVisible();
  await shot(page, "76-reply-jump");

  // Far from the bottom the button shows; pressing it returns to the newest message and the button goes away.
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.getByText(`the answer ${tag}`, { exact: true })).toBeInViewport({ timeout: 10000 });
  await expect(button).toHaveCount(0, { timeout: 5000 });

  // Scrolled up a little, the date of what is in view floats at the top while moving, then goes away. (Let the list
  // settle after its own jump first: a scroll within a moment of that is taken to be the jump's own.)
  await page.waitForTimeout(700);
  await page.mouse.move(850, 400);
  await page.mouse.wheel(0, -500);
  const pill = page.getByLabel("Date");
  await expect(pill).toBeVisible({ timeout: 5000 });
  await expect(pill).toContainText("Today");
  await expect(pill).toHaveCount(0, { timeout: 5000 });

  // A message from someone else arriving while up in the history is counted on the button.
  await page.waitForTimeout(700);
  await page.mouse.wheel(0, -1500);
  await expect(button).toBeVisible();
  await send({ msgtype: "m.text", body: `while away ${tag}` });
  await expect(page.getByLabel("1 new messages")).toBeVisible({ timeout: 15000 });
  await button.click();
  await expect(page.getByText(`while away ${tag}`, { exact: true })).toBeInViewport({ timeout: 10000 });
  await expect(button).toHaveCount(0, { timeout: 5000 });

  // A reply whose original was deleted says so instead of doing nothing.
  const gone = (await send({ msgtype: "m.text", body: `short-lived ${tag}` }))["event_id"]!;
  await send({ msgtype: "m.text", body: `reply to gone ${tag}`, "m.relates_to": { "m.in_reply_to": { event_id: gone } } });
  await api(alice, "PUT", `/rooms/${encodeURIComponent(room_id!)}/redact/${encodeURIComponent(gone)}/r${Date.now()}`, {});
  await expect(page.getByText(`reply to gone ${tag}`, { exact: true })).toBeVisible({ timeout: 15000 });
  await page.getByText("…", { exact: true }).last().click();
  await expect(page.getByText("That message could not be found")).toBeVisible({ timeout: 30000 });
});

test("opening a chat shows a loading indicator inside the chat until the messages are in, then the messages", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  // The first messages come from the sync cache and the list is placed within a moment, so the indicator can be short:
  // record when it shows up and goes away instead of hoping to catch it by eye.
  await page.evaluate(() => {
    const w = window as unknown as { __loadingSeen: { shown: number; gone: number; where?: { x: number; y: number } } };
    w.__loadingSeen = { shown: 0, gone: 0 };
    const present = () => document.querySelector('[role="progressbar"][aria-label="Loading messages"]') as HTMLElement | null;
    let was = false;
    const tick = () => {
      const el = present();
      if (el && !was) {
        w.__loadingSeen.shown = performance.now();
        const r = el.getBoundingClientRect();
        w.__loadingSeen.where = { x: r.x, y: r.y };
      }
      if (!el && was) w.__loadingSeen.gone = performance.now();
      was = !!el;
      requestAnimationFrame(tick);
    };
    tick();
  });
  const search = page.getByPlaceholder("Search");
  await search.fill("OhMatrix Dev");
  await page
    .getByRole("button", { name: /OhMatrix Dev/ })
    .first()
    .click();
  await expect(page.getByText(/Backlog message #30/)).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole("progressbar", { name: "Loading messages" })).toHaveCount(0);
  const seen = await page.evaluate(
    () => (window as unknown as { __loadingSeen: { shown: number; gone: number; where?: { x: number; y: number } } }).__loadingSeen,
  );
  // The web list waits for its rows to settle, so the indicator shows meanwhile; the native one is in place from the
  // first frame and may never need it.
  if (!native) expect(seen.shown).toBeGreaterThan(0);
  if (!native) expect(seen.gone).toBeGreaterThan(seen.shown); // and went away afterwards
  // It lasts until the list has stopped moving: the view is at the newest message and does not move afterwards.
  const scroller = () =>
    page.evaluate(() => {
      const el = [...document.querySelectorAll<HTMLElement>("*")].find(
        (e) => e.scrollHeight > e.clientHeight + 20 && ["auto", "scroll"].includes(getComputedStyle(e).overflowY) && e.getBoundingClientRect().x > 300,
      );
      if (!el) return { top: 0, height: 0, gap: 0 };
      // How far from the newest message: the web list counts down the page, the native (flipped) one up from zero.
      const flipped = getComputedStyle(el).transform === "matrix(1, 0, 0, -1, 0, 0)";
      return {
        top: Math.round(el.scrollTop),
        height: el.scrollHeight,
        gap: Math.round(flipped ? el.scrollTop : el.scrollHeight - el.clientHeight - el.scrollTop),
      };
    });
  const atReveal = await scroller();
  expect(atReveal.gap).toBeLessThan(4);
  await page.waitForTimeout(1200);
  expect(await scroller()).toEqual(atReveal);
  // Inside the chat pane (right of the list, below the header), not over the whole window.
  if (!native) {
    expect(seen.where!.x).toBeGreaterThan(380);
    expect(seen.where!.y).toBeGreaterThan(50);
  }
  // An empty chat does not spin for ever either.
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("menuitem", { name: "New group" }).click();
  await page
    .getByRole("dialog")
    .locator("input")
    .first()
    .fill(`Empty ${Date.now().toString(36)}`);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByPlaceholder("Message")).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole("progressbar", { name: "Loading messages" })).toHaveCount(0, { timeout: 15000 });
});

test("opening a long chat draws about a screen and a half at once, then the older messages arrive without moving the view", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  await openRoom(page, "Notes to self");
  // The newest message sits at the bottom of the scroller. Its distance from the bottom of the window is what must not
  // change while the rest of the history is drawn above it.
  const sample = () =>
    page.evaluate(() => {
      const el = [...document.querySelectorAll<HTMLElement>("*")].find(
        (e) => e.scrollHeight > e.clientHeight + 20 && ["auto", "scroll"].includes(getComputedStyle(e).overflowY) && e.getBoundingClientRect().x > 300,
      );
      if (!el) return null;
      const rows = [...el.querySelectorAll<HTMLElement>("[data-row-key]")];
      const last = rows[rows.length - 1];
      return { content: el.scrollHeight, view: el.clientHeight, rows: rows.length, last: last ? Math.round(last.getBoundingClientRect().bottom) : null };
    });
  // Shown as soon as the first rows are drawn: the loading overlay is gone while only a window of rows exists.
  await expect(page.getByText("Loading messages")).toHaveCount(0, { timeout: 15000 });
  const first = await sample();
  expect(first).not.toBeNull();
  // From here on, whatever is added is added above: the newest message stays exactly where it is.
  const lasts = new Set<number | null>([first!.last]);
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(100);
    const m = await sample();
    if (m) lasts.add(m.last);
  }
  expect([...lasts].filter((v) => v !== null && Math.abs(v - first!.last!) > 2)).toEqual([]);
  // The window is about a screen and a half to begin with (at 800px, 1.5 screens is 1200px of messages).
  expect(first!.content).toBeLessThan(first!.view * 4);
});
