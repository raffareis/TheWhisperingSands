import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RoomStore } from "../server/store.js";
test("two distinct seats, private invites, hashed tokens and persistence", () => {
  const path = mkdtempSync(join(tmpdir(), "whispering-store-"));
  let store = new RoomStore(path);
  try {
    const r = store.create("Rafael", "sam");
    assert.equal(r.state.players[0].characterId, "sam");
    assert.throws(() => store.join(r.state.id, "invalid-invite", "Meg"));
    const j = store.join(r.state.id, r.invite, "Meg");
    assert.equal(j.state.players[1].characterId, "liz");
    assert.throws(
      () => store.join(r.state.id, r.invite, "Third"),
      /two players/,
    );
    assert.equal(store.authenticate(r.credentials.token).player.name, "Rafael");
    assert.equal(store.authenticate(j.credentials.token).player.name, "Meg");
    const different = store.create("Other", "liz");
    assert.throws(() =>
      store.authenticate(r.credentials.token, different.state.id),
    );
    const rows = JSON.stringify(store.db.prepare("SELECT * FROM seats").all());
    assert.ok(!rows.includes(r.credentials.token));
    store.close();
    store = new RoomStore(path);
    assert.equal(store.load(r.state.id).players.length, 2);
    assert.equal(store.authenticate(j.credentials.token).player.name, "Meg");
  } finally {
    store.close();
    rmSync(path, { recursive: true, force: true });
  }
});
test("rotating invitations invalidates the previous link", () => {
  const path = mkdtempSync(join(tmpdir(), "whispering-invite-"));
  const store = new RoomStore(path);
  try {
    const r = store.create("Rafael", "liz");
    const next = store.invite(r.state.id);
    assert.throws(() => store.join(r.state.id, r.invite, "Meg"));
    assert.equal(
      store.join(r.state.id, next, "Meg").state.players[1].characterId,
      "sam",
    );
  } finally {
    store.close();
    rmSync(path, { recursive: true, force: true });
  }
});

test("interrupted illustration is recovered visibly without repeating a paid generation", async () => {
  const { RoomRuntime } = await import("../server/runtime.js");
  const path = mkdtempSync(join(tmpdir(), "whispering-image-"));
  const store = new RoomStore(path);
  try {
    const r = store.create("Rafael", "sam");
    r.state.scene.status = "generating";
    store.save(r.state);
    const room = new RoomRuntime(store, r.state.id, {
      key: "",
      textModel: "test",
      realtimeModel: "test",
      imageModel: "test",
      dataDir: path,
    });
    assert.equal(room.state.scene.status, "error");
    assert.match(room.state.scene.error ?? "", /interrupted/);
    assert.equal(store.load(r.state.id).scene.status, "error");
    room.close();
  } finally {
    store.close();
    rmSync(path, { recursive: true, force: true });
  }
});

test("recovery survives restart, rotates the same seat once and never admits a third player", () => {
  const path = mkdtempSync(join(tmpdir(), "whispering-recover-"));
  let store = new RoomStore(path);
  try {
    const r = store.create("Rafael", "sam");
    assert.throws(
      () => store.recovery(r.credentials.token, r.state.id, "liz"),
      /not been occupied/,
    );
    const j = store.join(r.state.id, r.invite, "Meg");
    j.state.characters[1].hp = 4;
    j.state.puzzles![0].accepted = ["liz"];
    store.save(j.state);
    const other = store.create("Other", "sam");
    assert.throws(() =>
      store.recovery(other.credentials.token, r.state.id, "liz"),
    );
    const now = Date.now();
    const { recoveryCode } = store.recovery(
      r.credentials.token,
      r.state.id,
      "liz",
      now,
    );
    assert.ok(recoveryCode.length >= 43);
    assert.ok(
      !JSON.stringify(
        store.db.prepare("SELECT * FROM recovery_codes").all(),
      ).includes(recoveryCode),
    );
    assert.ok(!JSON.stringify(store.load(r.state.id)).includes(recoveryCode));
    assert.throws(
      () => store.recover(other.state.id, recoveryCode, now),
      /invalid/,
    );
    store.close();
    store = new RoomStore(path);
    const recovered = store.recover(r.state.id, recoveryCode, now + 1);
    assert.equal(recovered.credentials.playerId, j.credentials.playerId);
    assert.equal(recovered.state.players.length, 2);
    assert.equal(
      store.authenticate(recovered.credentials.token).player.name,
      "Meg",
    );
    assert.equal(recovered.state.characters[1].hp, 4);
    assert.deepEqual(recovered.state.puzzles![0].accepted, ["liz"]);
    assert.throws(
      () => store.authenticate(j.credentials.token),
      /saved seat token/,
    );
    assert.throws(
      () => store.recover(r.state.id, recoveryCode, now + 2),
      /already used/,
    );
    assert.throws(
      () => store.join(r.state.id, r.invite, "Third"),
      /two players/,
    );
    assert.equal(store.authenticate(r.credentials.token).player.name, "Rafael");
    const expired = store.recovery(
      r.credentials.token,
      r.state.id,
      "sam",
      now,
    ).recoveryCode;
    assert.throws(
      () => store.recover(r.state.id, expired, now + 15 * 60 * 1000),
      /expired/,
    );
    assert.equal(store.authenticate(r.credentials.token).player.name, "Rafael");
    const superseded = store.recovery(
      r.credentials.token,
      r.state.id,
      "sam",
      now,
    ).recoveryCode;
    const fresh = store.recovery(
      r.credentials.token,
      r.state.id,
      "sam",
      now,
    ).recoveryCode;
    assert.throws(() => store.recover(r.state.id, superseded, now), /invalid/);
    assert.equal(
      store.recover(r.state.id, fresh, now).credentials.playerId,
      r.credentials.playerId,
    );
  } finally {
    store.close();
    rmSync(path, { recursive: true, force: true });
  }
});
