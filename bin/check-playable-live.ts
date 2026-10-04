/** Explicit paid end-to-end campaign proof. Checkpoint prevents accidental repeats. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { once } from "node:events";
import { setTimeout as pause } from "node:timers/promises";
import WebSocket from "ws";
import type { Credentials, RoomState, LiveState } from "../shared/types.js";

const base = process.env.APP_URL ?? "http://localhost:4317";
const label = process.env.PROOF_LABEL ?? "playable-live";
assert.match(label, /^[a-z0-9-]+$/);
const path = `output/verification/${label}.json`;
assert.ok(
  !existsSync(path),
  "Reconcile the existing checkpoint before another paid proof.",
);
mkdirSync("output/verification", { recursive: true });
const started = Date.now();
const report: Record<string, any> = {
  status: "started",
  started: new Date().toISOString(),
  base,
  source_sha256: Object.fromEntries(
    ["server/dm.ts", "server/runtime.ts", "server/puzzles.ts"].map((file) => [
      file,
      createHash("sha256").update(readFileSync(file)).digest("hex"),
    ]),
  ),
  chapters: [],
};
const save = () => writeFileSync(path, JSON.stringify(report, null, 2));
save();
const sockets: WebSocket[] = [];
const liveErrors: string[] = [];
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
    signal: AbortSignal.timeout(100000),
  });
  const result = await response.json();
  assert.ok(response.ok, `${route}: ${result.error ?? response.status}`);
  if (route === "/api/host-access" && value !== undefined)
    cookie = response.headers.get("set-cookie")!.split(";")[0];
  return result;
}
async function until(predicate: () => boolean, timeout = 90000) {
  const start = Date.now();
  while (!predicate()) {
    assert.equal(liveErrors.length, 0, liveErrors.at(-1));
    assert.ok(
      Date.now() - start < timeout,
      "Live event deadline reached; do not resubmit without reconciliation.",
    );
    await pause(100);
  }
}
async function connect(credentials: Credentials) {
  const ws = new WebSocket(base.replace(/^http/, "ws") + "/api/live");
  sockets.push(ws);
  const events: any[] = [];
  let current: { state: RoomState; live: LiveState } | null = null;
  ws.on("message", (raw) => {
    const event = JSON.parse(raw.toString());
    events.push(event);
    if (event.type === "error") liveErrors.push(event.message);
    if (event.type === "state" && event.live.dmStatus === "error")
      liveErrors.push(event.live.error ?? "Storyteller error.");
    if (event.type === "state") current = event;
  });
  await once(ws, "open");
  const send = (event: unknown) => ws.send(JSON.stringify(event));
  send({ type: "authenticate", ...credentials });
  await until(() => current !== null);
  return {
    ws,
    events,
    send,
    get current() {
      return current!;
    },
  };
}
const route = [
  {
    id: "salvage-lock",
    sam: "3142",
    liz: "flint, canvas, rope, compass",
    action:
      "We have inspected the chest and packed the working equipment. We take our copied chart and walk along the safe path to Palm Camp, then examine the crossing records together. Please move us to the next evidence chapter.",
  },
  {
    id: "tide-route",
    sam: "under old stone arch",
    liz: "B1 A1 A2 A3",
    action:
      "We follow our agreed safe route in the low-tide window, reach the old stone arch and enter the dry archive. We compare the conflicting records there. Please advance to the archive evidence chapter.",
  },
  {
    id: "keeper-timeline",
    sam: "CDBA",
    liz: "bell ferry seal light",
    action:
      "We inspect the earned recorder and access receipt, keeping motive an open question. We take the original voice-seal to the lower voice machine and examine its safety interlocks together. Please advance to the restoration chapter.",
  },
  {
    id: "voice-machine",
    sam: "312",
    liz: "turn the lamp down; give the voices back; put the brazier out",
    action:
      "We carry out the agreed safe actions and restore the voices. After reading the engineering plate and signed letter, we go to the beacon gallery and compare the fresh-call signal plans. Please advance to the final evidence chapter.",
  },
  {
    id: "final-promise",
    sam: "TERN; if we call by choice",
    liz: "TERN; we will find home",
    action:
      "We choose to leave without reconciliation or promising to stay. We freely send our new distress call with the hand key, wait safely for the ferry, go to the unlocked quay and board together with Emily. Please record our actual rescue and our choice to leave.",
  },
];
try {
  const access = await api("/api/host-access");
  if (access.required) {
    assert.ok(process.env.HOST_ACCESS_KEY, "Load the private host key.");
    await api("/api/host-access", { key: process.env.HOST_ACCESS_KEY });
  }
  const seats: { a: Credentials; b: Credentials } = process.env.PROOF_SEATS
    ? JSON.parse(readFileSync(process.env.PROOF_SEATS, "utf8"))
    : await (async () => {
        const created = await api("/api/rooms", {
          name: "Sam · campaign QA",
          characterId: "sam",
        });
        const a: Credentials = created.credentials;
        const joined = await api(`/api/rooms/${a.roomId}/join`, {
          name: "Liz · campaign QA",
          invite: created.invite,
        });
        return { a, b: joined.credentials as Credentials };
      })();
  const { a, b } = seats;
  report.reused_seats = !!process.env.PROOF_SEATS;
  writeFileSync(
    `output/verification/${label}-seats.json`,
    JSON.stringify({ a, b }),
    { mode: 0o600 },
  );
  report.room = a.roomId;
  report.models = await api("/api/config");
  const one = await connect(a),
    two = await connect(b);
  await api(`/api/rooms/${a.roomId}/images`, { enabled: false }, a.token);
  if (one.current.state.phase === "lobby")
    await api(`/api/rooms/${a.roomId}/start`, {}, a.token);
  await until(
    () =>
      one.current.state.phase === "playing" &&
      ["offline", "error"].includes(one.current.live.dmStatus),
  );
  assert.equal(one.current.state.phase, "playing");
  assert.notEqual(one.current.live.dmStatus, "error", one.current.live.error);
  report.opening = one.current.state.journal
    .filter((e) => e.kind === "dm")
    .at(-1)?.text;
  console.log("Live structured text opening accepted.");

  one.send({ type: "voice_start" });
  two.send({ type: "voice_start" });
  await until(
    () =>
      one.events.some((e) => e.type === "voice_ready") &&
      two.events.some((e) => e.type === "voice_ready"),
  );
  const fixturePath = "output/verification/classroom-voice.pcm";
  let pcm: Buffer;
  if (existsSync(fixturePath)) pcm = readFileSync(fixturePath);
  else {
    const speech = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: "coral",
        input:
          "I am Sam. We are safe at the camp. We will compare our records together. Please wait while we discuss our clues.",
        response_format: "pcm",
      }),
    });
    assert.ok(speech.ok, `Synthetic speech fixture failed (${speech.status}).`);
    pcm = Buffer.from(await speech.arrayBuffer());
    writeFileSync(fixturePath, pcm);
  }
  const beforeVoice = one.events.length;
  one.send({ type: "floor_start" });
  await until(() =>
    one.events.slice(beforeVoice).some((e) => e.type === "floor_granted"),
  );
  for (let offset = 0; offset < pcm.length; offset += 4800) {
    one.send({
      type: "audio",
      data: pcm.subarray(offset, offset + 4800).toString("base64"),
    });
    await pause(100);
  }
  one.send({ type: "floor_end" });
  await until(() =>
    one.events
      .slice(beforeVoice)
      .some((e) => e.type === "audio" && e.source === "dm"),
  );
  await until(
    () =>
      one.current.live.dmStatus === "ready" ||
      one.current.live.dmStatus === "error",
  );
  assert.notEqual(one.current.live.dmStatus, "error", one.current.live.error);
  report.voice_input = one.current.state.journal
    .filter((e) => e.kind === "player")
    .at(-1)?.text;
  assert.ok(report.voice_input);
  console.log(
    "Shared Realtime session transcribed the attributed synthetic voice turn.",
  );

  const destinations = [
    "palm_camp",
    "keeper_archive",
    "voice_machine",
    "beacon_gallery",
    "ferry_quay",
  ];
  for (const [chapter, entry] of route.entries()) {
    const snapshot = await api(`/api/rooms/${a.roomId}`, undefined, a.token);
    assert.equal(snapshot.state.chapter, chapter);
    assert.ok(
      !snapshot.state.pendingCheck && !snapshot.state.rollDecision,
      "Narrator unexpectedly added a dice gate to evidence play.",
    );
    const journalLength = snapshot.state.journal.length;
    await api(
      `/api/rooms/${a.roomId}/party-chat`,
      {
        text: `I have compared my record. Let's agree on the order for chapter ${chapter + 1}.`,
      },
      a.token,
    );
    const afterChat = await api(`/api/rooms/${a.roomId}`, undefined, a.token);
    assert.equal(afterChat.state.journal.length, journalLength);
    const first = await api(
      `/api/rooms/${a.roomId}/puzzle-answer`,
      { puzzleId: entry.id, answer: entry.sam },
      a.token,
    );
    assert.ok(first.accepted && !first.solved);
    const second = await api(
      `/api/rooms/${a.roomId}/puzzle-answer`,
      { puzzleId: entry.id, answer: entry.liz },
      b.token,
    );
    assert.ok(second.solved);
    const beforeTurn = one.events.length;
    const beforeNarrations = one.current.state.journal.filter(
      (e) => e.kind === "dm",
    ).length;
    await api(`/api/rooms/${a.roomId}/action`, { text: entry.action }, a.token);
    await until(() =>
      one.events
        .slice(beforeTurn)
        .some(
          (e) =>
            e.type === "state" &&
            (e.live.dmStatus === "error" ||
              (e.live.dmStatus === "ready" &&
                e.state.journal.filter((item: any) => item.kind === "dm")
                  .length > beforeNarrations)),
        ),
    );
    assert.notEqual(one.current.live.dmStatus, "error", one.current.live.error);
    const final = await api(`/api/rooms/${a.roomId}`, undefined, a.token);
    report.chapters.push({
      puzzle: entry.id,
      from: chapter,
      to: final.state.chapter,
      scene: final.state.scene.title,
      location_id: final.state.scene.locationId,
      narration: final.state.journal.filter((e: any) => e.kind === "dm").at(-1)
        ?.text,
    });
    save();
    assert.equal(
      final.state.chapter,
      chapter + 1,
      `Narrator did not advance the accepted gate ${entry.id}.`,
    );
    assert.equal(
      final.state.scene.locationId,
      destinations[chapter],
      "The public scene must follow the narrated location.",
    );
    console.log(
      `Both seats solved ${entry.id}; live DM advanced to chapter ${final.state.chapter}.`,
    );
  }
  const final = (await api(`/api/rooms/${a.roomId}`, undefined, a.token))
    .state as RoomState;
  assert.equal(final.phase, "complete");
  assert.deepEqual(final.ending, { choice: "leave", rescued: true });
  await pause(200);
  const audioA = one.events
    .filter((e) => e.type === "audio" && e.source === "dm")
    .map((e) => e.delta);
  const audioB = two.events
    .filter((e) => e.type === "audio" && e.source === "dm")
    .map((e) => e.delta);
  assert.ok(audioA.length);
  assert.deepEqual(audioA, audioB);
  assert.ok(
    two.events.some((e) => e.type === "audio" && e.source === a.playerId),
  );
  report.shared_audio_chunks = audioA.length;
  report.ending = final.ending;
  report.status = "ready";
  console.log(
    `Full campaign complete; ${audioA.length} identical DM audio chunks reached both seats.`,
  );
} catch (error) {
  report.status = "error";
  report.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
  console.error(report.error);
} finally {
  for (const ws of sockets) ws.close();
  report.elapsed_seconds = Math.round((Date.now() - started) / 1000);
  save();
  console.log(
    JSON.stringify({
      status: report.status,
      room: report.room,
      chapters: report.chapters.length,
      elapsed_seconds: report.elapsed_seconds,
      proof: path,
    }),
  );
}
