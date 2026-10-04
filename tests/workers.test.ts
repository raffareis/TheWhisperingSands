import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { RoomStore } from "../server/store.js";
import {
  BackgroundWorkers,
  availableReferences,
  selectReference,
} from "../server/workers.js";
import { RoomRuntime } from "../server/runtime.js";
import { setScene } from "../server/game.js";
async function until(test: () => boolean) {
  const start = Date.now();
  while (!test()) {
    assert.ok(Date.now() - start < 2000, "Worker event timeout");
    await pause(5);
  }
}
function setup(request: typeof fetch) {
  const path = mkdtempSync(join(tmpdir(), "whispering-workers-"));
  const store = new RoomStore(path);
  const created = store.create("Sam", "sam");
  let state = created.state;
  state.phase = "playing";
  const workers = new BackgroundWorkers(
    () => state,
    () => store.save(state),
    store,
    {
      key: "test",
      imageModel: "test-image",
      workerModel: "test-cheap",
      dataDir: path,
    },
    request,
  );
  return {
    path,
    store,
    workers,
    get state() {
      return state;
    },
    replace() {
      state = structuredClone(state);
    },
    close() {
      workers.close();
      store.close();
      rmSync(path, { recursive: true, force: true });
    },
  };
}
test("independent helpers run concurrently with image rendering and are deduplicated", async () => {
  const calls: {
    url: string;
    init?: RequestInit;
    resolve: (r: Response) => void;
  }[] = [];
  const request: typeof fetch = async (url, init) =>
    new Promise((resolve) => calls.push({ url: String(url), init, resolve }));
  const t = setup(request);
  try {
    const art = t.workers.dispatch("illustration", "current", "image-call");
    const recap = t.workers.dispatch("recap", "current", "recap-call");
    const english = t.workers.dispatch(
      "language_coach",
      "current",
      "english-call",
    );
    await until(() => calls.length === 3);
    assert.equal(
      t.state.workers?.filter((j) => j.status === "running").length,
      3,
    );
    assert.equal(
      t.workers.dispatch("illustration", "current", "image-call").jobId,
      art.jobId,
    );
    assert.equal(calls.length, 3);
    const image = calls.find((c) => c.url.includes("/images/"))!;
    assert.ok(
      image.init?.body instanceof FormData,
      "References are sent as images, not paths in text",
    );
    assert.ok((image.init!.body as FormData).getAll("image[]").length > 0);
    for (const c of calls.filter((c) => c !== image))
      c.resolve(
        Response.json({
          output: [
            {
              content: [
                {
                  type: "output_text",
                  text: "You discovered useful supplies.",
                },
              ],
            },
          ],
          usage: {
            input_tokens: 123,
            output_tokens: 12,
            input_tokens_details: { cached_tokens: 10 },
          },
        }),
      );
    await until(() => t.state.learningNotes?.length === 2);
    assert.equal(
      t.state.workers?.find((j) => j.id === recap.jobId)?.inputTokens,
      123,
    );
    assert.equal(
      t.state.workers?.find((j) => j.id === english.jobId)?.model,
      "test-cheap",
    );
    assert.equal(
      t.state.workers?.find((j) => j.id === art.jobId)?.status,
      "running",
    );
    image.resolve(
      Response.json({
        data: [
          { b64_json: Buffer.from("fake image bytes").toString("base64") },
        ],
      }),
    );
    await until(
      () =>
        t.state.workers?.find((j) => j.id === art.jobId)?.status === "ready",
    );
  } finally {
    t.close();
  }
});
test("superseding an image after state cloning aborts it and updates the current history, not stale objects", async () => {
  const calls: { signal: AbortSignal; resolve: (r: Response) => void }[] = [];
  const request: typeof fetch = async (_, init) =>
    new Promise((resolve) => calls.push({ signal: init!.signal!, resolve }));
  const t = setup(request);
  try {
    const oldId = t.state.scene.id;
    const first = t.workers.dispatch("illustration", "current");
    await until(() => calls.length === 1);
    t.replace();
    setScene(t.state, {
      title: "The old arch",
      location: "Archive",
      description: "A quiet stone archive.",
      visualPrompt: "A quiet stone archive.",
    });
    t.workers.dispatch("illustration", "current");
    assert.equal(calls[0].signal.aborted, true);
    assert.equal(
      t.state.sceneHistory.find((s) => s.id === oldId)?.status,
      "error",
    );
    calls[0].resolve(
      Response.json({
        data: [{ b64_json: Buffer.from("stale").toString("base64") }],
      }),
    );
    await until(() => calls.length === 2);
    assert.ok(!existsSync(join(t.path, "images", t.state.id, `${oldId}.webp`)));
    assert.equal(
      t.state.workers?.find((j) => j.id === first.jobId)?.status,
      "superseded",
    );
    t.workers.pauseImages();
    assert.equal(calls[1].signal.aborted, true);
    calls[1].resolve(Response.json({ data: [{ b64_json: "c3RhbGU=" }] }));
    await pause(10);
    assert.equal(t.state.scene.status, "error");
  } finally {
    t.close();
  }
});
test("Realtime dispatch starts before response.done; replay is idempotent and cancelled tools have no authoritative effect", async () => {
  const dir = mkdtempSync(join(tmpdir(), "whispering-early-"));
  const store = new RoomStore(dir);
  const created = store.create("Sam", "sam");
  store.join(created.state.id, created.invite, "Liz");
  const room = new RoomRuntime(store, created.state.id, {
    key: "test",
    textModel: "test",
    realtimeModel: "test",
    imageModel: "test",
    dataDir: dir,
  });
  room.state.phase = "playing";
  let calls = 0;
  let resolve!: (r: Response) => void;
  const request: typeof fetch = async () => {
    calls++;
    return new Promise((r) => {
      resolve = r;
    });
  };
  room.workers = new BackgroundWorkers(
    () => room.state,
    () => room.publish(),
    store,
    room.settings,
    request,
  );
  const emit = (e: Record<string, unknown>) =>
    (
      room as unknown as { onRealtime: (e: Record<string, unknown>) => void }
    ).onRealtime(e);
  const item = {
    type: "function_call",
    status: "completed",
    name: "dispatch_background",
    call_id: "early",
    arguments: JSON.stringify({ task: "illustration", contextId: "current" }),
  };
  try {
    emit({ type: "response.created", response: { id: "r" } });
    emit({ type: "response.output_item.done", response_id: "r", item });
    await until(() => calls === 1);
    emit({ type: "response.output_item.done", response_id: "r", item });
    assert.equal(calls, 1);
    resolve(Response.json({ data: [{ b64_json: "c3RhbGU=" }] }));
    await pause(10);
    assert.equal(
      room.state.scene.imageUrl,
      "/art/coastal-field-study-sunburst.webp",
      "Speculative output waits for response commitment",
    );
    emit({
      type: "response.done",
      response: {
        id: "r",
        status: "cancelled",
        output: [
          item,
          {
            type: "function_call",
            name: "update_party",
            arguments: JSON.stringify({
              reason: "Bad",
              health: [{ characterId: "sam", delta: -1 }],
              items: [],
              clues: [],
              nextChapter: null,
            }),
          },
        ],
      },
    });
    await until(() => room.state.workers?.[0].status === "superseded");
    assert.equal(room.state.characters[0].hp, 10);
    assert.notEqual(
      room.live.dmStatus,
      "error",
      "An intentional interruption is not a voice failure",
    );
    assert.equal(
      room.state.scene.imageUrl,
      "/art/coastal-field-study-sunburst.webp",
    );
    assert.equal(calls, 1);
  } finally {
    room.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("hourly budgets survive store restart; worker recovery does not automatically charge again", () => {
  const path = mkdtempSync(join(tmpdir(), "whispering-budget-"));
  let store = new RoomStore(path);
  try {
    const r = store.create("Sam", "sam");
    for (let i = 0; i < 24; i++)
      store.reserveWorker(r.state.id, "illustration");
    store.close();
    store = new RoomStore(path);
    assert.throws(
      () => store.reserveWorker(r.state.id, "illustration"),
      /hourly budget/,
    );
    r.state.workers = [
      {
        id: "interrupted",
        task: "recap",
        contextId: "current",
        status: "running",
        startedAt: new Date().toISOString(),
      },
    ];
    store.save(r.state);
    const room = new RoomRuntime(store, r.state.id, {
      key: "",
      textModel: "test",
      realtimeModel: "test",
      imageModel: "test",
      dataDir: path,
    });
    assert.equal(room.state.workers?.[0].status, "error");
    room.close();
  } finally {
    store.close();
    rmSync(path, { recursive: true, force: true });
  }
});
test("System One can only select current finite candidates with validated confidence, shadow and outage fallback", async () => {
  const candidates = [
    {
      id: "shore",
      path: "",
      role: "environment",
      tags: [],
      visual_description: "Shore",
    },
    {
      id: "ruins",
      path: "",
      role: "environment",
      tags: [],
      visual_description: "Ruins",
    },
  ];
  const settings = {
    baseUrl: "https://example.test/v1",
    model: "jev",
    key: "test",
  };
  const mock =
    (choice: string, confidence: number): typeof fetch =>
    async () =>
      Response.json({
        answers: {
          reference: {
            type: "choice",
            choice,
            confidence,
            probabilities: { shore: confidence, ruins: 1 - confidence },
          },
        },
      });
  const signal = new AbortController().signal;
  assert.equal(
    await selectReference(
      "shore",
      candidates,
      settings,
      signal,
      mock("shore", 0.95),
    ),
    "shore",
  );
  assert.equal(
    await selectReference(
      "shore",
      candidates,
      settings,
      signal,
      mock("future-secret", 0.99),
    ),
    null,
  );
  assert.equal(
    await selectReference(
      "shore",
      candidates,
      settings,
      signal,
      mock("shore", 0.5),
    ),
    null,
  );
  assert.equal(
    await selectReference(
      "shore",
      candidates,
      { ...settings, shadow: true },
      signal,
      mock("shore", 0.95),
    ),
    null,
  );
  assert.equal(
    await selectReference("shore", candidates, settings, signal, async () => {
      throw new Error("offline");
    }),
    null,
  );
});

test("the style plate and all three named character references survive the four-image cap", () => {
  const request: typeof fetch = async () => {
    throw new Error("No paid request expected");
  };
  const t = setup(request);
  try {
    t.state.scene.description =
      "Sam, Liz and Emily sit on the shore around their notebook.";
    const ids = availableReferences(t.state).map((a) => a.id);
    assert.deepEqual(
      new Set(ids),
      new Set(["coastal-field-study", "sam", "liz", "emily"]),
    );
  } finally {
    t.close();
  }
});
