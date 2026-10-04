// Explicit, paid proof for changed worker endpoints; never part of npm test.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { RoomStore } from "../server/store.js";
import { RoomRuntime } from "../server/runtime.js";
import { log, setScene } from "../server/game.js";
import { availableReferences } from "../server/workers.js";
const sunburstScene = process.argv.includes("--sunburst-scene");
const proofName = sunburstScene ? "sunburst-composition" : "workers-live";
const key = process.env.OPENAI_API_KEY;
if (!key)
  throw new Error(
    "Load the private server key before this explicit paid check.",
  );
const store = new RoomStore(resolve(process.env.DATA_DIR ?? "data"));
const created = store.create("QA Explorer", "sam");
const joined = store.join(created.state.id, created.invite, "QA Archivist");
const room = new RoomRuntime(store, created.state.id, {
  key,
  textModel: process.env.OPENAI_TEXT_MODEL ?? "gpt-4.1",
  realtimeModel: process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime-2.1",
  imageModel: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2.5-flare",
  workerModel: process.env.OPENAI_WORKER_MODEL ?? "gpt-5.4-nano",
  dataDir: resolve(process.env.DATA_DIR ?? "data"),
});
try {
  room.state.phase = "playing";
  if (sunburstScene) {
    setScene(room.state, {
      title: "Three records, one discovery",
      location: "Shipwreck shore beneath the island palms",
      description:
        "Sam, Liz and their sixteen-year-old daughter Emily sit together by a driftwood shelter on the wrecked shore. Sam holds a weathered compass, Liz studies a field notebook and Emily points toward a distant old stone arch. They compare the salvage records in soft morning light. Ordinary practical clothes and attentive, relaxed expressions.",
      visualPrompt: "Public scene reference composition proof",
    });
  }
  log(
    room.state,
    "system",
    "QA verification table; seeded public beat for the background-worker proof.",
  );
  log(
    room.state,
    "dm",
    "Beside the wreckage, a locked rescue chest rests in the sand. Its two damaged records need to be compared. Describe your private evidence to each other before trying the mechanism.",
  );
  log(
    room.state,
    "player",
    "I has a compass and a notebook. Can you describe your shipping ledger?",
    created.credentials.playerId,
  );
  room.publish();
  const references = availableReferences(room.state).map((a) => ({
    id: a.id,
    path: a.path,
    sha256: createHash("sha256")
      .update(readFileSync(resolve("public", a.path.slice(1))))
      .digest("hex"),
  }));
  if (sunburstScene) {
    assert.deepEqual(
      new Set(references.map((a) => a.id)),
      new Set(["coastal-field-study", "sam", "liz", "emily"]),
    );
    assert.ok(references.every((a) => a.path.endsWith("-sunburst.webp")));
  }
  const started = Date.now();
  const jobs = [
    room.workers.dispatch("illustration", "current"),
    ...(sunburstScene
      ? []
      : [room.workers.dispatch("language_coach", "current")]),
  ];
  const early = room.state
    .workers!.filter((j) => jobs.some((s) => s.jobId === j.id))
    .map((j) => ({ task: j.task, status: j.status }));
  assert.equal(early.filter((j) => j.status === "running").length, jobs.length);
  while (
    room.state.workers!.some(
      (j) =>
        jobs.some((s) => s.jobId === j.id) &&
        (j.status === "running" || j.status === "queued"),
    )
  ) {
    assert.ok(
      Date.now() - started < 200000,
      "Worker proof exceeded its bounded deadline.",
    );
    await pause(250);
  }
  const result = room.state.workers!.filter((j) =>
    jobs.some((s) => s.jobId === j.id),
  );
  mkdirSync("output/verification", { recursive: true });
  writeFileSync(
    `output/verification/${sunburstScene ? "sunburst-room" : "worker-room"}.json`,
    JSON.stringify(
      {
        roomId: room.state.id,
        sam: created.credentials,
        liz: joined.credentials,
      },
      null,
      2,
    ),
  );
  writeFileSync(
    `output/verification/${proofName}.json`,
    JSON.stringify(
      {
        durationMs: Date.now() - started,
        concurrentStart: early,
        jobs: result,
        references,
        scene: room.state.scene.imageUrl,
        notes: room.state.learningNotes,
      },
      null,
      2,
    ),
  );
  for (const j of result) assert.equal(j.status, "ready", j.error);
  assert.ok(room.state.scene.imageUrl.startsWith("/api/rooms/"));
  if (!sunburstScene) assert.ok(room.state.learningNotes?.length);
  console.log(
    JSON.stringify({
      ok: true,
      roomId: room.state.id,
      durationMs: Date.now() - started,
      jobs: result.map((j) => ({
        task: j.task,
        model: j.model,
        durationMs: j.durationMs,
        inputTokens: j.inputTokens,
        outputTokens: j.outputTokens,
      })),
    }),
  );
} finally {
  room.close();
  store.close();
}
