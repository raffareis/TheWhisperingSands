// One explicit paid runtime edit; never run as part of npm test.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { RoomStore } from "../server/store.js";
import { RoomRuntime } from "../server/runtime.js";
import { setScene } from "../server/game.js";
import { kleinModel } from "../server/image-edits.js";

assert.ok(
  process.env.OPENAI_API_KEY && process.env.FAL_KEY,
  "Load both private server keys.",
);
const reportPath = resolve("output/verification/hybrid-live.json");
assert.ok(
  !existsSync(reportPath),
  "Reconcile the existing proof before any additional paid request.",
);
const previousProof = JSON.parse(
  readFileSync("output/verification/sunburst-composition.json", "utf8"),
);
const match = String(previousProof.scene).match(
  /^\/api\/rooms\/([a-z0-9_-]{4,20})\/images\/([a-f0-9-]{36})\.webp$/,
);
assert.ok(match, "Requires the previous approved Flare composition proof.");
const source = readFileSync(
  resolve("data/images", match[1], `${match[2]}.webp`),
);
const dataDir = resolve("output/verification/hybrid-data");
const store = new RoomStore(dataDir);
const created = store.create("QA Hybrid", "sam");
const room = new RoomRuntime(store, created.state.id, {
  key: process.env.OPENAI_API_KEY!,
  falKey: process.env.FAL_KEY!,
  imageModel: "gpt-image-2.5-flare",
  realtimeModel: "gpt-realtime-2.1",
  textModel: "gpt-4.1",
  dataDir,
});
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
const report = {
  status: "submitted",
  source_sha256: hash(source),
  source_proof: "sunburst-composition.json",
  worker_sha256: hash(readFileSync("server/workers.ts")),
  edit_sha256: hash(readFileSync("server/image-edits.ts")),
};
mkdirSync(resolve("output/verification"), { recursive: true });
writeFileSync(reportPath, JSON.stringify(report, null, 2));
try {
  room.state.phase = "playing";
  const base = room.state.scene;
  base.chapter = 0;
  base.location = "Shipwreck shore beneath the island palms";
  base.description =
    "Sam, Liz and their sixteen-year-old daughter Emily sit by a driftwood shelter. Sam holds a compass, Liz studies a field notebook and Emily points toward the old arch.";
  base.imageUrl = `/api/rooms/${room.state.id}/images/${base.id}.webp`;
  const directory = resolve(dataDir, "images", room.state.id);
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, `${base.id}.webp`), source);
  setScene(room.state, {
    title: "A pause beside the shelter",
    location: base.location,
    description:
      "Sam, Liz and Emily remain by the driftwood shelter. Sam holds his compass and Liz studies her notebook. Emily lowers her pointing arm and rests both hands in her lap.",
    visualPrompt: "Small public pose change at the same shelter",
    edit: {
      kind: "pose",
      change: "Emily lowers her pointing arm and rests both hands in her lap.",
    },
  });
  room.publish();
  const dispatched = room.workers.dispatch("illustration", "current");
  const start = Date.now();
  while (
    room.state.workers!.some(
      (j) =>
        j.id === dispatched.jobId && ["queued", "running"].includes(j.status),
    )
  ) {
    assert.ok(
      Date.now() - start < 35000,
      "Runtime edit proof exceeded its deadline; do not resubmit.",
    );
    await pause(100);
  }
  const job = room.state.workers!.find((j) => j.id === dispatched.jobId)!;
  assert.equal(job.status, "ready", job.error);
  assert.equal(job.model, kleinModel);
  assert.equal(job.imageAttempts?.length, 1);
  assert.equal(room.state.scene.editDepth, 1);
  const imagePath = resolve(directory, `${room.state.scene.id}.webp`);
  const finished = {
    ...report,
    status: "ready",
    job,
    image_path: imagePath,
    output_sha256: hash(readFileSync(imagePath)),
  };
  writeFileSync(reportPath, JSON.stringify(finished, null, 2));
  console.log(
    JSON.stringify({
      ok: true,
      model: job.model,
      duration_ms: job.durationMs,
      image_path: imagePath,
    }),
  );
} catch (error) {
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        ...report,
        status: "error",
        jobs: room.state.workers,
        error: error instanceof Error ? error.message : "Proof failed",
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  room.close();
  store.close();
}
