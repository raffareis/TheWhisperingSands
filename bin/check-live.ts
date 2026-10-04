/** Explicit live integration check; uses paid OpenAI calls only when invoked. */
import assert from "node:assert/strict";
import { once } from "node:events";
import { setTimeout as pause } from "node:timers/promises";
import { writeFileSync, mkdirSync } from "node:fs";
import WebSocket from "ws";
import type { Credentials, RoomState } from "../shared/types.js";
const base = process.env.APP_URL ?? "http://localhost:4317";
const started = Date.now();
const report: Record<string, unknown> = { started: new Date().toISOString() };
const sockets: WebSocket[] = [];
async function api(route: string, value?: unknown, token?: string) {
  const response = await fetch(base + route, {
    method: value === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(value === undefined ? {} : { body: JSON.stringify(value) }),
    signal: AbortSignal.timeout(100000),
  });
  const result = await response.json();
  assert.ok(response.ok, `${route}: ${result.error ?? response.status}`);
  return result;
}
async function until(predicate: () => boolean, timeout = 45000) {
  const before = Date.now();
  while (!predicate()) {
    assert.ok(
      Date.now() - before < timeout,
      "Timed out waiting for a live event.",
    );
    await pause(100);
  }
}
async function connect(c: Credentials) {
  const ws = new WebSocket(base.replace("http", "ws") + "/api/live");
  sockets.push(ws);
  const events: any[] = [];
  ws.on("message", (raw) => events.push(JSON.parse(raw.toString())));
  await once(ws, "open");
  ws.send(
    JSON.stringify({ type: "authenticate", token: c.token, roomId: c.roomId }),
  );
  await until(() => events.some((e) => e.type === "state"));
  return {
    ws,
    events,
    send: (event: unknown) => ws.send(JSON.stringify(event)),
  };
}
try {
  const created = await api("/api/rooms", {
    name: "Rafael · QA",
    characterId: "sam",
  });
  const a = created.credentials as Credentials;
  const joined = await api(`/api/rooms/${a.roomId}/join`, {
    name: "Meg · QA",
    invite: created.invite,
  });
  const b = joined.credentials as Credentials;
  report.room = a.roomId;
  const one = await connect(a);
  const two = await connect(b);
  console.log("Two independent player sockets connected.");
  await api(`/api/rooms/${a.roomId}/start`, {}, a.token);
  let state = (await api(`/api/rooms/${a.roomId}`, undefined, a.token))
    .state as RoomState;
  assert.equal(state.phase, "playing");
  assert.ok(state.journal.some((e) => e.kind === "dm"));
  assert.ok(
    !state.pendingCheck,
    "Opening narration should invite action before requesting dice.",
  );
  report.textNarration = state.journal.find((e) => e.kind === "dm")?.text;
  console.log("Live text storyteller returned the opening scene.");
  one.send({ type: "voice_start" });
  two.send({ type: "voice_start" });
  await until(
    () =>
      one.events.some((e) => e.type === "voice_ready") &&
      two.events.some((e) => e.type === "voice_ready"),
  );
  report.sharedVoiceReady = true;
  console.log("Both players attached to one live Realtime session.");
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
        "I am Sam. I look around the wreckage and try to find a safe path to the freshwater stream. What can I see?",
      response_format: "pcm",
    }),
  });
  assert.ok(speech.ok, `Speech fixture failed (${speech.status}).`);
  const pcm = Buffer.from(await speech.arrayBuffer());
  assert.ok(pcm.length > 4800);
  one.send({ type: "floor_start" });
  await until(() => one.events.some((e) => e.type === "floor_granted"));
  const before = one.events.length;
  for (let offset = 0; offset < pcm.length; offset += 4800) {
    one.send({
      type: "audio",
      data: pcm.subarray(offset, offset + 4800).toString("base64"),
    });
    await pause(100);
  }
  one.send({ type: "floor_end" });
  await until(
    () =>
      one.events
        .slice(before)
        .some((e) => e.type === "audio" && e.source === "dm") &&
      two.events.some((e) => e.type === "audio" && e.source === "dm"),
    60000,
  );
  await until(
    () =>
      one.events
        .slice(before)
        .some((e) => e.type === "state" && e.live.dmStatus === "ready"),
    90000,
  );
  state = (await api(`/api/rooms/${a.roomId}`, undefined, a.token)).state;
  const input = state.journal.filter((e) => e.kind === "player").at(-1);
  assert.ok(input?.text);
  assert.equal(input?.playerId, a.playerId);
  const dmA = one.events.filter((e) => e.type === "audio" && e.source === "dm");
  const dmB = two.events.filter((e) => e.type === "audio" && e.source === "dm");
  assert.equal(dmA.length, dmB.length);
  assert.deepEqual(
    dmA.map((e) => e.delta),
    dmB.map((e) => e.delta),
  );
  report.voiceInput = input?.text;
  report.voiceOutput = state.journal
    .filter((e) => e.kind === "dm")
    .at(-1)?.text;
  report.sharedAudioChunks = dmA.length;
  report.inputRelayedToCompanion = two.events.some(
    (e) => e.type === "audio" && e.source === a.playerId,
  );
  assert.ok(report.inputRelayedToCompanion);
  console.log(
    `Voice transcribed, master replied, and ${dmA.length} identical audio chunks reached both players.`,
  );
  // Force one scene illustration through the actual application's image endpoint, even if the DM waited for dice.
  if (state.scene.status !== "generating")
    await api(`/api/rooms/${a.roomId}/image-retry`, {}, a.token);
  await until(
    () =>
      one.events.some(
        (e) =>
          e.type === "state" &&
          e.state.scene.status === "ready" &&
          e.state.scene.imageUrl.startsWith("/api/"),
      ),
    190000,
  );
  state = (await api(`/api/rooms/${a.roomId}`, undefined, a.token)).state;
  assert.equal(state.scene.status, "ready");
  const image = await fetch(base + state.scene.imageUrl, {
    headers: { Authorization: `Bearer ${a.token}` },
  });
  assert.ok(image.ok);
  report.generatedImageBytes = (await image.arrayBuffer()).byteLength;
  assert.ok(Number(report.generatedImageBytes) > 1000);
  report.scene = state.scene.title;
  report.authoritativeCheck = state.pendingCheck;
  report.imageUrl = state.scene.imageUrl;
  console.log(
    "Live image generation completed and the private image endpoint served the result.",
  );
  report.elapsedSeconds = Math.round((Date.now() - started) / 1000);
  report.ok = true;
} catch (error) {
  report.ok = false;
  report.error = error instanceof Error ? error.message : String(error);
  console.error(report.error);
  process.exitCode = 1;
} finally {
  for (const ws of sockets) ws.close();
  mkdirSync("output/verification", { recursive: true });
  writeFileSync(
    "output/verification/live-check.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}
