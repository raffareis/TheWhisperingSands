import { test } from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { HostAccess } from "../server/host-access.js";

test("host grants expire, bind to the host and key, and never expose the secret in the cookie", () => {
  let now = 1791000000000;
  const access = new HostAccess("private-host-test-key", () => now);
  const req = {
    headers: { host: "island.test", "x-forwarded-proto": "https" },
    socket: {},
  } as unknown as IncomingMessage;
  let cookie = "";
  const res = {
    setHeader: (_: string, v: string) => {
      cookie = v;
    },
  } as unknown as ServerResponse;
  assert.equal(access.required, true);
  assert.equal(access.authenticated(req), false);
  assert.throws(() => access.grant(req, res, "wrong"), /not valid/);
  access.grant(req, res, "private-host-test-key");
  assert.match(cookie, /HttpOnly; SameSite=Strict; Path=\/api/);
  assert.match(cookie, /Secure/);
  assert.ok(!cookie.includes("private-host-test-key"));
  req.headers.cookie = cookie.split(";")[0];
  assert.equal(access.authenticated(req), true);
  const host = req.headers.host;
  req.headers.host = "other.test";
  assert.equal(access.authenticated(req), false);
  req.headers.host = host;
  assert.equal(
    new HostAccess("rotated-key", () => now).authenticated(req),
    false,
  );
  req.headers.cookie += ".tamper";
  assert.equal(access.authenticated(req), false);
  req.headers.cookie = cookie.split(";")[0];
  now += 8 * 86400000;
  assert.equal(access.authenticated(req), false);
});
test("local development can remain open while a private host key enables gating", () => {
  assert.equal(new HostAccess("").required, false);
  assert.equal(
    new HostAccess("").authenticated({ headers: {} } as IncomingMessage),
    true,
  );
});
