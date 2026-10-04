import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initialState } from "../server/game.js";
import {
  puzzles,
  puzzleView,
  projectRoom,
  submitPuzzle,
  revealHint,
  dmPuzzleContext,
  ensurePuzzles,
  reservedCampaignItemIds,
  reservedCampaignClueIds,
} from "../server/puzzles.js";
function table(chapter = 0) {
  const s = initialState("puzzle-test");
  s.phase = "playing";
  s.players = [
    { id: "a", name: "Student A", characterId: "sam" },
    { id: "b", name: "Student B", characterId: "liz" },
  ];
  s.chapter = chapter;
  return s;
}
function solve(s: ReturnType<typeof table>, index = s.chapter) {
  const p = puzzles[index];
  assert.equal(
    submitPuzzle(s, s.players[0], p.id, p.sam.answers[0]).accepted,
    true,
  );
  assert.equal(
    submitPuzzle(s, s.players[1], p.id, p.liz.answers[0]).solved,
    true,
  );
}
const permutations = <T>(items: T[]): T[][] =>
  items.length
    ? items.flatMap((v, i) =>
        permutations(items.filter((_, j) => j !== i)).map((rest) => [
          v,
          ...rest,
        ]),
      )
    : [[]];

test("private walkthrough: five locks, permanent rewards and replay without duplicates", () => {
  const s = table();
  for (const [i, p] of puzzles.entries()) {
    s.chapter = i;
    assert.equal(
      submitPuzzle(s, s.players[0], p.id, p.sam.answers[0].toUpperCase())
        .solved,
      false,
    );
    assert.equal(dmPuzzleContext(s).revelation, null);
    assert.equal(
      submitPuzzle(
        s,
        s.players[1],
        p.id,
        p.liz.answers[0].replaceAll(" ", ", "),
      ).solved,
      true,
    );
    const snapshot = JSON.stringify({
      clues: s.clues,
      characters: s.characters,
      puzzles: s.puzzles,
    });
    submitPuzzle(s, s.players[1], p.id, "an ignored replay");
    ensurePuzzles(s);
    assert.equal(
      JSON.stringify({
        clues: s.clues,
        characters: s.characters,
        puzzles: s.puzzles,
      }),
      snapshot,
    );
    assert.equal(dmPuzzleContext(s).revelation, p.revelation);
  }
  assert.equal(
    s.phase,
    "playing",
    "solving does not silently record rescue or boarding",
  );
  assert.equal(s.clues.length, 5);
  const items = s.characters.flatMap((c) => c.inventory);
  assert.deepEqual(
    items.filter((i) => i.id.startsWith("word-")).map((i) => i.id),
    ["word-we", "word-will", "word-find", "word-home"],
  );
  for (const id of reservedCampaignItemIds)
    assert.equal(items.filter((i) => i.id === id).length, 1, id);
  assert.equal(new Set(reservedCampaignClueIds).size, 5);
});

test("each information gap needs both decisive restrictions, independently reconstructed", () => {
  // 1. Sam's rule admits either fourth item until Liz's inspection eliminates the whistle.
  const stock = [
    { name: "flint", code: 3, weight: 120, works: true },
    { name: "canvas", code: 1, weight: 240, works: true },
    { name: "rope", code: 4, weight: 360, works: true },
    { name: "compass", code: 2, weight: 480, works: true },
    { name: "whistle", code: 5, weight: 60, works: false },
    { name: "biscuit", code: 6, weight: 90, works: true },
  ];
  const combinations = stock.flatMap((_, a) =>
    stock.flatMap((_, b) =>
      stock.flatMap((_, c) =>
        stock.flatMap((_, d) =>
          a < b && b < c && c < d
            ? [[stock[a], stock[b], stock[c], stock[d]]]
            : [],
        ),
      ),
    ),
  );
  const packing = (kit: typeof stock) =>
    ["canvas", "rope", "compass"].every((n) => kit.some((i) => i.name === n)) &&
    kit.some((i) => ["flint", "whistle"].includes(i.name));
  const condition = (kit: typeof stock) => kit.every((i) => i.works);
  assert.equal(combinations.filter(packing).length, 2);
  assert.ok(combinations.filter(condition).length > 1);
  const kits = combinations.filter((k) => packing(k) && condition(k));
  assert.equal(kits.length, 1);
  const ordered = kits[0].sort((a, b) => a.weight - b.weight);
  assert.equal(ordered.map((i) => i.code).join(""), puzzles[0].sam.answers[0]);
  assert.equal(ordered.map((i) => i.name).join(" "), puzzles[0].liz.answers[0]);

  // 2. Route shape admits two grammatical destinations; only the inspection selects the safe one.
  const routes = [
    ["b1", "a1", "a2", "a3"],
    ["b1", "c1", "c2", "c3"],
  ];
  const grid: Record<string, string> = {
    a1: "old",
    b1: "under",
    c1: "old",
    a2: "stone",
    b2: "iron",
    c2: "wood",
    a3: "arch",
    b3: "gate",
    c3: "pier",
  };
  assert.equal(routes.length, 2);
  // The chart alone also offers a grammatical, safe destination with a diagonal.
  // Only the partner's shape rules this alternative out.
  const chartOnlyAlternative = ["b1", "a1", "b2", "b3"];
  assert.ok(!chartOnlyAlternative.includes("c2"));
  assert.equal(
    chartOnlyAlternative.map((c) => grid[c]).join(" "),
    "under old iron gate",
  );

  const safe = routes.filter((route) => !route.includes("c2"));
  assert.equal(safe.length, 1);
  assert.equal(safe[0].join(" "), puzzles[1].liz.answers[0]);
  assert.equal(
    safe[0].map((c) => grid[c]).join(" "),
    puzzles[1].sam.answers[0],
  );
  assert.ok(
    permutations(["a1", "a2", "a3", "b1"]).length > 1,
    "safety alone does not specify a route",
  );

  // 3. Removing either witness source leaves more than one chronology.
  const sequences = permutations(["a", "b", "c", "d"]);
  const harbour = (p: string[]) => p.indexOf("c") < p.indexOf("d");
  const indoor = (p: string[]) =>
    p.indexOf("d") < p.indexOf("b") && p.indexOf("b") < p.indexOf("a");
  assert.ok(sequences.filter(harbour).length > 1);
  assert.ok(sequences.filter(indoor).length > 1);
  const chronology = sequences.filter((p) => harbour(p) && indoor(p));
  assert.deepEqual(chronology, [["c", "d", "b", "a"]]);
  assert.equal(chronology[0].join(""), puzzles[2].sam.answers[0]);
  const symbols: Record<string, string> = {
    a: "light",
    b: "seal",
    c: "bell",
    d: "ferry",
  };
  assert.equal(
    chronology[0].map((c) => symbols[c]).join(" "),
    puzzles[2].liz.answers[0],
  );

  // 4. Two safety interlocks fix a unique action order; either alone allows three.
  const repairs = permutations([3, 1, 2]);
  const mechanical = (p: number[]) => p.indexOf(1) < p.indexOf(2);
  const inspection = (p: number[]) => p.indexOf(3) < p.indexOf(1);
  assert.equal(repairs.filter(mechanical).length, 3);
  assert.equal(repairs.filter(inspection).length, 3);
  assert.deepEqual(
    repairs.filter((p) => mechanical(p) && inspection(p)),
    [[3, 1, 2]],
  );

  // 5. Neither working-channel evidence nor consent evidence alone selects a plan.
  const plans = [
    { name: "lark", west: true, free: false },
    { name: "tern", west: true, free: true },
    { name: "gull", west: false, free: true },
    { name: "heron", west: false, free: false },
  ];
  assert.equal(plans.filter((p) => p.west).length, 2);
  assert.equal(plans.filter((p) => p.free).length, 2);
  const viable = plans.filter((p) => p.west && p.free);
  assert.deepEqual(
    viable.map((p) => p.name),
    ["tern"],
  );
  assert.equal(
    `${viable[0].name} if we call by choice`,
    puzzles[4].sam.answers[0],
  );
  assert.equal(
    `${viable[0].name} we will find home`,
    puzzles[4].liz.answers[0],
  );
});

test("all chapters project only the seat's card and earned discoveries; DM has no cards or validators", () => {
  for (const [i, p] of puzzles.entries()) {
    const s = table(i);
    for (const [seat, other] of [
      [0, 1],
      [1, 0],
    ]) {
      const own = p[s.players[seat].characterId];
      const partner = p[s.players[other].characterId];
      const view = projectRoom(s, s.players[seat]);
      assert.deepEqual(view.puzzleView?.evidence, own.lines);
      assert.equal(view.puzzleView?.reward, null);
      const serialized = JSON.stringify(view);
      for (const line of partner.lines)
        assert.ok(!serialized.includes(line), line);
      assert.ok(!serialized.includes('"answers"'));
      assert.ok(!serialized.includes(p.revelation));
      assert.ok(view.puzzleView!.glossary!.length > 0);
    }
    const dm = JSON.stringify(dmPuzzleContext(s));
    for (const evidence of [p.sam, p.liz]) {
      for (const line of evidence.lines) assert.ok(!dm.includes(line));
      for (const answer of evidence.answers) assert.ok(!dm.includes(answer));
    }
    assert.ok(!dm.includes(p.revelation));
    // A caller cannot mutate static cards by changing a projected view.
    const view = puzzleView(s, s.players[0])!;
    view.evidence.push("injected");
    view.accepted.push("liz");
    assert.ok(!p.sam.lines.includes("injected"));
    assert.equal(s.puzzles![i].accepted.length, 0);
  }
});

test("DM-loaded prose never contains answer strings or prematurely identifies culprit and motive", () => {
  const prose = [
    "01_Intro.md",
    "02_RuleBook.md",
    "03_Players.md",
    "06_StoryGuide.md",
  ]
    .map((f) => readFileSync(f, "utf8"))
    .join(" ")
    .toLowerCase();
  for (const p of puzzles)
    for (const card of [p.sam, p.liz])
      for (const answer of card.answers)
        assert.ok(!prose.includes(answer), answer);
  for (const p of puzzles.slice(0, 3))
    assert.ok(!p.premise.includes("Elias Venn"));
  assert.ok(!puzzles[1].revelation.includes("deliberately"));
  assert.ok(!puzzles[2].revelation.includes("to trap"));
  assert.ok(!puzzles[4].premise.includes("WE, WILL, FIND, HOME"));
});

test("permissive presentation accepts spaced codes, arrows, unicode and grammatical alternatives", () => {
  const variants: [number, number, string][] = [
    [0, 0, "３ １ ４ ２"],
    [0, 0, "3-1-4-2"],
    [0, 1, "FLINT, CANVAS, ROPE, COMPASS."],
    [1, 1, "B1 → A1 → A2 → A3"],
    [2, 0, "C-D-B-A"],
    [3, 1, "turn the lamp down, give the voices back, put the flame out"],
    [
      3,
      1,
      "turn down the test lamp; give back the stolen voices; put out the brazier's flame",
    ],
    [
      3,
      1,
      "turn the oil test lamp down, give the stolen voices back, put the fire out",
    ],
    [4, 0, "TERN: If we call by choice."],
    [4, 0, "TERN; if, by choice, we call"],
    [3, 1, "turn it down, give them back, put it out"],
    [
      3,
      1,
      "turn the brightness down, give their voices back, put the fire in the brazier out",
    ],
    [4, 1, "TERN — We'll find home!"],
    [4, 1, "TERN; we’ll find our way home."],
  ];
  for (const [chapter, seat, answer] of variants) {
    const s = table(chapter);
    assert.equal(
      submitPuzzle(s, s.players[seat], puzzles[chapter].id, answer).accepted,
      true,
      answer,
    );
  }
  for (const a of ["turn down the lamp", "turn the lamp down"])
    for (const b of ["give back the voices", "give the voices back"])
      for (const c of ["put out the flame", "put the flame out"]) {
        const s = table(3);
        assert.equal(
          submitPuzzle(s, s.players[1], puzzles[3].id, `${a}, ${b}, ${c}`)
            .accepted,
          true,
        );
      }
});

test("feedback separates format from unsupported meaning without revealing solutions or harming players", () => {
  const s = table();
  const malformed = submitPuzzle(
    s,
    s.players[0],
    puzzles[0].id,
    "three objects",
  );
  assert.equal(malformed.feedback, "format");
  const wrong = submitPuzzle(s, s.players[0], puzzles[0].id, "1234");
  assert.equal(wrong.feedback, "meaning");
  assert.ok(!JSON.stringify([malformed, wrong]).includes("3142"));
  assert.equal(s.characters[0].hp, 10);
  assert.throws(
    () => submitPuzzle(s, s.players[1], puzzles[2].id, "cdba"),
    /no longer active/,
  );
  assert.throws(
    () =>
      submitPuzzle(
        s,
        { ...s.players[0], id: "outsider" },
        puzzles[0].id,
        "3142",
      ),
    /own this seat/,
  );
  s.chapter = 3;
  assert.equal(
    submitPuzzle(s, s.players[1], puzzles[3].id, "turn up, give back, put out")
      .accepted,
    false,
  );
  assert.equal(
    submitPuzzle(
      s,
      s.players[1],
      puzzles[3].id,
      "give back, turn down, put out",
    ).accepted,
    false,
  );
  assert.equal(
    submitPuzzle(
      s,
      s.players[1],
      puzzles[3].id,
      "turn down it, give back them, put out it",
    ).accepted,
    false,
    "pronouns must be between verb and particle",
  );
  s.chapter = 4;
  for (const plan of ["LARK", "GULL", "HERON"])
    assert.equal(
      submitPuzzle(
        s,
        s.players[0],
        puzzles[4].id,
        `${plan}; if we call by choice`,
      ).accepted,
      false,
    );
  assert.equal(
    submitPuzzle(s, s.players[1], puzzles[4].id, "we will find home").feedback,
    "format",
  );
  assert.equal(
    submitPuzzle(
      s,
      s.players[0],
      puzzles[4].id,
      "TERN if we will call by choice",
    ).accepted,
    false,
  );
  assert.equal(
    submitPuzzle(s, s.players[0], puzzles[4].id, "if we give the voices back")
      .accepted,
    false,
    "the changed final requires a plan, not the old publicly supplied phrase",
  );
});

test("collided or forged campaign IDs cannot award unearned knowledge or suppress earned rewards", () => {
  const s = table();
  s.clues.push(
    { id: "salvage-lock", title: "Wrong", text: "The chest is locked." },
    { id: "final-promise", title: "Forged", text: "unearned secret" },
    { id: "personal-note", title: "Note", text: "Keep this." },
  );
  s.characters[0].inventory.push({
    id: "word-we",
    name: "Forgery",
    description: "Wrong",
    quantity: 99,
  });
  const projection = projectRoom(s, s.players[0]);
  assert.ok(!JSON.stringify(projection).includes("unearned secret"));
  assert.ok(!JSON.stringify(projection).includes("Forgery"));
  solve(s);
  assert.equal(s.clues.filter((c) => c.id === "salvage-lock").length, 1);
  assert.equal(
    s.clues.find((c) => c.id === "salvage-lock")!.text,
    puzzles[0].revelation,
  );
  assert.ok(s.clues.some((c) => c.id === "personal-note"));
  assert.equal(
    s.characters
      .flatMap((c) => c.inventory)
      .filter((i) => i.id.startsWith("rescue-")).length,
    4,
  );
  assert.equal(s.puzzles![0].rewardGranted, true);
  // Even a legacy 'granted' marker cannot prevent repairing a collided or missing record.
  s.clues[0].text = "corrupted";
  s.characters.forEach((c) => {
    c.inventory = c.inventory.filter(
      (i) => !reservedCampaignItemIds.includes(i.id),
    );
  });
  ensurePuzzles(s);
  assert.equal(
    s.clues.find((c) => c.id === "salvage-lock")!.text,
    puzzles[0].revelation,
  );
  assert.equal(
    s.characters
      .flatMap((c) => c.inventory)
      .filter((i) => reservedCampaignItemIds.includes(i.id)).length,
    6,
  );
});

test("hints compare expected count so simultaneous requests and old retries reveal one tier", () => {
  const s = table();
  assert.deepEqual(revealHint(s, puzzles[0].id, 0), { hintCount: 1 });
  assert.deepEqual(revealHint(s, puzzles[0].id, 0), { hintCount: 1 });
  assert.deepEqual(revealHint(s, puzzles[0].id, 3), { hintCount: 1 });
  assert.deepEqual(revealHint(s, puzzles[0].id, 1), { hintCount: 2 });
  const resumed = JSON.parse(JSON.stringify(s));
  assert.deepEqual(revealHint(resumed, puzzles[0].id, 1), { hintCount: 2 });
  assert.deepEqual(revealHint(resumed, puzzles[0].id, 2), { hintCount: 3 });
  assert.deepEqual(revealHint(resumed, puzzles[0].id, 3), { hintCount: 3 });
  assert.throws(() => revealHint(s, puzzles[0].id, -1), /integer/);
  assert.throws(() => revealHint(s, puzzles[0].id, 1.5), /integer/);
  assert.equal(puzzleView(resumed, resumed.players[0])!.hints.length, 3);
  assert.ok(!JSON.stringify(dmPuzzleContext(resumed).hints).includes("3142"));
  assert.deepEqual(
    revealHint(s, puzzles[0].id),
    { hintCount: 3 },
    "legacy two-argument callers remain supported",
  );
});

test("resuming old partial and completed games merges by ID without resetting progress", () => {
  const s = table(4);
  s.puzzles![0] = {
    id: puzzles[0].id,
    accepted: ["sam", "liz"],
    attempts: 4,
    hintCount: 2,
    solved: true,
  };
  s.puzzles![4] = {
    id: puzzles[4].id,
    accepted: ["sam"],
    attempts: 7,
    hintCount: 1,
    solved: false,
  };
  s.puzzles = s.puzzles!.filter((p) => p.id !== puzzles[1].id);
  ensurePuzzles(s);
  assert.deepEqual(
    s.puzzles.find((p) => p.id === puzzles[4].id),
    {
      id: puzzles[4].id,
      accepted: ["sam"],
      attempts: 7,
      hintCount: 1,
      solved: false,
    },
  );
  assert.equal(
    s.puzzles.find((p) => p.id === puzzles[1].id)!.solved,
    true,
    "a recorded later chapter preserves prior completion",
  );
  assert.equal(s.puzzles.find((p) => p.id === puzzles[0].id)!.attempts, 4);
  assert.equal(s.puzzles.find((p) => p.id === puzzles[0].id)!.hintCount, 2);
  assert.match(
    s.journal.find((j) => j.id === "campaign-edition-2")!.text,
    /kept/,
  );
  assert.equal(
    submitPuzzle(s, s.players[0], puzzles[4].id, "if we give the voices back")
      .accepted,
    true,
    "previously accepted half is not revoked",
  );
  assert.deepEqual(
    s.puzzles.slice(0, 5).map((p) => p.id),
    puzzles.map((p) => p.id),
  );
  const resumed = JSON.parse(JSON.stringify(s));
  assert.equal(
    submitPuzzle(
      resumed,
      resumed.players[1],
      puzzles[4].id,
      "TERN; we'll find home",
    ).solved,
    true,
  );
  ensurePuzzles(resumed);
  assert.equal(
    resumed.journal.filter((j: { id: string }) => j.id === "campaign-edition-2")
      .length,
    1,
  );
});

test("near-simultaneous submissions and serialized replay grant one reward set", async () => {
  const s = table();
  const results = await Promise.all(
    s.players.map((player, index) =>
      Promise.resolve().then(() =>
        submitPuzzle(
          s,
          player,
          puzzles[0].id,
          index ? "flint canvas rope compass" : "3142",
        ),
      ),
    ),
  );
  assert.deepEqual(
    results.map((r) => r.solved),
    [false, true],
  );
  const resumed = JSON.parse(JSON.stringify(s));
  await Promise.all(
    resumed.players.map((player: (typeof s.players)[number]) =>
      Promise.resolve().then(() =>
        submitPuzzle(resumed, player, puzzles[0].id, "duplicate delivery"),
      ),
    ),
  );
  assert.equal(
    resumed.clues.filter((c: { id: string }) => c.id === "salvage-lock").length,
    1,
  );
  const items = resumed.characters.flatMap(
    (c: (typeof s.characters)[number]) => c.inventory,
  );
  assert.equal(
    items.filter((i: { id: string }) => i.id === "word-we").length,
    1,
  );
  assert.equal(
    items.filter((i: { id: string }) => i.id.startsWith("rescue-")).length,
    4,
  );
});
