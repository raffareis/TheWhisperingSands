import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { setTimeout as pause } from "node:timers/promises";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket, { WebSocketServer } from "ws";
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
        if (e.type === "session.update")
          ws.send(JSON.stringify({ type: "session.updated" }));
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
        "Water-damaged equipment glossary",
      );
      assert.equal(
        two.events.find((e) => e.type === "state").state.puzzleView
          .evidenceTitle,
        "Quartermaster's shipping ledger",
      );
      assert.ok(!JSON.stringify(one.events).includes("Label 2 · 480 g"));
      assert.ok(
        !JSON.stringify(two.events).includes(
          "FLINT — a stone that produces sparks",
        ),
      );
      await Promise.all([room.startVoice(a), room.startVoice(b)]);
      assert.equal(connections, 1);
      assert.equal(room.live.dmStatus, "ready");
      const config = incoming.find((e) => e.type === "session.update").session;
      assert.equal(config.audio.input.format.rate, 24000);
      assert.equal(config.audio.input.turn_detection, null);
      assert.equal(config.tools.length, 4);
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
      room.toggleImages(false);
      assert.equal(store.load(r.state.id).preferences.illustrations, false);
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
