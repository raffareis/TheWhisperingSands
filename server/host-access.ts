import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { GameError } from "./store.js";

const cookieName = "whispering_host";
const days = 7;
const equal = (a: string, b: string) =>
  timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest(),
  );

// Hosts can create paid tables. Seat invitations grant only access to their table.
export class HostAccess {
  constructor(
    private key: string,
    private now: () => number = Date.now,
  ) {}
  get required() {
    return !!this.key;
  }
  private signature(value: string, req: IncomingMessage) {
    return createHmac("sha256", this.key)
      .update(`${req.headers.host ?? ""}:${value}`)
      .digest("base64url");
  }
  authenticated(req: IncomingMessage) {
    if (!this.required) return true;
    const value = req.headers.cookie
      ?.split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1);
    if (!value || value.length > 250) return false;
    const [expires, nonce, signature, extra] = value.split(".");
    if (
      extra ||
      !expires ||
      !nonce ||
      !signature ||
      !/^\d{13}$/.test(expires) ||
      !/^[A-Za-z0-9_-]{24}$/.test(nonce) ||
      Number(expires) <= this.now()
    )
      return false;
    return equal(signature, this.signature(`${expires}.${nonce}`, req));
  }
  grant(req: IncomingMessage, res: ServerResponse, key: string) {
    if (!this.required) return;
    if (!equal(key, this.key))
      throw new GameError("That host code is not valid.", 403);
    const expires = this.now() + days * 86400000;
    const value = `${expires}.${randomBytes(18).toString("base64url")}`;
    const secure =
      req.headers["x-forwarded-proto"] === "https" ||
      (req.socket as { encrypted?: boolean }).encrypted;
    res.setHeader(
      "Set-Cookie",
      `${cookieName}=${value}.${this.signature(value, req)}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${days * 86400}${secure ? "; Secure" : ""}`,
    );
  }
}
