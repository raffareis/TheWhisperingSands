import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RoomStore } from "../server/store.js";
import { applyConsequences, finishRescue, setScene } from "../server/game.js";
import { submitPuzzle, projectRoom, ensurePuzzles } from "../server/puzzles.js";
import { turnSchema } from "../server/dm.js";
import { z } from "zod";

// Independently worked entries, rather than reading the validator's answer list.
const route = [
  { id: "salvage-lock", sam: "3 1 4 2", liz: "flint, canvas, rope, compass" },
  { id: "tide-route", sam: "under old stone arch", liz: "B1, A1, A2, A3" },
  { id: "keeper-timeline", sam: "C D B A", liz: "bell, ferry, seal, light" },
  {
    id: "voice-machine",
    sam: "3 1 2",
    liz: "turn the lamp down; give the voices back; put the brazier out",
  },
  {
    id: "final-promise",
    sam: "TERN; if we call by choice",
    liz: "TERN; we'll find home",
  },
];
test("two saved seats complete every gate and resume mid-campaign before each free ending", () => {
  const directory = mkdtempSync(join(tmpdir(), "whispering-playthrough-"));
  const store = new RoomStore(directory);
  try {
    const created = store.create("Student A", "sam");
    let credentials = store.join(
      created.state.id,
      created.invite,
      "Student B",
    ).credentials;
    let state = store.load(created.state.id);
    state.phase = "playing";
    const players = state.players;
    const hp = state.characters.map((c) => c.hp);
    for (const [chapter, entry] of route.entries()) {
      assert.equal(state.chapter, chapter);
      assert.equal(projectRoom(state, players[0]).puzzleView!.id, entry.id);
      assert.notDeepEqual(
        projectRoom(state, players[0]).puzzleView!.evidence,
        projectRoom(state, players[1]).puzzleView!.evidence,
      );
      const consequences = {
        reason: "The family follows the unlocked evidence.",
        health: [],
        items: [],
        clues: [],
        nextChapter: chapter + 1,
      };
      assert.throws(
        () => applyConsequences(state, consequences),
        /Both players/,
      );
      assert.equal(
        submitPuzzle(state, players[1], entry.id, "unworked guess").accepted,
        false,
      );
      assert.deepEqual(
        state.characters.map((c) => c.hp),
        hp,
      );
      assert.equal(
        submitPuzzle(state, players[0], entry.id, entry.sam).solved,
        false,
      );
      assert.throws(
        () => applyConsequences(state, consequences),
        /Both players/,
      );
      assert.equal(
        submitPuzzle(state, players[1], entry.id, entry.liz).solved,
        true,
      );
      assert.equal(state.clues.length, chapter + 1);
      if (chapter < 4) applyConsequences(state, consequences);
      else
        assert.throws(
          () => applyConsequences(state, consequences),
          /finish_rescue/,
        );
      store.save(state);
      if (chapter === 2) {
        const code = store.recovery(
          created.credentials.token,
          state.id,
          "liz",
        ).recoveryCode;
        credentials = store.recover(state.id, code).credentials;
        assert.equal(credentials.playerId, players[1].id);
        assert.equal(
          store.authenticate(credentials.token).player.characterId,
          "liz",
        );
      }
      state = store.load(state.id);
      ensurePuzzles(state);
    }
    assert.equal(state.phase, "playing");
    setScene(state, {
      title: "The rescue ferry",
      location: "The rescue pier",
      locationId: "ferry_quay",
      description: "The family chooses to board together.",
      visualPrompt: "The family boards a ferry.",
    });
    for (const choice of ["confront", "forgive", "leave"] as const) {
      const ending = structuredClone(state);
      finishRescue(ending, { choice });
      store.save(ending);
      assert.equal(store.load(ending.id).phase, "complete");
      assert.equal(store.load(ending.id).ending!.choice, choice);
      assert.equal(store.load(ending.id).chapter, 5);
      assert.match(ending.journal.at(-1)!.text, /boards the rescue ferry/);
    }
  } finally {
    store.db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("text DM structured output requires every nested object field", () => {
  function inspect(schema: any) {
    if (schema.type === "object") {
      assert.equal(schema.additionalProperties, false);
      assert.deepEqual(
        [...schema.required].sort(),
        Object.keys(schema.properties).sort(),
      );
    }
    for (const value of Object.values(schema)) {
      if (Array.isArray(value))
        value.forEach(
          (item) => typeof item === "object" && item && inspect(item),
        );
      else if (typeof value === "object" && value) inspect(value);
    }
  }
  inspect(z.toJSONSchema(turnSchema));
});
