import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  existsSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { RoomStore } from "../server/store.js";
import { setScene } from "../server/game.js";
import { BackgroundWorkers } from "../server/workers.js";
import { fastEditSource, kleinModel } from "../server/image-edits.js";

const webp = Buffer.from("RIFF0000WEBPtest-render");
const changedDescription =
  "Sam, Liz and Emily sit beneath the shelter. Emily rests both hands in her lap.";
const change = "Emily lowers her pointing arm and rests both hands in her lap.";
const success = () =>
  Response.json(
    {
      images: [{ url: `data:image/webp;base64,${webp.toString("base64")}` }],
      has_nsfw_concepts: [false],
    },
    { headers: { "x-fal-request-id": "test-request" } },
  );
async function until(predicate: () => boolean) {
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, "Worker event timed out");
    await pause(5);
  }
}
function setup(request: typeof fetch, falKey = "private-test-key") {
  const dir = mkdtempSync(join(tmpdir(), "whispering-edits-"));
  const store = new RoomStore(dir);
  let state = store.create("QA", "sam").state;
  state.phase = "playing";
  state.scene.chapter = 0;
  state.scene.location = "Driftwood shelter";
  state.scene.description =
    "Sam, Liz and Emily sit beneath the shelter. Emily points toward the arch.";
  state.scene.imageUrl = `/api/rooms/${state.id}/images/${state.scene.id}.webp`;
  const imageDir = join(dir, "images", state.id);
  mkdirSync(imageDir, { recursive: true });
  writeFileSync(join(imageDir, `${state.scene.id}.webp`), webp);
  setScene(state, {
    title: "A quieter moment",
    location: "Driftwood shelter",
    description: changedDescription,
    visualPrompt: changedDescription,
    edit: { kind: "pose", change },
  });
  const workers = new BackgroundWorkers(
    () => state,
    () => store.save(state),
    store,
    { key: "openai-test-key", imageModel: "test-flare", dataDir: dir, falKey },
    request,
  );
  return {
    dir,
    store,
    workers,
    get state() {
      return state;
    },
    clone() {
      state = structuredClone(state);
    },
    close() {
      workers.close();
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
test("small edits use one inline previous frame, no classifier or secret context, and publish after commitment", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const t = setup(async (url, init) => {
    calls.push({ url: String(url), init });
    return success();
  });
  try {
    t.state.clues.push({
      id: "sentinel",
      title: "Private probe",
      text: "DO-NOT-SEND",
    });
    const job = t.workers.dispatch("illustration", "current", "edit", true);
    await until(
      () =>
        calls.length === 1 &&
        t.state.workers![0].imageAttempts?.[0].status === "ready",
    );
    assert.equal(calls[0].url, `https://fal.run/${kleinModel}`);
    const body = JSON.parse(calls[0].init!.body as string);
    assert.equal(body.image_urls.length, 1);
    assert.equal(body.sync_mode, true);
    assert.equal(body.num_inference_steps, 4);
    assert.ok(body.prompt.includes(change));
    assert.ok(!JSON.stringify(body).includes("DO-NOT-SEND"));
    assert.ok(
      !existsSync(
        join(t.dir, "images", t.state.id, `${t.state.scene.id}.webp`),
      ),
    );
    t.clone();
    t.workers.confirm("edit");
    await until(() => t.state.workers![0].status === "ready");
    assert.equal(t.state.scene.editDepth, 1);
    assert.equal(
      t.state.workers![0].imageAttempts![0].requestId,
      "test-request",
    );
    assert.equal(
      t.workers.dispatch("illustration", "current").jobId,
      job.jobId,
    );
    assert.equal(calls.length, 1);
    assert.ok(
      existsSync(join(t.dir, "images", t.state.id, `${t.state.scene.id}.webp`)),
    );
  } finally {
    t.close();
  }
});
test("new locations, cast changes, unconfirmed frames, base art, chapter changes and drift limits compose with Flare", async () => {
  const cases = [
    (t: ReturnType<typeof setup>) => {
      t.state.scene.location = "Archive";
    },
    (t: ReturnType<typeof setup>) => {
      t.state.scene.description = "Sam and Liz sit together.";
    },
    (t: ReturnType<typeof setup>) => {
      t.state.sceneHistory.at(-1)!.status = "generating";
    },
    (t: ReturnType<typeof setup>) => {
      t.state.sceneHistory.at(-1)!.imageUrl = "/art/shipwreck-sunburst.webp";
    },
    (t: ReturnType<typeof setup>) => {
      t.state.chapter = 1;
    },
    (t: ReturnType<typeof setup>) => {
      t.state.sceneHistory.at(-1)!.editDepth = 2;
    },
    (t: ReturnType<typeof setup>) => {
      delete t.state.scene.edit;
    },
    (t: ReturnType<typeof setup>) => {
      delete t.state.sceneHistory.at(-1)!.chapter;
    },
  ];
  for (const mutate of cases) {
    const urls: string[] = [];
    const t = setup(async (url) => {
      urls.push(String(url));
      return Response.json({ data: [{ b64_json: webp.toString("base64") }] });
    });
    try {
      mutate(t);
      t.workers.dispatch("illustration", "current");
      await until(() => t.state.workers![0].status === "ready");
      assert.deepEqual(urls, ["https://api.openai.com/v1/images/edits"]);
      assert.equal(t.state.scene.editDepth, 0);
    } finally {
      t.close();
    }
  }
});
test("missing fal credentials preserve Flare without a failed extra call", async () => {
  const urls: string[] = [];
  const t = setup(async (url) => {
    urls.push(String(url));
    return Response.json({ data: [{ b64_json: webp.toString("base64") }] });
  }, "");
  try {
    t.workers.dispatch("illustration", "current");
    await until(() => t.state.workers![0].status === "ready");
    assert.deepEqual(urls, ["https://api.openai.com/v1/images/edits"]);
  } finally {
    t.close();
  }
});
test("definitive fal rejection falls back once and consumes a second durable budget slot", async () => {
  for (const used of [22, 23]) {
    const urls: string[] = [];
    const t = setup(async (url) => {
      urls.push(String(url));
      return String(url).startsWith("https://fal.run/")
        ? Response.json({}, { status: 429 })
        : Response.json({ data: [{ b64_json: webp.toString("base64") }] });
    });
    try {
      for (let i = 0; i < used; i++)
        t.store.reserveWorker(t.state.id, "illustration");
      t.workers.dispatch("illustration", "current");
      await until(() =>
        ["ready", "error"].includes(t.state.workers![0].status),
      );
      assert.equal(urls.length, used === 22 ? 2 : 1);
      assert.equal(t.state.workers![0].status, used === 22 ? "ready" : "error");
      assert.match(t.state.workers![0].fallbackReason!, /429/);
      assert.throws(
        () => t.store.reserveWorker(t.state.id, "illustration"),
        /hourly budget/,
      );
    } finally {
      t.close();
    }
  }
});
test("uncertain failures, safety rejections and malformed outputs never trigger another paid call", async () => {
  const failures = [
    async () => {
      throw new Error("Network timeout");
    },
    async () => Response.json({}, { status: 500 }),
    async () => Response.json({ has_nsfw_concepts: [true], images: [] }),
    async () =>
      Response.json({ images: [{ url: "https://evil.test/internal" }] }),
    async () =>
      Response.json({ images: [{ url: "data:image/webp;base64,YmFk" }] }),
  ];
  for (const failure of failures) {
    let calls = 0;
    const t = setup(async () => {
      calls++;
      return failure();
    });
    try {
      const previousUrl = t.state.scene.imageUrl;
      t.workers.dispatch("illustration", "current");
      await until(() => t.state.workers![0].status === "error");
      assert.equal(calls, 1);
      assert.equal(t.state.scene.imageUrl, previousUrl);
    } finally {
      t.close();
    }
  }
});
test("cancelled fast edits neither publish nor fall back even after a late definitive rejection", async () => {
  let calls = 0;
  let signal!: AbortSignal;
  let finish!: (response: Response) => void;
  const t = setup(async (_, init) => {
    calls++;
    signal = init!.signal!;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  try {
    t.workers.dispatch("illustration", "current", "cancelled", true);
    await until(() => calls === 1);
    t.workers.invalidate("cancelled");
    assert.equal(signal.aborted, true);
    finish(Response.json({}, { status: 429 }));
    await pause(15);
    assert.equal(calls, 1);
    assert.equal(t.state.workers![0].status, "superseded");
    assert.ok(
      !existsSync(
        join(t.dir, "images", t.state.id, `${t.state.scene.id}.webp`),
      ),
    );
  } finally {
    t.close();
  }
});
test("edit source cannot follow a file or room symlink into another room", () => {
  const t = setup(async () => {
    throw new Error("No request expected");
  });
  try {
    const sourcePath = join(
      t.dir,
      "images",
      t.state.id,
      `${t.state.sceneHistory.at(-1)!.id}.webp`,
    );
    const other = join(t.dir, "images", "other-room");
    mkdirSync(other);
    const outside = join(other, "image.webp");
    writeFileSync(outside, webp);
    rmSync(sourcePath);
    symlinkSync(outside, sourcePath);
    assert.equal(fastEditSource(t.state, t.dir), null);
    rmSync(join(t.dir, "images", t.state.id), { recursive: true });
    symlinkSync(other, join(t.dir, "images", t.state.id));
    assert.equal(fastEditSource(t.state, t.dir), null);
  } finally {
    t.close();
  }
});
