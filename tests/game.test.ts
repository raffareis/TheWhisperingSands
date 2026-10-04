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
  applyConsequences(s, { ...blank, nextChapter: 5 });
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
