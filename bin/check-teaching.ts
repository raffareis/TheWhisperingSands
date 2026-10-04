/** No paid AI. Exercises the teacher workflow through HTTP + two real WebSockets. */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { once } from "node:events";
import { setTimeout as pause } from "node:timers/promises";
import WebSocket from "ws";
import type { Credentials } from "../shared/types.js";
import type { TeachingTable } from "../shared/teaching.js";
const base = process.env.APP_URL ?? "https://meg.raffareis.com",
  path =
    process.env.TEACHING_REPORT ?? "output/verification/teaching-public.json";
assert.ok(
  !existsSync(path),
  "Reconcile the existing teaching checkpoint before creating more QA tables.",
);
assert.ok(process.env.HOST_ACCESS_KEY, "Load private host access.");
mkdirSync(dirname(path), { recursive: true });
const report: Record<string, unknown> = {
    base,
    status: "started",
    started: new Date().toISOString(),
  },
  start = Date.now();
writeFileSync(path, JSON.stringify(report));
let cookie = "";
const tables: string[] = [],
  sockets: WebSocket[] = [];
async function api(route: string, value?: unknown, token?: string) {
  const r = await fetch(base + route, {
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
    status: r.status,
    data: await r.json(),
    cookie: r.headers.get("set-cookie"),
  };
}
async function until(f: () => boolean) {
  const t = Date.now();
  while (!f()) {
    assert.ok(Date.now() - t < 8000, "Teaching live event did not arrive.");
    await pause(30);
  }
}
const code = (entry: string) =>
  new URLSearchParams(entry.split("#")[1]).get("seat")!;
async function connect(c: Credentials) {
  const ws = new WebSocket(base.replace(/^http/, "ws") + "/api/live", {
    handshakeTimeout: 15000,
  });
  sockets.push(ws);
  const events: any[] = [];
  ws.on("message", (raw) => events.push(JSON.parse(raw.toString())));
  await once(ws, "open");
  const send = (event: unknown) => ws.send(JSON.stringify(event));
  send({ type: "authenticate", ...c });
  await until(() => events.some((e) => e.type === "state"));
  return { ws, events, send };
}
try {
  assert.equal((await api("/api/teaching")).status, 403);
  const access = await api("/api/host-access", {
    key: process.env.HOST_ACCESS_KEY,
  });
  assert.equal(access.status, 200);
  assert.match(access.cookie!, /HttpOnly/);
  if (base.startsWith("https:")) assert.match(access.cookie!, /Secure/);
  cookie = access.cookie!.split(";")[0];
  const details = {
    title: "Teaching workflow QA",
    cohort: "Verification",
    notes: "PRIVATE TEACHER NOTE: revisit past perfect next week.",
    nextLesson: "2026-10-13",
    sam: "QA Student Sam",
    liz: "QA Student Liz",
  };
  const created = await api("/api/teaching", details);
  assert.equal(created.status, 201);
  const table: TeachingTable = created.data.table;
  tables.push(table.id);
  const second = await api("/api/teaching", {
    ...details,
    title: "Independent pair QA",
  });
  assert.equal(second.status, 201);
  tables.push(second.data.table.id);
  const hostCookie = cookie;
  cookie = "";
  const entered = await api(`/api/rooms/${table.id}/entry`, {
    seatCode: code(table.students[0].entryPath),
  });
  assert.equal(entered.status, 200);
  const a: Credentials = entered.data.credentials;
  const companion = await api(`/api/rooms/${table.id}/entry`, {
    seatCode: code(table.students[1].entryPath),
  });
  assert.equal(companion.status, 200);
  const b: Credentials = companion.data.credentials;
  assert.equal((await api("/api/teaching", undefined, a.token)).status, 403);
  assert.equal(
    (
      await api(`/api/rooms/${second.data.table.id}/entry`, {
        seatCode: code(table.students[0].entryPath),
      })
    ).status,
    403,
  );
  assert.ok(!JSON.stringify(entered.data).includes("PRIVATE TEACHER NOTE"));
  assert.ok(
    !JSON.stringify(entered.data).includes(table.students[1].entryPath),
  );
  const one = await connect(a),
    two = await connect(b);
  cookie = hostCookie;
  assert.equal(
    (
      await api(`/api/teaching/${table.id}`, {
        status: "paused",
        nextLesson: "2026-10-20",
      })
    ).status,
    200,
  );
  await until(
    () =>
      one.events.some((e) => e.state?.lessonStatus === "paused") &&
      two.events.some((e) => e.state?.lessonStatus === "paused"),
  );
  cookie = "";
  assert.equal(
    (await api(`/api/rooms/${table.id}/start`, {}, a.token)).status,
    409,
  );
  assert.equal(
    (
      await api(
        `/api/rooms/${table.id}/puzzle-answer`,
        { puzzleId: "salvage-lock", answer: "3142" },
        a.token,
      )
    ).status,
    409,
  );
  one.send({ type: "voice_start" });
  await until(() =>
    one.events.some((e) => e.type === "error" && /paused/.test(e.message)),
  );
  assert.ok(!one.events.some((e) => e.type === "voice_ready"));
  cookie = hostCookie;
  assert.equal(
    (await api(`/api/teaching/${table.id}`, { status: "active" })).status,
    200,
  );
  const before = (await api(`/api/rooms/${table.id}`, undefined, a.token)).data
    .state;
  cookie = "";
  assert.equal(
    (
      await api(
        `/api/rooms/${table.id}/party-chat`,
        { text: "We will continue next week." },
        a.token,
      )
    ).status,
    200,
  );
  const closed = once(one.ws, "close"),
    returned = await api(`/api/rooms/${table.id}/entry`, {
      seatCode: code(table.students[0].entryPath),
    });
  assert.equal(returned.status, 200);
  assert.equal(returned.data.credentials.playerId, a.playerId);
  assert.equal((await closed)[0], 4001);
  assert.equal(
    (await api(`/api/rooms/${table.id}`, undefined, a.token)).status,
    401,
  );
  assert.deepEqual(returned.data.state.characters, before.characters);
  assert.deepEqual(returned.data.state.puzzles, before.puzzles);
  assert.equal(
    returned.data.state.partyChat.at(-1).text,
    "We will continue next week.",
  );
  cookie = hostCookie;
  const rotated = await api(`/api/teaching/${table.id}/links`, {
    character: "liz",
  });
  assert.equal(rotated.status, 200);
  cookie = "";
  assert.equal(
    (
      await api(`/api/rooms/${table.id}/entry`, {
        seatCode: code(table.students[1].entryPath),
      })
    ).status,
    403,
  );
  assert.equal(
    (await api(`/api/rooms/${table.id}`, undefined, b.token)).status,
    401,
  );
  const liz = await api(`/api/rooms/${table.id}/entry`, {
    seatCode: code(rotated.data.table.students[1].entryPath),
  });
  assert.equal(liz.status, 200);
  assert.equal(liz.data.credentials.playerId, b.playerId);
  cookie = hostCookie;
  assert.equal(
    (await api(`/api/teaching/${table.id}`, { status: "paused" })).status,
    200,
  );
  const list = (await api("/api/teaching")).data.tables;
  assert.equal(
    list.find((t: TeachingTable) => t.id === table.id).notes,
    details.notes,
  );
  assert.equal(
    list.find((t: TeachingTable) => t.id === second.data.table.id).status,
    "active",
  );
  writeFileSync(
    path + ".links.json",
    JSON.stringify({
      table: rotated.data.table,
      a: returned.data.credentials,
      b: liz.data.credentials,
    }),
    { mode: 0o600 },
  );
  Object.assign(report, {
    status: "ready",
    table: table.id,
    reserved_seats: 2,
    private_notes: true,
    pause_enforced_http_and_ws: true,
    permanent_return: true,
    access_revocation: true,
    independent_pairs: true,
  });
} catch (e) {
  report.status = "error";
  report.error = (e as Error).message;
  process.exitCode = 1;
} finally {
  sockets.forEach((ws) => ws.close());
  if (cookie)
    for (const id of tables) {
      if (
        process.env.CHECK_KEEP_TABLE === "1" &&
        id === tables[0] &&
        report.status === "ready"
      )
        continue;
      await api(`/api/teaching/${id}`, { status: "archived" });
    }
  report.elapsed_seconds = Math.round((Date.now() - start) / 1000);
  writeFileSync(path, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
