import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  applyConsequences,
  requestCheck,
  rollCheck,
} from "../server/game.js";
import {
  puzzles,
  puzzleView,
  projectRoom,
  submitPuzzle,
  revealHint,
  dmPuzzleContext,
} from "../server/puzzles.js";
function table() {
  const s = initialState("puzzle-test");
  s.phase = "playing";
  s.players = [
    { id: "a", name: "Student A", characterId: "sam" },
    { id: "b", name: "Student B", characterId: "liz" },
  ];
  return s;
}
const transition = {
  reason: "The next chapter begins.",
  health: [],
  items: [],
  clues: [],
  nextChapter: 1,
};
test("five cooperative locks require each seat's different answer; replay never duplicates rewards", () => {
  const s = table();
  for (let i = 0; i < puzzles.length; i++) {
    s.chapter = i;
    const p = puzzles[i];
    assert.equal(
      submitPuzzle(s, s.players[0], p.id, p.sam.answers[0].toUpperCase())
        .solved,
      false,
    );
    assert.throws(
      () => applyConsequences(s, { ...transition, nextChapter: i + 1 }),
      /Both players/,
    );
    assert.equal(
      submitPuzzle(
        s,
        s.players[1],
        p.id,
        p.liz.answers[0].replaceAll(" ", ", "),
      ).solved,
      true,
    );
    const count = s.characters[1].inventory.length;
    submitPuzzle(s, s.players[1], p.id, p.liz.answers[0]);
    assert.equal(s.characters[1].inventory.length, count);
    applyConsequences(s, { ...transition, nextChapter: i + 1 });
  }
  assert.equal(s.phase, "complete");
  assert.equal(s.clues.length, 5);
  assert.deepEqual(
    s.characters[1].inventory
      .filter((i) => i.id.startsWith("word-"))
      .map((i) => i.id),
    ["word-we", "word-will", "word-find", "word-home"],
  );
});
test("private evidence is projected per seat; DM sees neither solutions nor partner records", () => {
  const s = table(),
    p = puzzles[0];
  const a = projectRoom(s, s.players[0]),
    b = projectRoom(s, s.players[1]);
  assert.ok(a.puzzleView?.evidence.includes(p.sam.lines[0]));
  assert.ok(!JSON.stringify(a).includes(p.liz.lines[0]));
  assert.ok(!JSON.stringify(b).includes(p.sam.lines[0]));
  assert.ok(!JSON.stringify(a).includes('"answers"'));
  assert.ok(!JSON.stringify(dmPuzzleContext(s)).includes(p.sam.answers[0]));
  assert.ok(!JSON.stringify(dmPuzzleContext(s)).includes(p.liz.lines[0]));
});
test("wrong answers, future lock IDs and dice cannot unlock chapters or remove HP", () => {
  const s = table();
  assert.equal(
    submitPuzzle(s, s.players[0], puzzles[0].id, "all of them").accepted,
    false,
  );
  assert.equal(s.characters[0].hp, 10);
  assert.throws(
    () => submitPuzzle(s, s.players[1], puzzles[2].id, "cdba"),
    /no longer active/,
  );
  const check = requestCheck(s, {
    characterId: "sam",
    stat: "INT",
    reason: "Study the chest",
    target: 7,
    dangerous: false,
  });
  rollCheck(s, "a", check.id, () => 6);
  assert.throws(() => applyConsequences(s, transition), /Both players/);
  assert.equal(s.puzzles![0].solved, false);
});
test("hints reveal in bounded tiers; completed discovery is public while new chapter evidence stays private", () => {
  const s = table();
  assert.equal(puzzleView(s, s.players[0])?.hints.length, 0);
  for (let i = 0; i < 5; i++) revealHint(s, puzzles[0].id);
  assert.equal(puzzleView(s, s.players[0])?.hints.length, 3);
  assert.ok(!puzzleView(s, s.players[0])!.hints.join(" ").includes("3142"));
  submitPuzzle(s, s.players[0], puzzles[0].id, puzzles[0].sam.answers[0]);
  submitPuzzle(s, s.players[1], puzzles[0].id, puzzles[0].liz.answers[0]);
  assert.ok(puzzleView(s, s.players[0])?.reward?.includes("WE"));
  applyConsequences(s, transition);
  assert.equal(puzzleView(s, s.players[1])?.id, puzzles[1].id);
});
test("language puzzle solutions follow unique reconstructed evidence chains", () => {
  // Independent reconstruction of route and ordering, rather than just round-tripping stored solutions.
  const weights = [
    { name: "compass", code: 2, g: 480 },
    { name: "rope", code: 4, g: 360 },
    { name: "canvas", code: 1, g: 240 },
    { name: "flint", code: 3, g: 120 },
  ].sort((a, b) => a.g - b.g);
  assert.equal(weights.map((x) => x.code).join(""), puzzles[0].sam.answers[0]);
  assert.equal(weights.map((x) => x.name).join(" "), puzzles[0].liz.answers[0]);
  const grid = [
    ["old", "under", "reed"],
    ["stone", "shell", "bridge"],
    ["arch", "tide", "cave"],
  ];
  const route = [
    [1, 0],
    [0, 0],
    [0, 1],
    [0, 2],
  ];
  assert.equal(
    route.map(([x, y]) => grid[y][x]).join(" "),
    puzzles[1].sam.answers[0],
  );
  const permutations = (letters: string[]): string[][] =>
    letters.length
      ? letters.flatMap((l, i) =>
          permutations(letters.filter((_, j) => i !== j)).map((rest) => [
            l,
            ...rest,
          ]),
        )
      : [[]];
  const valid = permutations(["a", "b", "c", "d"]).filter(
    (p) =>
      p.indexOf("c") < p.indexOf("d") &&
      p.indexOf("d") < p.indexOf("b") &&
      p.indexOf("b") < p.indexOf("a"),
  );
  assert.equal(valid.length, 1);
  assert.equal(valid[0].join(""), puzzles[2].sam.answers[0]);
});
