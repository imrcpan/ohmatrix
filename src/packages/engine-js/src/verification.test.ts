import { EventEmitter } from "node:events";
import { expect, test } from "vitest";
import type { MatrixClient } from "matrix-js-sdk";
import { JsVerification } from "./verification.js";

// The numbers of matrix-js-sdk's VerificationPhase and the event names it uses.
const P = { Requested: 2, Ready: 3, Started: 4, Cancelled: 5, Done: 6 };

class Verifier extends EventEmitter {
  userId = "@bob:s";
  hasBeenCancelled = false;
  verified = 0;
  getShowSasCallbacks = () => null;
  verify = async () => void this.verified++;
  cancel() {}
}
class Request extends EventEmitter {
  phase = P.Requested;
  initiatedByMe = false;
  otherUserId = "@bob:s";
  otherDeviceId: string | undefined = "DEV";
  verifier: Verifier | undefined;
  started: string[] = [];
  accepted = 0;
  cancelled = 0;
  async accept() {
    this.accepted++;
  }
  async cancel() {
    this.cancelled++;
  }
  async startVerification(m: string) {
    this.started.push(m);
    this.verifier = new Verifier();
    return this.verifier;
  }
  move(phase: number) {
    this.phase = phase;
    this.emit("change");
  }
}

function setup(req?: Request) {
  const client = new EventEmitter() as unknown as MatrixClient & EventEmitter;
  (client as unknown as { getCrypto: () => unknown }).getCrypto = () => ({
    requestOwnUserVerification: async () => req,
    requestVerificationDM: async () => req,
  });
  const v = new JsVerification(
    () => client,
    async () => "!dm:s",
  );
  v.attach(client);
  const seen: (string | null)[] = [];
  v.onFlow((f) => seen.push(f && f.phase));
  return { client, v, seen };
}

test("a request that comes in is shown, accepted, and its pictures are offered", async () => {
  const { client, v, seen } = setup();
  const req = new Request();
  client.emit("crypto.verificationRequestReceived", req);
  await v.accept();
  expect(req.accepted).toBe(1);
  req.move(P.Ready);
  req.verifier = new Verifier();
  req.move(P.Started);
  req.verifier.emit("show_sas", { sas: { emoji: [["🐶", "Dog"]] }, confirm: async () => {}, mismatch() {}, cancel() {} });
  req.move(P.Done);
  expect(seen).toEqual([null, "requested", "waiting", "emojis", "done"]);
  expect(req.verifier.verified).toBe(1);
});

test("my own request starts the pictures once the other side is ready, and cancelling stops it", async () => {
  const req = new Request();
  req.initiatedByMe = true;
  const { v, seen } = setup(req);
  await v.requestSession();
  req.move(P.Ready);
  await Promise.resolve();
  expect(req.started).toEqual(["m.sas.v1"]);
  await v.cancel();
  expect(req.cancelled).toBe(1);
  expect(seen.at(-1)).toBeNull();
});
