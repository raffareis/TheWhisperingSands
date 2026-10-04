import { test } from "node:test";
import WebSocket from "ws";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RoomStore } from "../server/store.js";
import { TeachingDesk } from "../server/teaching.js";
import { RoomRuntime } from "../server/runtime.js";
import { projectRoom, submitPuzzle, puzzles } from "../server/puzzles.js";
const details = {
  title: "Ana & Bruno · Island mystery",
  cohort: "Tuesday B1",
  notes: "PRIVATE: revisit past perfect next week",
  nextLesson: "2026-10-13",
  sam: "Ana",
  liz: "Bruno",
};
const code = (path: string) =>
  new URLSearchParams(path.split("#")[1]).get("seat")!;
test("teaching links survive weeks and restart, retain progress, and remain independent of one-use recovery", () => {
  const dir = mkdtempSync(join(tmpdir(), "whispering-teach-"));
  let store = new RoomStore(dir);
  try {
    let desk = new TeachingDesk(store, "private-teacher-key");
    const created = desk.create(details);
    assert.equal(created.students.length, 2);
    const samCode = code(created.students[0].entryPath),
      lizCode = code(created.students[1].entryPath);
    const one = desk.enter(created.id, samCode),
      two = desk.enter(created.id, lizCode);
    const state = store.load(created.id);
    state.phase = "playing";
    const sam = state.players[0],
      liz = state.players[1];
    submitPuzzle(state, sam, puzzles[0].id, "3142");
    submitPuzzle(state, liz, puzzles[0].id, "flint canvas rope compass");
    state.characters[0].hp = 8;
    store.save(state);
    desk.update(created.id, { status: "paused", nextLesson: "2026-10-20" });
    const recovery = store.recovery(one.credentials.token, created.id, "liz");
    const transferred = store.recover(created.id, recovery.recoveryCode);
    assert.throws(() => store.authenticate(two.credentials.token));
    store.close();
    store = new RoomStore(dir);
    desk = new TeachingDesk(store, "private-teacher-key");
    assert.equal(
      desk.get(created.id).students[0].entryPath,
      created.students[0].entryPath,
    );
    assert.equal(
      desk.get(created.id).students[1].entryPath,
      created.students[1].entryPath,
    );
    const returned = desk.enter(created.id, lizCode);
    assert.equal(returned.credentials.playerId, two.credentials.playerId);
    assert.throws(() => store.authenticate(transferred.credentials.token));
    assert.equal(returned.state.lessonStatus, "paused");
    assert.equal(returned.state.puzzles![0].solved, true);
    assert.equal(returned.state.characters[0].hp, 8);
    assert.ok(
      returned.state.characters[1].inventory.some(
        (i) => i.id === "rescue-rope",
      ),
    );
    assert.equal(desk.get(created.id).solved, 1);
    assert.equal(desk.get(created.id).notes, details.notes);
    assert.ok(
      !JSON.stringify(projectRoom(returned.state, liz)).includes("PRIVATE:"),
    );
    const raw =
      JSON.stringify(store.db.prepare("SELECT * FROM classroom_tables").all()) +
      JSON.stringify(store.db.prepare("SELECT * FROM classroom_entries").all());
    assert.ok(!raw.includes(samCode) && !raw.includes(lizCode));
    desk.update(created.id, { status: "active" });
    assert.equal(store.load(created.id).lessonStatus, "active");
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("teacher rotation revokes both prior entry link and seat while other tables and seats remain valid", () => {
  const dir = mkdtempSync(join(tmpdir(), "whispering-teach-rotate-")),
    store = new RoomStore(dir);
  try {
    const desk = new TeachingDesk(store, "private-teacher-key"),
      first = desk.create(details),
      other = desk.create({ ...details, title: "Other pair" });
    const samCode = code(first.students[0].entryPath),
      lizCode = code(first.students[1].entryPath);
    const sam = desk.enter(first.id, samCode),
      liz = desk.enter(first.id, lizCode);
    assert.throws(() => desk.enter(other.id, samCode), /not valid/);
    const replacement = desk.rotate(first.id, "sam");
    assert.throws(() => desk.enter(first.id, samCode), /not valid/);
    assert.throws(() => store.authenticate(sam.credentials.token));
    assert.equal(
      store.authenticate(liz.credentials.token).player.characterId,
      "liz",
    );
    const returned = desk.enter(
      first.id,
      code(replacement.table.students[0].entryPath),
    );
    assert.equal(returned.credentials.playerId, sam.credentials.playerId);
    assert.equal(returned.state.players.length, 2);
    assert.equal(desk.get(other.id).status, "active");
    assert.throws(() => desk.update(first.id, { nextLesson: "2026-02-30" }));
    assert.throws(() => desk.create({ ...details, sam: "", liz: "" }));
    desk.update(first.id, { status: "archived" });
    assert.equal(
      desk.enter(first.id, code(replacement.table.students[0].entryPath)).state
        .lessonStatus,
      "archived",
    );
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("an existing adventure can be managed without resetting its students, clues or inventory", () => {
  const dir = mkdtempSync(join(tmpdir(), "whispering-teach-existing-")),
    store = new RoomStore(dir);
  try {
    const old = store.create("Rafael", "sam"),
      joined = store.join(old.state.id, old.invite, "Meg");
    joined.state.characters[0].hp = 6;
    store.save(joined.state);
    const desk = new TeachingDesk(store, "private-teacher-key");
    const imported = desk.create({
      ...details,
      sam: "",
      liz: "",
      existingRoomId: old.state.id,
    });
    assert.deepEqual(
      imported.students.map((s) => s.name),
      ["Rafael", "Meg"],
    );
    assert.equal(
      store.authenticate(old.credentials.token).state.characters[0].hp,
      6,
    );
    assert.throws(
      () => desk.create({ ...details, existingRoomId: old.state.id }),
      /already on/,
    );
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("paused lessons close microphones, reject AI workers, and resume their saved game", async () => {
  const dir = mkdtempSync(join(tmpdir(), "whispering-teach-pause-")),
    store = new RoomStore(dir);
  const desk = new TeachingDesk(store, "private-teacher-key"),
    table = desk.create(details);
  let paidDials = 0;
  const room = new RoomRuntime(
    store,
    table.id,
    {
      key: "test",
      textModel: "test",
      realtimeModel: "test",
      imageModel: "test",
      dataDir: dir,
    },
    () => {
      paidDials++;
      throw new Error("A paused lesson must not dial AI");
    },
  );
  try {
    room.state.phase = "playing";
    room.publish();
    const events: unknown[] = [];
    room.connect(
      {
        readyState: WebSocket.OPEN,
        bufferedAmount: 0,
        send: (raw: string) => events.push(JSON.parse(raw)),
        close: () => {},
      } as unknown as WebSocket,
      room.state.players[0],
    );
    room.beginPartyFloor(room.state.players[0]);
    desk.update(table.id, { status: "paused" });
    room.syncLessonStatus("paused");
    assert.equal(room.live.partySpeaker, null);
    assert.equal(room.live.dmStatus, "offline");
    assert.throws(() => room.assertLessonActive(), /paused/);
    assert.throws(() => room.workers.dispatch("recap", "current"), /paused/);
    await assert.rejects(room.startVoice(room.state.players[0]), /paused/);
    assert.equal(paidDials, 0);
    room.close();
    const restored = new RoomRuntime(store, table.id, room.settings);
    assert.equal(restored.state.lessonStatus, "paused");
    desk.update(table.id, { status: "active" });
    restored.syncLessonStatus("active");
    assert.doesNotThrow(() => restored.assertLessonActive());
    assert.equal(restored.state.phase, "playing");
    restored.close();
  } finally {
    room.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
