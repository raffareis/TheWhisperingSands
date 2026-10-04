/** Actual HTTPS deployment proof; creates a QA table but invokes no AI. */
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as pause } from "node:timers/promises";
import WebSocket from "ws";
import type { Credentials } from "../shared/types.js";
const base = process.env.APP_URL ?? "https://meg.raffareis.com";
assert.ok(base.startsWith("https://"));
const started = Date.now();
const sockets: WebSocket[] = [];
const report: Record<string, unknown> = {
  base,
  started: new Date().toISOString(),
};
let cookie = "";
async function api(route: string, value?: unknown, token?: string) {
  const response = await fetch(base + route, {
    method: value === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(value === undefined ? {} : { body: JSON.stringify(value) }),
    signal: AbortSignal.timeout(15000),
  });
  return {
    status: response.status,
    data: await response.json(),
    cookie: response.headers.get("set-cookie"),
  };
}
async function until(predicate: () => boolean) {
  const start = Date.now();
  while (!predicate()) {
    assert.ok(Date.now() - start < 8000, "Public live event did not arrive.");
    await pause(30);
  }
}
async function connect(credentials: Credentials) {
  const ws = new WebSocket(base.replace(/^http/, "ws") + "/api/live", {
    handshakeTimeout: 15000,
  });
  sockets.push(ws);
  const events: any[] = [];
  ws.on("message", (raw) => events.push(JSON.parse(raw.toString())));
  await once(ws, "open");
  const send = (event: unknown) => ws.send(JSON.stringify(event));
  send({ type: "authenticate", ...credentials });
  await until(() => events.some((e) => e.type === "state"));
  return { ws, events, send };
}
try {
  for (const route of ["/", "/whispering-sands"]) {
    const response = await fetch(base + route, {
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /<div id="root"><\/div>/);
  }
  assert.equal((await api("/api/host-access")).data.required, true);
  assert.equal(
    (await api("/api/rooms", { name: "Uninvited QA", characterId: "sam" }))
      .status,
    403,
  );
  assert.ok(process.env.HOST_ACCESS_KEY, "Load the private host key.");
  const grant = await api("/api/host-access", {
    key: process.env.HOST_ACCESS_KEY,
  });
  assert.equal(grant.status, 200);
  assert.match(grant.cookie!, /HttpOnly/);
  assert.match(grant.cookie!, /Secure/);
  cookie = grant.cookie!.split(";")[0];
  assert.equal((await api("/api/host-access")).data.authenticated, true);
  const created = await api("/api/rooms", {
    name: "HTTPS QA Sam",
    characterId: "sam",
  });
  assert.equal(created.status, 201);
  const a: Credentials = created.data.credentials;
  cookie = "";
  const joined = await api(`/api/rooms/${a.roomId}/join`, {
    name: "HTTPS QA Liz",
    invite: created.data.invite,
  });
  assert.equal(joined.status, 201);
  const b: Credentials = joined.data.credentials;
  const one = await connect(a),
    two = await connect(b);
  const chat = "We can discuss our clues through the public table.";
  assert.equal(
    (await api(`/api/rooms/${a.roomId}/party-chat`, { text: chat }, a.token))
      .status,
    200,
  );
  await until(() =>
    two.events.some((e) => e.state?.partyChat?.at(-1)?.text === chat),
  );
  one.send({ type: "party_start" });
  await until(() => one.events.some((e) => e.type === "party_floor_granted"));
  const pcm = Buffer.alloc(4800).toString("base64");
  one.send({ type: "party_audio", data: pcm });
  await until(() =>
    two.events.some((e) => e.type === "party_audio" && e.delta === pcm),
  );
  one.send({ type: "party_end" });
  await until(() => one.events.some((e) => e.type === "party_floor_released"));
  const code = (
    await api(
      `/api/rooms/${a.roomId}/recovery`,
      { characterId: "liz" },
      a.token,
    )
  ).data.recoveryCode;
  const closed = once(two.ws, "close");
  const recovered = await api(`/api/rooms/${a.roomId}/recover`, {
    recoveryCode: code,
  });
  assert.equal(recovered.status, 200);
  assert.equal(recovered.data.credentials.playerId, b.playerId);
  assert.equal((await closed)[0], 4001);
  assert.equal(
    (await api(`/api/rooms/${a.roomId}`, undefined, b.token)).status,
    401,
  );
  assert.equal(
    (await api(`/api/rooms/${a.roomId}/recover`, { recoveryCode: code }))
      .status,
    403,
  );
  const restored = await connect(recovered.data.credentials);
  assert.equal(
    restored.events.find((e) => e.type === "state").state.players.length,
    2,
  );
  const privatePaths = [
    "/server/puzzles.ts",
    "/server%2fcampaign-map.json",
    "/assets/dm/island-map.svg",
    "/06_StoryGuide.md",
    "/data/adventure.sqlite",
    "/.env",
    "/@fs/etc/passwd",
  ];
  for (const route of privatePaths)
    assert.equal(
      (await fetch(base + route, { signal: AbortSignal.timeout(15000) }))
        .status,
      404,
      route,
    );
  mkdirSync("output/verification", { recursive: true });
  writeFileSync(
    "output/verification/public-seats.json",
    JSON.stringify({ a, b: recovered.data.credentials }),
    { mode: 0o600 },
  );
  Object.assign(report, {
    ok: true,
    room: a.roomId,
    websocket_clients: 2,
    host_gated: true,
    recovery_verified: true,
    private_paths_denied: privatePaths.length,
  });
} catch (error) {
  report.ok = false;
  report.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  for (const ws of sockets) ws.close();
  report.elapsed_seconds = Math.round((Date.now() - started) / 1000);
  mkdirSync("output/verification", { recursive: true });
  writeFileSync(
    "output/verification/public-check.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}
