import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { setTimeout as pause } from "node:timers/promises";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket, { WebSocketServer } from "ws";
import { puzzles } from "../server/puzzles.js";
import { RoomStore } from "../server/store.js";
import { RoomRuntime } from "../server/runtime.js";
import { rollCheck, acceptRoll } from "../server/game.js";
async function until(predicate: () => boolean) {
  const start = Date.now();
  while (!predicate()) {
    assert.ok(
      Date.now() - start < 3000,
      "Expected protocol event did not arrive.",
    );
    await pause(5);
  }
}
test(
  "one shared Realtime session executes private tools and attributes delayed transcripts",
  { timeout: 15000 },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "whispering-rt-"));
    const store = new RoomStore(dir);
    const provider = new WebSocketServer({ port: 0 });
    const browser = new WebSocketServer({ port: 0 });
    await Promise.all([
      once(provider, "listening"),
      once(browser, "listening"),
    ]);
    const sockets: WebSocket[] = [];
    let providerSocket: WebSocket | null = null;
    let connections = 0;
    const incoming: any[] = [];
    const r = store.create("Rafael", "sam");
    const j = store.join(r.state.id, r.invite, "Meg");
    const a = j.state.players[0],
      b = j.state.players[1];
    const room = new RoomRuntime(
      store,
      r.state.id,
      {
        key: "test-key",
        textModel: "test-text",
        realtimeModel: "test-realtime",
        imageModel: "test-image",
        dataDir: dir,
      },
      () => {
        connections++;
        return new WebSocket(
          `ws://127.0.0.1:${(provider.address() as { port: number }).port}`,
        );
      },
    );
    room.state.phase = "playing";
    provider.on("connection", (ws) => {
      providerSocket = ws;
      ws.on("message", (raw) => {
        const e = JSON.parse(raw.toString());
        incoming.push(e);
        if (e.type === "session.update") {
          assert.equal(
            e.session.type,
            "realtime",
            "Every GA session update requires its type, including context refreshes.",
          );
          ws.send(JSON.stringify({ type: "session.updated" }));
        }
      });
    });
    async function client(player: typeof a) {
      const accepted = once(browser, "connection");
      const ws = new WebSocket(
        `ws://127.0.0.1:${(browser.address() as { port: number }).port}`,
      );
      sockets.push(ws);
      const events: any[] = [];
      ws.on("message", (raw) => events.push(JSON.parse(raw.toString())));
      await once(ws, "open");
      const [serverSocket] = await accepted;
      room.connect(serverSocket, player);
      return { ws, events };
    }
    const emit = (event: unknown) =>
      providerSocket!.send(JSON.stringify(event));
    try {
      const one = await client(a);
      const two = await client(b);
      await until(
        () =>
          one.events.some((e) => e.type === "state") &&
          two.events.some((e) => e.type === "state"),
      );
      assert.equal(
        one.events.find((e) => e.type === "state").state.puzzleView
          .evidenceTitle,
        puzzles[0].sam.title,
      );
      assert.equal(
        two.events.find((e) => e.type === "state").state.puzzleView
          .evidenceTitle,
        puzzles[0].liz.title,
      );
      assert.ok(!JSON.stringify(one.events).includes(puzzles[0].liz.lines[0]));
      assert.ok(!JSON.stringify(two.events).includes(puzzles[0].sam.lines[0]));
      await Promise.all([room.startVoice(a), room.startVoice(b)]);
      assert.equal(connections, 1);
      assert.equal(room.live.dmStatus, "ready");
      const config = incoming.find((e) => e.type === "session.update").session;
      assert.equal(config.audio.input.format.rate, 24000);
      assert.equal(config.audio.input.turn_detection, null);
      assert.ok(
        config.tools.some(
          (tool: { name: string }) => tool.name === "finish_rescue",
        ),
      );
      await room.action(a, "I try to move the heavy wreckage.");
      await until(() => incoming.some((e) => e.type === "response.create"));
      emit({ type: "response.created", response: { id: "r1" } });
      emit({
        type: "response.done",
        response: {
          id: "r1",
          status: "completed",
          output: [
            {
              type: "function_call",
              name: "request_check",
              call_id: "check-1",
              arguments: JSON.stringify({
                characterId: "sam",
                stat: "STR",
                target: 7,
                reason: "Move heavy wreckage.",
                dangerous: true,
              }),
            },
          ],
        },
      });
      await until(() => !!room.state.pendingCheck);
      assert.equal(room.state.pendingCheck?.characterId, "sam");
      await until(() =>
        incoming.some((e) => e.item?.type === "function_call_output"),
      );
      const continuationIndex = incoming.findLastIndex(
        (e) => e.type === "response.create",
      );
      assert.equal(incoming[continuationIndex - 1].type, "session.update");
      assert.ok(
        incoming[continuationIndex - 1].session.instructions.includes(
          room.state.pendingCheck!.id,
        ),
      );
      const toolOutput = incoming.find(
        (e) => e.item?.type === "function_call_output",
      );
      assert.equal(JSON.parse(toolOutput.item.output).stat, "STR");
      emit({ type: "response.created", response: { id: "r2" } });
      emit({
        type: "response.done",
        response: { id: "r2", status: "completed", output: [] },
      });
      await until(() => room.live.dmStatus === "ready");
      const responsesBeforePuzzle = incoming.filter(
        (e) => e.type === "response.create",
      ).length;
      room.puzzleHint(room.state.puzzles![0].id);
      await until(() => incoming.at(-1)?.type === "session.update");
      assert.ok(incoming.at(-1).session.instructions.includes('"hintCount":1'));
      assert.equal(
        incoming.filter((e) => e.type === "response.create").length,
        responsesBeforePuzzle,
      );
      room.puzzleAnswer(
        a,
        room.state.puzzles![0].id,
        puzzles[0].sam.answers[0],
      );
      await until(() =>
        incoming.at(-1)?.session?.instructions.includes('"accepted":["sam"]'),
      );
      assert.equal(
        incoming.filter((e) => e.type === "response.create").length,
        responsesBeforePuzzle,
      );
      const result = rollCheck(
        room.state,
        a.id,
        room.state.pendingCheck!.id,
        () => 1,
      );
      assert.equal(room.state.rollDecision, result.id);
      assert.equal(room.state.characters[0].hp, 9);
      acceptRoll(room.state, a.id, result.id);
      await room.afterRoll(result);
      await until(() =>
        incoming.some((e) =>
          e.item?.content?.[0]?.text?.includes("AUTHORITATIVE DICE RESULT"),
        ),
      );
      emit({ type: "response.created", response: { id: "r3" } });
      emit({
        type: "response.done",
        response: { id: "r3", status: "completed", output: [] },
      });
      await until(() => room.live.dmStatus === "ready");
      room.beginFloor(a);
      assert.throws(() => room.beginFloor(b), /companion is speaking/);
      const pcm = Buffer.alloc(4800).toString("base64");
      room.audio(a.id, pcm);
      room.commitFloor(a.id);
      emit({ type: "input_audio_buffer.committed", item_id: "audio-a" });
      await pause(10);
      room.beginFloor(b);
      room.audio(b.id, pcm);
      room.commitFloor(b.id);
      emit({ type: "input_audio_buffer.committed", item_id: "audio-b" });
      await pause(10);
      emit({
        type: "conversation.item.input_audio_transcription.completed",
        item_id: "audio-b",
        transcript: "Liz speaks second.",
      });
      emit({
        type: "conversation.item.input_audio_transcription.completed",
        item_id: "audio-a",
        transcript: "Sam spoke first.",
      });
      await until(() =>
        room.state.journal.some((e) => e.text === "Sam spoke first."),
      );
      assert.equal(
        room.state.journal.find((e) => e.text === "Sam spoke first.")?.playerId,
        a.id,
      );
      assert.equal(
        room.state.journal.find((e) => e.text === "Liz speaks second.")
          ?.playerId,
        b.id,
      );
      await until(() =>
        two.events.some((e) => e.type === "audio" && e.source === a.id),
      );
      assert.ok(
        !one.events.some((e) => e.type === "audio" && e.source === a.id),
      );
      const responsesBeforeChat = incoming.filter(
        (e) => e.type === "response.create",
      ).length;
      const journalBeforeChat = room.state.journal.length;
      room.partyChat(a, { text: "Secret evidence from Sam, for Liz only." });
      room.live.dmStatus = "thinking";
      room.beginPartyFloor(a);
      assert.throws(() => room.beginPartyFloor(b), /companion is speaking/);
      assert.throws(() => room.beginFloor(b), /companion microphone/);
      room.partyAudio(a.id, pcm);
      room.endPartyFloor(a.id);
      await until(() => two.events.some((e) => e.type === "party_audio"));
      assert.ok(!one.events.some((e) => e.type === "party_audio"));
      assert.equal(room.state.journal.length, journalBeforeChat);
      assert.equal(room.live.dmStatus, "thinking");
      assert.equal(
        incoming.filter((e) => e.type === "response.create").length,
        responsesBeforeChat,
      );
      assert.ok(
        !incoming.some((e) =>
          JSON.stringify(e).includes("Secret evidence from Sam"),
        ),
      );
      room.live.dmStatus = "ready";
      room.toggleImages(false);
      assert.equal(store.load(r.state.id).preferences.illustrations, false);
      room.live.dmStatus = "thinking";
      emit({ type: "response.created", response: { id: "audio-completed" } });
      emit({
        type: "response.done",
        response: { id: "audio-completed", status: "completed", output: [] },
      });
      await until(() => room.live.dmStatus === "ready");
      room.state.chapter = 4;
      room.state.puzzles![4].solved = true;
      room.state.preferences.illustrations = false;
      const rescueMessageStart = incoming.length;
      await room.action(a, "We confront the keeper and board the ferry.");
      emit({ type: "response.created", response: { id: "rescue" } });
      emit({
        type: "response.done",
        response: {
          id: "rescue",
          status: "completed",
          output: [
            {
              type: "function_call",
              name: "finish_rescue",
              call_id: "finish-rescue",
              arguments: JSON.stringify({
                choice: "confront",
                scene: {
                  title: "Together aboard",
                  location: "Ferry Quay",
                  locationId: "ferry_quay",
                  description:
                    "Sam, Liz and Emily board the rescue ferry together.",
                  edit: null,
                },
              }),
            },
          ],
        },
      });
      await until(() => room.state.phase === "complete");
      assert.deepEqual(room.state.ending, {
        choice: "confront",
        rescued: true,
      });
      // The previous action also ends in update + response.create; wait for
      // the context resulting from this rescue, not that earlier pair.
      await until(() =>
        incoming
          .slice(rescueMessageStart)
          .some(
            (e) =>
              e.type === "session.update" &&
              e.session.instructions.includes('"rescued":true'),
          ),
      );
      assert.ok(
        incoming
          .slice(rescueMessageStart)
          .some(
            (e) =>
              e.type === "session.update" &&
              e.session.instructions.includes('"rescued":true'),
          ),
      );
    } finally {
      room.close();
      for (const ws of sockets) ws.close();
      for (const ws of provider.clients) ws.terminate();
      for (const ws of browser.clients) ws.terminate();
      await Promise.all([
        new Promise<void>((resolve) => provider.close(() => resolve())),
        new Promise<void>((resolve) => browser.close(() => resolve())),
      ]);
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test("party relay expires and disconnects without paid work; chat limits persist only public discussion", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "whispering-party-"));
  const store = new RoomStore(dir);
  const created = store.create("Rafael", "sam");
  const joined = store.join(created.state.id, created.invite, "Meg");
  let dialled = false;
  const room = new RoomRuntime(
    store,
    created.state.id,
    {
      key: "",
      textModel: "test",
      realtimeModel: "test",
      imageModel: "test",
      dataDir: dir,
    },
    () => {
      dialled = true;
      throw new Error("No Realtime connection belongs to party audio.");
    },
  );
  const a = joined.state.players[0],
    b = joined.state.players[1];
  const oneEvents: any[] = [],
    twoEvents: any[] = [];
  const fakeSocket = (events: any[]) =>
    ({
      readyState: WebSocket.OPEN,
      bufferedAmount: 0,
      send: (raw: string) => events.push(JSON.parse(raw)),
      close: () => {},
    }) as unknown as WebSocket;
  const one = fakeSocket(oneEvents),
    two = fakeSocket(twoEvents);
  try {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    room.connect(one, a);
    room.connect(two, b);
    room.beginPartyFloor(a);
    room.partyAudio(b.id, Buffer.alloc(4800).toString("base64"));
    room.partyAudio(a.id, "invalid!");
    room.partyAudio(a.id, Buffer.alloc(1).toString("base64"));
    room.partyAudio(a.id, Buffer.alloc(12002).toString("base64"));
    assert.ok(!twoEvents.some((e) => e.type === "party_audio"));
    room.partyAudio(a.id, Buffer.alloc(4800).toString("base64"));
    assert.equal(twoEvents.filter((e) => e.type === "party_audio").length, 1);
    t.mock.timers.tick(60000);
    assert.equal(room.live.partySpeaker, null);
    assert.ok(oneEvents.some((e) => e.type === "party_floor_released"));
    room.beginPartyFloor(b);
    room.disconnect(two);
    assert.equal(room.live.partySpeaker, null);
    room.beginPartyFloor(a);
    room.revokeSeat(a.id);
    assert.equal(room.live.partySpeaker, null);
    assert.ok(oneEvents.some((e) => e.type === "seat_revoked"));
    assert.equal(dialled, false);
    assert.equal(room.realtime, null);
    const journalLength = room.state.journal.length;
    room.state.partyChat = Array.from({ length: 200 }, (_, i) => ({
      id: `${i}`,
      playerId: a.id,
      text: "old",
      at: new Date().toISOString(),
    }));
    room.partyChat(a, { text: "  Partner-only clue  " });
    assert.equal(room.state.partyChat.length, 200);
    assert.equal(room.state.partyChat.at(-1)!.text, "Partner-only clue");
    assert.equal(
      store.load(created.state.id).partyChat!.at(-1)!.text,
      "Partner-only clue",
    );
    assert.equal(room.state.journal.length, journalLength);
    assert.throws(() => room.partyChat(a, { text: "x".repeat(1201) }));
    for (let i = 0; i < 19; i++) room.partyChat(a, { text: "message" });
    assert.throws(() => room.partyChat(a, { text: "excess" }), /slow down/);
    room.state.phase = "playing";
    room.state.characters.forEach((c) => (c.hp = 0));
    room.live.dmStatus = "speaking";
    assert.throws(() => room.rest(), /storyteller/);
    room.live.dmStatus = "offline";
    room.rest();
    assert.deepEqual(
      room.state.characters.map((c) => c.hp),
      [3, 3, 3],
    );
  } finally {
    room.close();
    store.close();
    t.mock.timers.reset();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("structured text rescue commits the same authoritative ending and public epilogue", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "whispering-text-ending-"));
  const store = new RoomStore(dir);
  const r = store.create("Rafael", "sam");
  store.join(r.state.id, r.invite, "Meg");
  const room = new RoomRuntime(store, r.state.id, {
    key: "test-key",
    textModel: "test",
    realtimeModel: "test",
    imageModel: "test",
    dataDir: dir,
  });
  const inputBodies: any[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string, init: RequestInit) => {
      inputBodies.push(JSON.parse(init.body as string));
      return Response.json({
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  narration:
                    "You board the ferry together, leaving the keeper without a promise to stay.",
                  check: null,
                  consequences: null,
                  scene: {
                    title: "A free departure",
                    location: "Ferry Quay",
                    locationId: "ferry_quay",
                    description: "The family boards the rescue ferry together.",
                    edit: null,
                  },
                  rescue: { choice: "leave" },
                  background: [],
                }),
              },
            ],
          },
        ],
      });
    },
  );
  try {
    room.state.phase = "playing";
    room.state.chapter = 4;
    room.state.puzzles![4].solved = true;
    room.state.preferences.illustrations = false;
    room.partyChat(room.state.players[0], {
      text: "PRIVATE COMPANION DISCUSSION",
    });
    await room.action(
      room.state.players[0],
      "We choose to leave and board the ferry.",
    );
    assert.equal(room.state.phase, "complete");
    assert.deepEqual(store.load(r.state.id).ending, {
      choice: "leave",
      rescued: true,
    });
    assert.ok(
      room.state.journal.some(
        (e) => e.kind === "system" && e.text.includes("without reconciliation"),
      ),
    );
    assert.ok(
      room.state.journal.some(
        (e) => e.kind === "dm" && e.text.includes("board the ferry"),
      ),
    );
    assert.equal(inputBodies.length, 1);
    assert.ok(
      !JSON.stringify(inputBodies).includes("PRIVATE COMPANION DISCUSSION"),
    );
  } finally {
    room.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("reenabling voice cannot truncate an item from the previous provider session", async () => {
  const dir = mkdtempSync(join(tmpdir(), "whispering-rt-reopen-"));
  const store = new RoomStore(dir);
  const provider = new WebSocketServer({ port: 0 });
  await once(provider, "listening");
  const created = store.create("Sam", "sam");
  const incoming: { connection: number; event: any }[] = [];
  let connection = 0;
  let current: WebSocket;
  provider.on("connection", (ws) => {
    current = ws;
    const id = ++connection;
    ws.on("message", (raw) => {
      const event = JSON.parse(raw.toString());
      incoming.push({ connection: id, event });
      if (event.type === "session.update")
        ws.send(JSON.stringify({ type: "session.updated" }));
    });
  });
  const room = new RoomRuntime(
    store,
    created.state.id,
    {
      key: "test-key",
      textModel: "test-text",
      realtimeModel: "test-realtime",
      imageModel: "test-image",
      dataDir: dir,
    },
    () =>
      new WebSocket(
        `ws://127.0.0.1:${(provider.address() as { port: number }).port}`,
      ),
  );
  room.state.phase = "playing";
  const player = room.state.players[0];
  try {
    await room.startVoice(player);
    current!.send(
      JSON.stringify({
        type: "response.output_audio.delta",
        item_id: "old-session-item",
        delta: Buffer.alloc(4800).toString("base64"),
      }),
    );
    await until(() => room.live.dmStatus === "speaking");
    room.stopVoice();
    await room.startVoice(player);
    room.beginFloor(player);
    await until(() =>
      incoming.some(
        (e) =>
          e.connection === 2 && e.event.type === "input_audio_buffer.clear",
      ),
    );
    assert.ok(
      !incoming.some(
        (e) =>
          e.connection === 2 && e.event.type === "conversation.item.truncate",
      ),
    );
    assert.equal(room.live.speaker, player.id);
    room.releaseFloor(player.id, false);
    assert.equal(room.live.dmStatus, "ready");
  } finally {
    room.close();
    for (const ws of provider.clients) ws.close();
    await new Promise<void>((resolve) => provider.close(() => resolve()));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
