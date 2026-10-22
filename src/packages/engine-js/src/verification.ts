import type { MatrixClient } from "matrix-js-sdk";
import { CryptoEvent } from "matrix-js-sdk/lib/crypto-api/CryptoEvent";
import {
  VerificationPhase,
  VerificationRequestEvent,
  VerifierEvent,
  type ShowSasCallbacks,
  type VerificationRequest,
  type Verifier,
} from "matrix-js-sdk/lib/crypto-api/verification";
import { EngineError, type Listener, type Unsubscribe, type VerificationApi, type VerificationFlow } from "@ohmatrix/core";

const SAS = "m.sas.v1";

/**
 * Verification of my other sessions and of people, over matrix-js-sdk's request objects. One request at a time is followed: the
 * latest one (a request from another device replaces a finished one). The side that asked starts the pictures once the other accepts.
 */
export class JsVerification implements VerificationApi {
  private readonly listeners = new Set<Listener<VerificationFlow | null>>();
  private flow: VerificationFlow | null = null;
  private request: VerificationRequest | null = null;
  private verifier: Verifier | null = null;
  private sas: ShowSasCallbacks | null = null;
  private starting = false;
  private attached: MatrixClient | null = null;

  constructor(
    private readonly getClient: () => MatrixClient | null,
    /** The one-to-one room with a person (made when there is none): a request to a person travels in it. */
    private readonly directRoom: (userId: string) => Promise<string>,
  ) {}

  /** Follow the requests that come in on this client. */
  attach(client: MatrixClient): void {
    if (this.attached === client) return;
    this.attached = client;
    this.reset();
    client.on(CryptoEvent.VerificationRequestReceived, (req) => {
      if (this.attached === client) this.track(req);
    });
  }

  onFlow(cb: Listener<VerificationFlow | null>): Unsubscribe {
    this.listeners.add(cb);
    cb(this.flow);
    return () => void this.listeners.delete(cb);
  }

  private set(flow: VerificationFlow | null) {
    if (JSON.stringify(flow) === JSON.stringify(this.flow)) return;
    this.flow = flow;
    this.listeners.forEach((cb) => cb(flow));
  }

  private reset() {
    this.request = null;
    this.verifier = null;
    this.sas = null;
    this.starting = false;
    this.set(null);
  }

  private crypto() {
    const c = this.getClient()?.getCrypto();
    if (!c) throw new EngineError("unauthorized", "encryption is not ready");
    return c;
  }

  private track(req: VerificationRequest) {
    this.reset();
    this.request = req;
    req.on(VerificationRequestEvent.Change, () => this.update(req));
    this.update(req);
  }

  private update(req: VerificationRequest) {
    if (this.request !== req) return;
    const userId = req.otherUserId;
    switch (req.phase) {
      case VerificationPhase.Unsent:
      case VerificationPhase.Requested:
        this.set({
          phase: "requested",
          incoming: !req.initiatedByMe,
          userId,
          ...(req.otherDeviceId && !req.initiatedByMe && { deviceName: req.otherDeviceId }),
        });
        return;
      case VerificationPhase.Ready:
        if (!this.flow || this.flow.phase === "requested") this.set({ phase: "waiting", userId });
        if (req.initiatedByMe && !this.starting) {
          this.starting = true;
          req.startVerification(SAS).then(
            (v) => this.follow(req, v),
            () => this.request === req && this.set({ phase: "failed", userId }),
          );
        }
        return;
      case VerificationPhase.Started:
        if (req.verifier && req.verifier !== this.verifier) this.follow(req, req.verifier);
        if (!this.sas && this.flow?.phase !== "emojis") this.set({ phase: "waiting", userId });
        return;
      case VerificationPhase.Done:
        this.set({ phase: "done", userId });
        return;
      case VerificationPhase.Cancelled:
        this.set({ phase: this.flow?.phase === "failed" ? "failed" : "cancelled", userId });
        return;
    }
  }

  private follow(req: VerificationRequest, v: Verifier) {
    if (this.request !== req || this.verifier === v) return;
    this.verifier = v;
    const show = (s: ShowSasCallbacks) => {
      if (this.verifier !== v) return;
      this.sas = s;
      const emojis = (s.sas.emoji ?? []).map(([symbol, name]) => ({ symbol, name }));
      // Only the pictures are offered; a device that can show nothing but numbers cannot be verified here.
      if (emojis.length) this.set({ phase: "emojis", userId: req.otherUserId, emojis });
      else s.cancel();
    };
    v.on(VerifierEvent.ShowSas, show);
    const early = v.getShowSasCallbacks();
    if (early) show(early);
    v.verify().catch(
      () => this.request === req && this.flow?.phase !== "done" && this.flow?.phase !== "cancelled" && this.set({ phase: "failed", userId: req.otherUserId }),
    );
  }

  async requestSession(): Promise<void> {
    const c = this.crypto();
    try {
      this.track(await c.requestOwnUserVerification());
    } catch (e) {
      this.set(null);
      throw new EngineError("unknown", e instanceof Error ? e.message : "could not ask");
    }
  }

  async requestUser(userId: string): Promise<void> {
    const c = this.crypto();
    this.reset();
    this.set({ phase: "requested", incoming: false, userId });
    try {
      this.track(await c.requestVerificationDM(userId, await this.directRoom(userId)));
    } catch (e) {
      this.set({ phase: "failed", userId });
      throw new EngineError("unknown", e instanceof Error ? e.message : "could not ask");
    }
  }

  async accept(): Promise<void> {
    const req = this.request;
    if (!req) throw new EngineError("unknown", "there is no request to accept");
    await req.accept();
  }

  async confirm(): Promise<void> {
    await this.sas?.confirm();
  }

  async mismatch(): Promise<void> {
    this.sas?.mismatch();
  }

  async cancel(): Promise<void> {
    const req = this.request;
    const done = this.flow && (this.flow.phase === "done" || this.flow.phase === "cancelled" || this.flow.phase === "failed");
    this.reset();
    if (req && !done) await req.cancel().catch(() => {});
  }

  dismiss(): void {
    this.reset();
  }
}
