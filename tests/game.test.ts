import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  requestCheck,
  rollCheck,
  rerollCheck,
  applyConsequences,
  setScene,
  acceptRoll,
  rollCompanion,
  finishRescue,
  safeRest,
  cancelAbsentCheck,
  applyNarratedConsequences,
  finishNarratedRescue,
} from "../server/game.js";
function playing() {
  const s = initialState("test");
  s.phase = "playing";
  s.players = [
    { id: "rafa", name: "Rafael", characterId: "sam" },
    { id: "meg", name: "Meg", characterId: "liz" },
  ];
  return s;
}
const check = {
  characterId: "sam",
  stat: "STR",
  target: 7,
  reason: "Move the fallen branch.",
  dangerous: true,
};
const blank = {
  reason: "The party makes a discovery.",
  health: [],
  items: [],
  clues: [],
  nextChapter: null,
};
test("narrated advancement requires a valid scene and commits both atomically", () => {
  const s = playing();
  s.puzzles![0].solved = true;
  const change = {
    ...blank,
    nextChapter: 1,
    health: [{ characterId: "sam", delta: -1 }],
  };
  const before = JSON.stringify(s);
  assert.throws(() => applyNarratedConsequences(s, change), /public scene/);
  assert.equal(JSON.stringify(s), before);
  assert.throws(
    () =>
      applyNarratedConsequences(s, {
        ...change,
        scene: {
          title: "Locked chamber",
          location: "Voice Machine",
          locationId: "voice_machine",
          description: "The family enters the future machine chamber.",
        },
      }),
    /not available/,
  );
  assert.equal(JSON.stringify(s), before);
  applyNarratedConsequences(s, {
    ...change,
    scene: {
      title: "Safe at camp",
      location: "Palm Camp",
      locationId: "palm_camp",
      description: "Sam, Liz and Emily enter the open camp porch together.",
    },
  });
  assert.equal(s.chapter, 1);
  assert.equal(s.scene.locationId, "palm_camp");
  assert.equal(s.scene.chapter, 1);
  assert.equal(s.characters[0].hp, 9);
});
test("a narrated rescue records the actual ferry scene alongside its freely chosen ending", () => {
  const s = playing();
  s.chapter = 4;
  s.puzzles![4].solved = true;
  assert.throws(() => finishNarratedRescue(s, { choice: "leave" }));
  assert.equal(s.phase, "playing");
  finishNarratedRescue(s, {
    choice: "leave",
    scene: {
      title: "A new dawn",
      location: "Ferry Quay",
      locationId: "ferry_quay",
      description: "Sam, Liz and Emily board the rescue ferry together.",
    },
  });
  assert.equal(s.phase, "complete");
  assert.equal(s.scene.locationId, "ferry_quay");
  assert.deepEqual(s.ending, { choice: "leave", rescued: true });
});
test("the original 10-point stats and 10 HP are preserved", () => {
  const s = initialState("test");
  for (const c of s.characters) {
    assert.equal(
      Object.values(c.stats).reduce((a, b) => a + b, 0),
      10,
    );
    assert.equal(c.hp, 10);
  }
  assert.equal(s.characters[0].stats.STR, 5);
  assert.equal(s.characters[1].stats.INT, 5);
  assert.equal(s.characters[2].stats.SUR, 5);
  assert.equal(s.chapter, 0);
  assert.equal(s.clues.length, 0);
});
test("D6 + stat >= target is success; dangerous failure applies exactly 1 HP", () => {
  const s = playing();
  const c = requestCheck(s, check);
  const result = rollCheck(s, "rafa", c.id, () => 1);
  assert.equal(result.total, 6);
  assert.equal(result.success, false);
  assert.equal(s.characters[0].hp, 9);
  assert.equal(s.pendingCheck, null);
  assert.throws(() => rollCheck(s, "rafa", c.id));
  acceptRoll(s, "rafa", c.id);
  const next = requestCheck(s, check);
  assert.equal(rollCheck(s, "rafa", next.id, () => 2).success, true);
  assert.equal(s.characters[0].hp, 9);
});
test("another player cannot roll Sam’s check", () => {
  const s = playing();
  const c = requestCheck(s, check);
  assert.throws(() => rollCheck(s, "meg", c.id), /Only the character/);
  assert.equal(s.pendingCheck?.id, c.id);
  assert.equal(s.characters[0].hp, 10);
});
test("a harmless failed check costs no HP", () => {
  const s = playing();
  const c = requestCheck(s, { ...check, dangerous: false });
  rollCheck(s, "rafa", c.id, () => 1);
  assert.equal(s.characters[0].hp, 10);
});
test("reroll costs 1 HP once, never repeats the original harm", () => {
  const s = playing();
  const c = requestCheck(s, check);
  rollCheck(s, "rafa", c.id, () => 1);
  assert.equal(s.characters[0].hp, 9);
  const result = rerollCheck(s, "rafa", c.id, () => 1);
  assert.equal(result.rerolled, true);
  assert.equal(s.characters[0].hp, 8);
  assert.throws(() => rerollCheck(s, "rafa", c.id));
});
test("incapacitated characters cannot attempt checks; rerolls need spare HP", () => {
  const s = playing();
  s.characters[0].hp = 0;
  assert.throws(() => requestCheck(s, check), /incapacitated/);
  s.characters[0].hp = 2;
  const c = requestCheck(s, check);
  rollCheck(s, "rafa", c.id, () => 1);
  assert.equal(s.characters[0].hp, 1);
  assert.throws(() => rerollCheck(s, "rafa", c.id));
  assert.equal(s.characters[0].hp, 1);
});
test("items, clues and chapters change only through validated consequences", () => {
  const s = playing();
  s.puzzles![0].solved = true;
  applyConsequences(s, {
    ...blank,
    items: [
      {
        characterId: "liz",
        id: "fresh-water",
        name: "Fresh water",
        description: "Collected from the stream.",
        quantityChange: 2,
      },
    ],
    clues: [
      {
        id: "carved-symbol",
        title: "A strange carving",
        text: "A repeating mark in the bark.",
      },
    ],
    nextChapter: 1,
  });
  assert.equal(s.characters[1].inventory.at(-1)?.quantity, 2);
  assert.equal(s.clues.length, 1);
  assert.equal(s.chapter, 1);
  applyConsequences(s, { ...blank, clues: s.clues });
  assert.equal(s.clues.length, 1);
  assert.throws(
    () => applyConsequences(s, { ...blank, nextChapter: 4 }),
    /one chapter/,
  );
});
test("invalid consequences are rejected without partial health updates", () => {
  const s = playing();
  assert.throws(() =>
    applyConsequences(s, {
      ...blank,
      health: [{ characterId: "sam", delta: -1 }],
      items: [
        {
          characterId: "liz",
          id: "unknown",
          name: "Unknown",
          description: "",
          quantityChange: -1,
        },
      ],
    }),
  );
  assert.equal(s.characters[0].hp, 10);
});
test("chapter 5 concludes the adventure and rejects new checks", () => {
  const s = playing();
  s.chapter = 4;
  s.puzzles![4].solved = true;
  assert.throws(
    () => applyConsequences(s, { ...blank, nextChapter: 5 }),
    /finish_rescue/,
  );
  finishRescue(s, { choice: "confront" });
  assert.equal(s.phase, "complete");
  assert.throws(() => requestCheck(s, check));
});
test("scene history preserves the previous view while a new image is rendering", () => {
  const s = playing();
  const old = s.scene.id;
  setScene(s, {
    title: "A freshwater stream",
    location: "Jungle",
    description: "Water flows between moss-covered rocks.",
    visualPrompt: "A freshwater stream in a tropical jungle.",
  });
  assert.equal(s.scene.status, "generating");
  assert.equal(s.sceneHistory[0].id, old);
  assert.equal(s.scene.imageUrl, s.sceneHistory[0].imageUrl);
});

test("a failed check waits for its player’s decision before new actions", () => {
  const s = playing();
  const c = requestCheck(s, check);
  rollCheck(s, "rafa", c.id, () => 1);
  assert.equal(s.rollDecision, c.id);
  assert.throws(() => requestCheck(s, check));
  assert.throws(() => acceptRoll(s, "meg", c.id));
  assert.throws(() => applyConsequences(s, blank));
  acceptRoll(s, "rafa", c.id);
  assert.equal(s.rollDecision, null);
  assert.throws(() => rerollCheck(s, "rafa", c.id));
});
test("duplicate item deltas are rejected before changing the party", () => {
  const s = playing();
  assert.throws(
    () =>
      applyConsequences(s, {
        ...blank,
        health: [{ characterId: "sam", delta: -1 }],
        items: [
          {
            characterId: "sam",
            id: "pocket-knife",
            name: "Knife",
            description: "",
            quantityChange: -1,
          },
          {
            characterId: "sam",
            id: "pocket-knife",
            name: "Knife",
            description: "",
            quantityChange: -1,
          },
        ],
      }),
    /Duplicate item/,
  );
  assert.equal(s.characters[0].hp, 10);
  assert.equal(s.characters[0].inventory[0].quantity, 1);
});
test("Emily uses the same authoritative dice rules as the players", () => {
  const s = playing();
  const c = requestCheck(s, { ...check, characterId: "emily" });
  const roll = rollCompanion(s, c.id, () => 1);
  assert.equal(roll.total, 3);
  assert.equal(s.characters[2].hp, 9);
  assert.equal(s.rollDecision, null);
  assert.throws(() => rollCompanion(s, c.id));
});

test("physical checks reject puzzle purpose and unattainable targets without mutation", () => {
  const s = playing();
  assert.throws(
    () => requestCheck(s, { ...check, purpose: "puzzle" }),
    /puzzles/,
  );
  assert.throws(() => requestCheck(s, { ...check, target: 12 }), /impossible/);
  assert.equal(s.pendingCheck, null);
  const result = requestCheck(s, { ...check, target: 11 });
  assert.equal(result.target, 11);
});
test("zero HP preserves classroom progress and permits a manual safe rest", () => {
  const s = playing();
  s.characters.forEach((c) => (c.hp = 0));
  s.characters[0].hp = 1;
  const c = requestCheck(s, check);
  rollCheck(s, "rafa", c.id, () => 1);
  assert.equal(s.phase, "playing");
  const before = {
    chapter: s.chapter,
    items: s.characters.map((c) => c.inventory),
    clues: s.clues,
    puzzles: s.puzzles,
  };
  safeRest(s);
  assert.deepEqual(
    s.characters.map((c) => c.hp),
    [3, 3, 3],
  );
  assert.deepEqual(
    {
      chapter: s.chapter,
      items: s.characters.map((c) => c.inventory),
      clues: s.clues,
      puzzles: s.puzzles,
    },
    before,
  );
  assert.throws(() => safeRest(s), /whole party/);
  const again = playing();
  again.characters.forEach((c) => (c.hp = 1));
  applyConsequences(again, {
    ...blank,
    health: again.characters.map((c) => ({ characterId: c.id, delta: -1 })),
  });
  assert.equal(again.phase, "playing");
});
test("only the online companion can cancel an absent owner's check without consequences", () => {
  const s = playing();
  const c = requestCheck(s, check);
  assert.throws(() => cancelAbsentCheck(s, "rafa", c.id, []));
  assert.throws(() => cancelAbsentCheck(s, "meg", c.id, ["rafa"]));
  assert.throws(() => cancelAbsentCheck(s, "meg", "old-id", []));
  cancelAbsentCheck(s, "meg", c.id, ["meg"]);
  assert.equal(s.pendingCheck, null);
  assert.equal(s.lastRoll, null);
  assert.deepEqual(
    s.characters.map((c) => c.hp),
    [10, 10, 10],
  );
  assert.equal(s.clues.length, 0);
  assert.match(s.journal.at(-1)!.text, /No roll or consequence/);
});
test("reserved discoveries cannot be forged, removed or rewarded by update_party", () => {
  const s = playing();
  for (const id of ["tide-chart", "word-we", "rescue-rope"]) {
    assert.throws(
      () =>
        applyConsequences(s, {
          ...blank,
          health: [{ characterId: "sam", delta: -1 }],
          items: [
            {
              characterId: "liz",
              id,
              name: "Forged",
              description: "",
              quantityChange: 1,
            },
          ],
        }),
      /puzzle engine/,
    );
    s.characters[1].inventory.push({
      id,
      name: "Real",
      description: "",
      quantity: 1,
    });
    assert.throws(
      () =>
        applyConsequences(s, {
          ...blank,
          items: [
            {
              characterId: "liz",
              id,
              name: "Real",
              description: "",
              quantityChange: -1,
            },
          ],
        }),
      /puzzle engine/,
    );
  }
  assert.throws(
    () =>
      applyConsequences(s, {
        ...blank,
        clues: [
          { id: s.puzzles![0].id, title: "Forged", text: "No evidence." },
        ],
      }),
    /puzzle engine/,
  );
  assert.equal(s.characters[0].hp, 10);
  assert.equal(s.clues.length, 0);
});
test("all ending choices rescue the family only after the final solved lock", () => {
  for (const choice of ["confront", "forgive", "leave"] as const) {
    const s = playing();
    assert.throws(() => finishRescue(s, { choice }));
    s.chapter = 4;
    assert.throws(() => finishRescue(s, { choice }));
    s.puzzles![4].solved = true;
    finishRescue(s, { choice });
    assert.deepEqual(s.ending, { choice, rescued: true });
    assert.equal(s.chapter, 5);
    assert.equal(s.phase, "complete");
    assert.match(s.journal.at(-1)!.text, /boards the rescue ferry/);
    assert.throws(() => finishRescue(s, { choice }));
  }
});
test("canonical scene gates block future travel but preserve accessible shelter and revisits", () => {
  const s = playing();
  const scene = {
    title: "A place",
    location: "Palm Camp",
    description: "The party rests here.",
    visualPrompt: "A sheltered camp under tall palms.",
  };
  setScene(s, { ...scene, locationId: "palm_camp" });
  assert.equal(s.scene.locationId, "palm_camp");
  assert.equal(s.scene.chapter, 0);
  const previous = s.scene.id;
  for (const location of ["Beacon Gallery", "Ferry Quay", "Old Stone Arch"])
    assert.throws(() => setScene(s, { ...scene, location }), /not available/);
  assert.throws(
    () => setScene(s, { ...scene, locationId: "beacon_gallery" }),
    /not available/,
  );
  assert.throws(
    () => setScene(s, { ...scene, locationId: "unknown" }),
    /Unknown/,
  );
  assert.equal(s.scene.id, previous);
  s.chapter = 4;
  assert.throws(
    () => setScene(s, { ...scene, locationId: "ferry_quay" }),
    /not available/,
  );
  s.puzzles![4].solved = true;
  setScene(s, { ...scene, locationId: "ferry_quay" });
  setScene(s, { ...scene, locationId: "wreck_beach" });
  assert.equal(s.chapter, 4);
});
