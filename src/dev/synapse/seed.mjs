// Seeds demo rooms/messages for the dev users. Idempotent-ish: skips if `test` already has rooms.
const HS = process.env.HS ?? "http://localhost:8008";
const api = async (token, method, path, body) => {
  const r = await fetch(HS + "/_matrix/client/v3" + path, {
    method,
    headers: { "content-type": "application/json", ...(token && { authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`${method} ${path}: ${JSON.stringify(j)}`);
  return j;
};
const login = async (u) =>
  (
    await api(null, "POST", "/login", {
      type: "m.login.password",
      identifier: { type: "m.id.user", user: u },
      password: "123456",
    })
  ).access_token;
const [t, a, b] = await Promise.all(["test", "alice", "bob"].map(login));
const seededRooms = (await api(t, "GET", "/joined_rooms")).joined_rooms.length > 0;

import { deflateSync } from "node:zlib";

// Tiny PNG encoder (RGB gradient) so media can be seeded without dependencies.
function png(w, h, rgb) {
  const crcT = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b) => {
    let c = 0xffffffff;
    for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw.set(rgb(x / w, y / h), o);
      if (x === 0) raw[o - 1] = 0;
    }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const upload = async (tok, bytes, name) => {
  const r = await fetch(`${HS}/_matrix/media/v3/upload?filename=${name}`, {
    method: "POST",
    headers: { "content-type": "image/png", authorization: `Bearer ${tok}` },
    body: bytes,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(j));
  return j.content_uri;
};

let n = 0;
const say = (tok, room, body) => api(tok, "PUT", `/rooms/${encodeURIComponent(room)}/send/m.room.message/s${Date.now()}${n++}`, { msgtype: "m.text", body });
const join = (tok, room) => api(tok, "POST", `/join/${encodeURIComponent(room)}`, {});

if (!seededRooms) {
  const general = (
    await api(a, "POST", "/createRoom", {
      name: "OhMatrix Dev",
      topic: "Building the best Matrix client",
      preset: "public_chat",
      invite: ["@test:localhost", "@bob:localhost"],
    })
  ).room_id;
  await join(t, general);
  await join(b, general);
  await say(a, general, "Welcome to the OhMatrix dev room 👋");
  await say(b, general, "The new client looks great so far.");
  await say(t, general, "Agreed. Telegram-like speed, Apple-like polish.");
  await say(a, general, "Next up: media, reactions and threads.");
  for (let i = 1; i <= 30; i++) await say(i % 2 ? a : b, general, `Backlog message #${i} — testing scrolling and pagination.`);

  const dm = (await api(a, "POST", "/createRoom", { is_direct: true, preset: "trusted_private_chat", invite: ["@test:localhost"] })).room_id;
  await join(t, dm);
  await say(a, dm, "Hey! Are you free for a quick call later?");
  await say(t, dm, "Sure, after 3pm works.");
  await say(a, dm, "Perfect, talk then.");

  const dm2 = (await api(b, "POST", "/createRoom", { is_direct: true, preset: "trusted_private_chat", invite: ["@test:localhost"] })).room_id;
  await join(t, dm2);
  await say(b, dm2, "Did you see the latest design mock-ups?");

  const quiet = (await api(t, "POST", "/createRoom", { name: "Notes to self", preset: "private_chat" })).room_id;
  await say(t, quiet, "Remember to review the timeline virtualisation.");
}
// --- media: avatars + a photo in the dev room (idempotent) ---
const profile = await (await fetch(`${HS}/_matrix/client/v3/profile/@alice:localhost`)).json();
if (!profile.avatar_url) {
  const grad = (a, b) => (x, y) => [0, 1, 2].map((i) => Math.round(a[i] + ((b[i] - a[i]) * (x + y)) / 2));
  const aliceAv = await upload(a, png(128, 128, grad([255, 140, 90], [200, 60, 140])), "alice.png");
  const bobAv = await upload(b, png(128, 128, grad([60, 190, 160], [40, 90, 200])), "bob.png");
  await api(a, "PUT", "/profile/@alice:localhost/avatar_url", { avatar_url: aliceAv });
  await api(b, "PUT", "/profile/@bob:localhost/avatar_url", { avatar_url: bobAv });
  const rooms = (await api(t, "GET", "/joined_rooms")).joined_rooms;
  for (const id of rooms) {
    const name = (await api(t, "GET", `/rooms/${encodeURIComponent(id)}/state/m.room.name`).catch(() => ({}))).name;
    if (name !== "OhMatrix Dev") continue;
    const roomAv = await upload(a, png(128, 128, grad([90, 120, 255], [160, 90, 255])), "room.png");
    await api(a, "PUT", `/rooms/${encodeURIComponent(id)}/state/m.room.avatar`, { url: roomAv });
    const photo = await upload(
      b,
      png(640, 420, (x, y) => [Math.round(255 * x), Math.round(180 * (1 - y)), Math.round(255 * y)]),
      "sunset.png",
    );
    await api(b, "PUT", `/rooms/${encodeURIComponent(id)}/send/m.room.message/img${Date.now()}`, {
      msgtype: "m.image",
      body: "sunset.png",
      url: photo,
      info: { w: 640, h: 420, mimetype: "image/png" },
    });
    await say(a, id, "Nice shot!");
  }
}
console.log("seeded");
