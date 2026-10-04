import type { Item, Player, PuzzleView, RoomState } from "../shared/types.js";
import { GameError } from "./store.js";

// Server-only evidence. Neither the story guide nor the DM gets these cards or validators.
interface Evidence {
  title: string;
  lines: string[];
  task: string;
  format: string;
  answers: string[];
  shape:
    | "digits4"
    | "digits3"
    | "letters4"
    | "words4"
    | "coordinates"
    | "verbs"
    | "condition"
    | "result";
}
interface Puzzle {
  id: string;
  title: string;
  premise: string;
  focus: string;
  sam: Evidence;
  liz: Evidence;
  hints: string[];
  glossary: NonNullable<PuzzleView["glossary"]>;
  reward: string;
  revelation: string;
}
export const puzzles: Puzzle[] = [
  {
    id: "salvage-lock",
    title: "The Harbour Chest",
    focus: "Definitions, comparisons and checking conditions",
    premise:
      "An island rescue chest has washed down from the camp store. The camp's roof and drinking water are already available. To open the chest's equipment drawer, select exactly four serviceable supplies and order their labels from lightest to heaviest. This drawer's packing rule is not a rule for survival.",
    sam: {
      title: "Equipment drawer: packing rule",
      lines: [
        "Pack one shelter fabric, one tying line and one navigation instrument. The fourth object may be a fire starter OR a sound signal, but it must work. Do not pack food in this drawer.",
        "FLINT makes sparks against steel; CANVAS is strong shelter cloth; ROPE ties things together; COMPASS points north; WHISTLE makes a sound when blown; BISCUIT is food.",
        "The rule does not say which signal or starter still works. Ask your partner about condition and weight before choosing.",
      ],
      task: "Enter the four shipping label numbers, lightest first.",
      format: "Four digits; spaces or punctuation are also accepted",
      shape: "digits4",
      answers: ["3142"],
    },
    liz: {
      title: "Shipping labels and inspection marks",
      lines: [
        "Label 2 · 480 g · points north · WORKING",
        "Label 5 · 60 g · sounds when blown · BLOCKED: no sound",
        "Label 4 · 360 g · ties bundles · WORKING",
        "Label 1 · 240 g · stretches over poles · DRY AND WHOLE",
        "Label 6 · 90 g · eaten without cooking · GOOD",
        "Label 3 · 120 g · makes sparks against steel · DRY AND WORKING",
        "Five supplies passed inspection, but only four belong in this drawer. Your partner has the packing rule.",
      ],
      task: "Enter the four equipment names, lightest first.",
      format: "Four names in order; spaces or commas",
      shape: "words4",
      answers: ["flint canvas rope compass"],
    },
    hints: [
      "Separate two decisions: which supplies meet both the packing rule and the inspection, then which is lighter. Each partner rules something out.",
      "'A cup OR a bottle, provided it has no holes' offers two choices until you check their condition. 'Lighter than' means a smaller weight.",
      "A blocked whistle cannot fill the working signal slot. That settles one choice; combine the remaining requirements with the weights before ordering the four labels.",
    ],
    glossary: [
      { term: "serviceable", meaning: "In good enough condition to use." },
      {
        term: "drawer",
        meaning: "A sliding compartment inside a chest or cabinet.",
      },
      {
        term: "pole",
        meaning: "A long straight stick supporting a shelter, here.",
      },
    ],
    reward: "WE",
    revelation:
      "The drawer opens: flint, canvas, rope and compass are yours, with a tide chart and a brass token marked WE. The chest's fixed plaque reads 'Harbour emergency stores 07'; its broken anchor matches the camp store, not your boat. A shipping correction says 'Leave the passenger-bell entry off the harbour copy. — K-17.' It raises a question; it does not identify a thief.",
  },
  {
    id: "tide-route",
    title: "Two Routes Through the Tide",
    focus: "Directions, prepositions and comparing routes",
    premise:
      "A local nine-stone chart and a ferryman's notebook describe the crossing. North is up; columns A–C run west to east and rows 1–3 run north to south. Agree on four safe stones, including the start. The inscription names a place to investigate, not a cause of the storm. You may wait safely for low water.",
    sam: {
      title: "Chart with the latest safety inspection",
      lines: [
        "Row 1: A1 OLD · B1 UNDER · C1 OLD",
        "Row 2: A2 STONE · B2 IRON · C2 WOOD",
        "Row 3: A3 ARCH · B3 GATE · C3 PIER",
        "The western middle stone A2 is firm. The eastern middle stone C2 has cracked and must not carry anyone. All other stones are firm.",
        "Joining stones freely can spell several places: a stone arch, an iron gate or a wood pier. Safety alone does not select a route. Your partner has the route shape and starting point.",
      ],
      task: "Enter the words on the four visited stones, in travel order.",
      format: "Four words; include the starting stone",
      shape: "words4",
      answers: ["under old stone arch"],
    },
    liz: {
      title: "Ferryman's route shape",
      lines: [
        "Start at the middle stone of the northern row.",
        "Move one stone sideways to either corner of that row. Then move one stone south, and one more stone south. Never turn back or skip a stone.",
        "Both the eastern and western routes once worked. Use the current safety inspection to choose. Do not guess from the words of the destination.",
      ],
      task: "Enter the four visited coordinates, including the start.",
      format: "Four coordinates, such as C1 C2 B2 B3 (example only)",
      shape: "coordinates",
      answers: ["b1 a1 a2 a3"],
    },
    hints: [
      "Draw both routes allowed by the notebook, then ask which inspection fact eliminates one. Neither direction is selected by the notebook alone.",
      "'One step south' changes row 1 to row 2 without changing the column. On a different grid, D1 followed by D2 illustrates this.",
      "The eastern option crosses C2. Check that stone's condition with your partner. Include the starting coordinate when you read back the surviving route.",
    ],
    glossary: [
      { term: "firm", meaning: "Stable enough to stand on." },
      {
        term: "sideways",
        meaning: "To the west or east in this chart, staying in the same row.",
      },
      {
        term: "pier",
        meaning: "A structure reaching into water where boats can stop.",
      },
    ],
    reward: "WILL",
    revelation:
      "The safe crossing leads under the old stone arch. You recover the keeper's log and the brass token WILL. One page records a lifted seal and a dark beacon; a later account says a storm caused the failure. The pages disagree, but the order and responsibility still need evidence. Dry archive shelves hold the missing records.",
  },
  {
    id: "keeper-timeline",
    title: "Four Events, One Account",
    focus: "Before, after, past perfect and limits of evidence",
    premise:
      "The keeper's public account says the beacon failed before the seal was lifted, and blames the weather. Combine records from independent witnesses to order four events. After the lock opens, compare the time recorder and access receipt before deciding what the order actually proves.",
    sam: {
      title: "Log index and harbour watch",
      lines: [
        "A · LIGHT: the lighthouse beacon went dark. B · SEAL: the protective voice-seal was lifted out of its socket.",
        "C · BELL: the warning bell rang. D · FERRY: the ferry returned to the quay. These letters label entries, not their order.",
        "The shore watch writes: 'The ferry was still outside the harbour when the bell rang. It returned afterwards.'",
        "The watch cannot see the seal socket or the beacon mechanism. Ask your partner for the two indoor observations.",
      ],
      task: "Enter the four log letters, earliest to latest.",
      format: "Four letters; spaces or hyphens are accepted",
      shape: "letters4",
      answers: ["cdba"],
    },
    liz: {
      title: "Two indoor witness statements",
      lines: [
        "The lamp tender writes: 'The light went dark only after the seal had been lifted.'",
        "The archivist writes: 'When the seal was lifted, the ferry had already returned.'",
        "Neither witness heard the bell from inside. Ask your partner for the harbour observation and the log's symbol names.",
      ],
      task: "Enter the four event symbols, earliest to latest.",
      format: "Four words from the log index",
      shape: "words4",
      answers: ["bell ferry seal light"],
    },
    hints: [
      "Turn each observation into an earlier/later pair. Ask which relationship only the other witness can supply, then join the pairs.",
      "'When I arrived, the shop had already closed' means the shop closed first. The past-perfect form marks the earlier event; it does not name the person responsible.",
      "BELL belongs before FERRY. Keep that pair together while you place the two indoor events. The order can refute an account without proving a motive.",
    ],
    glossary: [
      {
        term: "quay",
        meaning:
          "A place beside the water where a boat stops; pronounced 'key'.",
      },
      {
        term: "seal",
        meaning:
          "A protective object fitted into a socket, not the sea animal.",
      },
      {
        term: "had already",
        meaning:
          "This event happened before the other past event being described.",
      },
    ],
    reward: "FIND",
    revelation:
      "The sequence contradicts the keeper's claim about the beacon. Two independent archive records now complete the finding: the automatic recorder logged SEAL LIFTED at 22:04, BEACON OFF at 22:05 and FIRST GUST at 22:08; the ferry clerk's witnessed receipt identifies keeper Elias Venn, employee K-17, as the person who removed and deposited the seal. The weather followed the failure. These records establish timing and responsibility, not motive. The deposit drawer releases the original voice-seal and the token FIND.",
  },
  {
    id: "voice-machine",
    title: "Three Actions, Two Interlocks",
    focus: "Phrasal verbs, object placement and sequencing",
    premise:
      "The original voice-seal fits the lighthouse's lower machine. Two maintenance records jointly specify its safe restoration. The small oil test lamp here is separate from the dark electric beacon upstairs. Agree on three handles and their order; no dice are involved.",
    sam: {
      title: "Handle labels and mechanical interlock",
      lines: [
        "1 GIVE BACK — return something to its owner. 2 PUT OUT — extinguish a flame. 3 TURN DOWN — reduce brightness. 4 BREAK DOWN — take a structure apart, in this maintenance context. 5 TURN UP — increase brightness.",
        "Interlock: return the voices BEFORE extinguishing the brazier. Until their owners can answer, its small flame powers the return channel.",
        "Use exactly three distinct handles. The machine does not say whether the test lamp currently needs more or less light; the inspection record does.",
      ],
      task: "Enter three handle numbers in restoration order.",
      format: "Three digits; spaces or commas are accepted",
      shape: "digits3",
      answers: ["312"],
    },
    liz: {
      title: "Light inspection and repair objectives",
      lines: [
        "The oil test lamp is too bright: its glare closes the voice channel. Reduce its light BEFORE returning the voices.",
        "The finished repair needs three things: less glare, voices returned to their owners, and an extinguished brazier. Do not dismantle the machine. The warning bell stays available.",
        "This record does not say whether to extinguish the brazier before or after returning the voices. Your partner's interlock settles that.",
      ],
      task: "Enter the three handle expressions in order. You may include their objects.",
      format:
        "Three phrasal verbs, separated by commas; e.g. 'pick the book up' shows valid object placement",
      shape: "verbs",
      answers: ["turn down give back put out"],
    },
    hints: [
      "Choose handles by their meanings, then combine the two BEFORE restrictions. A list of repair objectives is not yet a safe order.",
      "'Pick up the book' and 'pick the book up' mean the same thing. These repair verbs also allow the named object between verb and particle; the sequence of actions must still be right.",
      "The return action must precede the flame action. Your partner has a separate restriction involving lamp brightness. Join the two without reversing either.",
    ],
    glossary: [
      {
        term: "interlock",
        meaning:
          "A safety mechanism that requires one operation before another.",
      },
      { term: "brazier", meaning: "A metal container holding a small fire." },
      {
        term: "glare",
        meaning: "Light so bright that it makes seeing difficult.",
      },
    ],
    reward: "HOME",
    revelation:
      "The voices return to their owners; the beacon is still awaiting a new distress signal. HOME is engraved inside the released signal lens. A manufacturer's plate explains the circuit: with its seal lifted, the machine diverted island voices into storage, cut power to the beacon and fed the storm coil. Returning the voices drains that coil and settles the wind. A signed unsent letter in Elias Venn's service box says, 'I thought that if I kept their voices, somebody would always be here to listen.' His fear explains his decision; it does not excuse it. A fresh rescue call must be freely initiated, never made from those stored voices.",
  },
  {
    id: "final-promise",
    title: "Who May Make the Call?",
    focus: "Evidence, consent and a first conditional",
    premise:
      "The restored lens offers four signal plans. Compare the channel test with the permission record to choose the one that can reach help without borrowing anyone's voice. Then reconstruct its condition and future result. Choosing a safe plan does not promise forgiveness, staying on the island or speaking aloud: a hand key can make the same freely chosen call.",
    sam: {
      title: "Channel test and future-message frame",
      lines: [
        "The western receiver answers from a rescue ferry. The eastern receiver has a broken wire and cannot reach a boat.",
        "Plan LARK → west. Plan TERN → west. Plan GULL → east. Plan HERON → east. This test says nothing about permission or where each plan gets its sound.",
        "The four recovered tokens are listed here out of order: HOME / FIND / WE / WILL. The future message frame is subject → future auxiliary → base verb → destination.",
        "The old beacon motto uses 'find home' poetically. 'Find our way home' is also valid English. Ask your partner which plans allow a fresh, freely chosen call and what condition belongs to them.",
      ],
      task: "Enter the agreed plan name followed by its complete IF condition.",
      format: "PLAN; if ... (the plan name and condition are both required)",
      shape: "condition",
      answers: [
        "tern if we call by choice",
        "tern if by choice we call",
        "tern if we by choice call",
      ],
    },
    liz: {
      title: "Permission record and condition tiles",
      lines: [
        "LARK and HERON use stored island voices without asking their owners. TERN and GULL take a new signal only when its sender chooses to press the key. This record says nothing about which coast reaches a ferry.",
        "Free-call condition tiles, scrambled: CHOICE / IF / CALL / BY / WE. BY CHOICE means voluntarily. The condition uses the present simple, even for a future possibility.",
        "Returning a stolen voice is not permission to reuse it. A fresh call can be spoken or tapped on the hand key, so no one must lend their voice.",
        "Ask your partner which working channel can carry that free call, and how the recovered tokens form a future result.",
      ],
      task: "Enter the agreed plan name followed by its future result clause.",
      format: "PLAN; future result (contractions and 'our way' are accepted)",
      shape: "result",
      answers: ["tern we will find home", "tern we will find our way home"],
    },
    hints: [
      "Make two short candidate lists: plans with a working route, and plans with a freely initiated signal. Their intersection selects the plan. Neither test alone does.",
      "'If we open the window, we will hear the rain' uses present simple after IF and WILL in the result. Its meaning links a choice to a possible future; it is not a command.",
      "The permission record eliminates plans using stored voices. More than one plan remains; ask which of their channels actually reaches help. Put the agreed plan name before each clause.",
    ],
    glossary: [
      {
        term: "by choice",
        meaning: "Voluntarily, because the person decides to do it.",
      },
      {
        term: "consent",
        meaning: "A person's freely given permission for a particular action.",
      },
      {
        term: "hand key",
        meaning: "A button that sends light pulses without anyone speaking.",
      },
    ],
    reward: "A free signal",
    revelation:
      "Your chosen plan connects a working channel with a freely initiated signal. The repaired promise is a possibility, not an oath binding anyone to the island. The lens is ready for your own spoken or hand-key call; it will not reuse the islanders' voices. A ferry can answer that call. Decide how to address the keeper, then choose to signal and board. Confronting him, forgiving him or leaving without reconciliation all permit the same rescue. Puzzle completion prepares the signal; it does not record boarding.",
  },
];

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[’']/g, "'")
    .replace(/\bwe'll\b/g, "we will")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

// Both positions are grammatical for named objects; pronouns must precede the particle.
function separableForms(
  verb: string,
  particle: string,
  objects: string[],
  pronoun: string,
) {
  return [
    `${verb} ${particle}`,
    `${verb} ${pronoun} ${particle}`,
    ...objects.flatMap((object) => [
      `${verb} ${particle} ${object}`,
      `${verb} ${object} ${particle}`,
    ]),
  ];
}
const verbForms = [
  separableForms(
    "turn",
    "down",
    [
      "the lamp",
      "the test lamp",
      "the oil test lamp",
      "the light",
      "the brightness",
      "the lamp s brightness",
      "the brightness of the lamp",
    ],
    "it",
  ),
  separableForms(
    "give",
    "back",
    ["the voices", "the stolen voices", "their voices", "the islanders voices"],
    "them",
  ),
  separableForms(
    "put",
    "out",
    [
      "the flame",
      "the fire",
      "the brazier",
      "the brazier s flame",
      "the brazier s fire",
      "the flame in the brazier",
      "the fire in the brazier",
    ],
    "it",
  ),
];
function isAnswer(evidence: Evidence, answer: string) {
  const value = normalize(answer);
  if (evidence.shape === "verbs")
    return verbForms[0].some((a) =>
      verbForms[1].some((b) =>
        verbForms[2].some((c) => value === `${a} ${b} ${c}`),
      ),
    );
  const canonical = /^(digits|letters)/.test(evidence.shape)
    ? value.replaceAll(" ", "")
    : value;
  return evidence.answers.some((a) => normalize(a) === canonical);
}
function formatMatches(evidence: Evidence, answer: string) {
  const value = normalize(answer);
  switch (evidence.shape) {
    case "digits4":
      return /^\d{4}$/.test(value.replaceAll(" ", ""));
    case "digits3":
      return /^\d{3}$/.test(value.replaceAll(" ", ""));
    case "letters4":
      return /^[a-z]{4}$/.test(value.replaceAll(" ", ""));
    case "coordinates":
      return /^[abc][123]( [abc][123]){3}$/.test(value);
    case "words4":
      return /^[a-z]+( [a-z]+){3}$/.test(value);
    case "condition":
      return /^(lark|tern|gull|heron) if .+/.test(value);
    case "result":
      return /^(lark|tern|gull|heron) we (will|would|can|shall) .+/.test(value);
    case "verbs":
      return value.split(" ").length >= 6;
  }
}

const artifactItems: (Item | null)[] = [
  {
    id: "tide-chart",
    name: "Tide chart",
    description:
      "A copied chart of the nine-stone crossing. Its information remains in the notebook.",
    quantity: 1,
  },
  {
    id: "keeper-log",
    name: "Keeper's log",
    description:
      "Conflicting accounts from the archive. A permanent copy remains in the notebook.",
    quantity: 1,
  },
  {
    id: "ancient-talisman",
    name: "Voice-seal",
    description:
      "The original protective seal. After fitting, this inventory entry records its installed socket, not a loose object. A tether and manual service latch make it recoverable.",
    quantity: 1,
  },
  {
    id: "signal-lens",
    name: "Signal lens",
    description:
      "The restored lens remains mounted in the gallery. This record preserves access, not a removable quest requirement.",
    quantity: 1,
  },
  null,
];
const supplies: Item[] = [
  {
    id: "rescue-flint",
    name: "Flint",
    description: "Reusable spark stone from harbour chest 07.",
    quantity: 1,
  },
  {
    id: "rescue-canvas",
    name: "Canvas",
    description:
      "Reusable shelter cloth from harbour chest 07; the camp's existing roof is also safe.",
    quantity: 1,
  },
  {
    id: "rescue-rope",
    name: "Rope",
    description: "A reusable coil from harbour chest 07.",
    quantity: 1,
  },
  {
    id: "rescue-compass",
    name: "Compass",
    description: "A working compass from harbour chest 07.",
    quantity: 1,
  },
];
export const reservedCampaignItemIds: string[] = [
  ...supplies.map((i) => i.id),
  ...artifactItems.flatMap((i) => (i ? [i.id] : [])),
  "word-we",
  "word-will",
  "word-find",
  "word-home",
];
export const reservedCampaignClueIds: string[] = puzzles.map((p) => p.id);
function rewards(index: number): Item[] {
  const p = puzzles[index];
  return [
    ...(index === 0 ? supplies : []),
    ...(artifactItems[index] ? [artifactItems[index]!] : []),
    ...(index < 4
      ? [
          {
            id: `word-${p.reward.toLowerCase()}`,
            name: `Recovered token: ${p.reward}`,
            description:
              "Copied into the notebook as permanent knowledge. Losing a physical token never erases a discovery.",
            quantity: 1,
          },
        ]
      : []),
  ];
}
function reconcileRewards(state: RoomState) {
  const earned = puzzles.flatMap((p, index) =>
    state.puzzles!.find((v) => v.id === p.id)?.solved ? [{ p, index }] : [],
  );
  // A freeform clue with the same ID is neither proof of a solve nor a reward ledger.
  const canonicalClues = new Map(
    earned.map(({ p }) => [
      p.id,
      { id: p.id, title: p.title, text: p.revelation },
    ]),
  );
  const seenClues = new Set<string>();
  state.clues = state.clues.flatMap((c) => {
    if (!reservedCampaignClueIds.includes(c.id)) return [c];
    const canonical = canonicalClues.get(c.id);
    if (!canonical || seenClues.has(c.id)) return [];
    seenClues.add(c.id);
    return [canonical];
  });
  for (const [id, clue] of canonicalClues)
    if (!seenClues.has(id)) state.clues.push(clue);
  const earnedItems = new Map(
    earned.flatMap(({ index }) =>
      rewards(index).map((i) => [i.id, i] as const),
    ),
  );
  const seenItems = new Set<string>();
  for (const character of state.characters)
    character.inventory = character.inventory.flatMap((i) => {
      if (!reservedCampaignItemIds.includes(i.id)) return [i];
      const canonical = earnedItems.get(i.id);
      if (!canonical || seenItems.has(i.id)) return [];
      seenItems.add(i.id);
      return [{ ...canonical }];
    });
  const owner = state.characters.find((c) => c.id === "liz");
  if (owner) {
    for (const [id, item] of earnedItems)
      if (!seenItems.has(id)) owner.inventory.push({ ...item });
    for (const { p } of earned)
      state.puzzles!.find((v) => v.id === p.id)!.rewardGranted = true;
  }
}
export function ensurePuzzles(state: RoomState) {
  // Merge by stable ID. Never reset accepted seats, attempts, hints or a completed lock.
  state.puzzles ??= [];
  for (const [index, p] of puzzles.entries()) {
    if (!state.puzzles.some((v) => v.id === p.id)) {
      // A legacy chapter transition is evidence that preceding gates were completed.
      const completed = index < state.chapter;
      state.puzzles.push({
        id: p.id,
        accepted: completed ? ["sam", "liz"] : [],
        attempts: 0,
        hintCount: 0,
        solved: completed,
      });
    }
  }
  const existing = state.puzzles;
  state.puzzles = [
    ...puzzles.map((p) => existing.find((v) => v.id === p.id)!),
    ...existing.filter((v) => !reservedCampaignClueIds.includes(v.id)),
  ];
  if (!state.journal.some((e) => e.id === "campaign-edition-2")) {
    const resumed =
      state.chapter > 0 ||
      state.puzzles.some(
        (p) => p.solved || p.attempts || p.hintCount || p.accepted.length,
      );
    state.journal.push({
      id: "campaign-edition-2",
      kind: "system",
      at: new Date().toISOString(),
      text: resumed
        ? "The revised evidence edition is active. Completed locks, accepted answers and requested help have been kept. Unfinished cards use the revised evidence; earned discoveries and missing supplies have been reconciled. The current records supersede earlier mechanism descriptions."
        : "Evidence edition 2: each partner holds decisive information. Help and retries are free; discoveries remain known even if an object is misplaced.",
    });
  }
  reconcileRewards(state);
}
export function puzzleView(
  state: RoomState,
  player: Player,
): PuzzleView | null {
  ensurePuzzles(state);
  const p = puzzles[state.chapter];
  if (!p || state.phase === "lobby") return null;
  const progress = state.puzzles!.find((v) => v.id === p.id)!;
  const evidence = p[player.characterId];
  return {
    id: p.id,
    title: p.title,
    premise: p.premise,
    languageFocus: p.focus,
    evidenceTitle: evidence.title,
    evidence: [...evidence.lines],
    task: evidence.task,
    format: evidence.format,
    glossary: p.glossary.map((g) => ({ ...g })),
    hints: p.hints.slice(0, progress.hintCount),
    accepted: [...progress.accepted],
    solved: progress.solved,
    attempts: progress.attempts,
    reward: progress.solved ? p.revelation : null,
  };
}
export function projectRoom(state: RoomState, player: Player) {
  const view = puzzleView(state, player);
  return { ...state, puzzleView: view };
}
export function submitPuzzle(
  state: RoomState,
  player: Player,
  id: string,
  answer: string,
) {
  if (state.phase !== "playing" || state.players.length !== 2)
    throw new GameError("The two-player adventure must be in progress.", 409);
  if (
    !state.players.some(
      (p) => p.id === player.id && p.characterId === player.characterId,
    )
  )
    throw new GameError("That player does not own this seat.", 403);
  ensurePuzzles(state);
  const p = puzzles[state.chapter];
  if (!p || p.id !== id)
    throw new GameError("That puzzle is no longer active.", 409);
  const progress = state.puzzles!.find((v) => v.id === id)!;
  if (progress.solved || progress.accepted.includes(player.characterId))
    return { accepted: true, solved: progress.solved };
  progress.attempts++;
  const evidence = p[player.characterId];
  if (!isAnswer(evidence, answer)) {
    const feedback = formatMatches(evidence, answer) ? "meaning" : "format";
    return {
      accepted: false,
      solved: false,
      feedback,
      message:
        feedback === "format"
          ? `Check the entry format: ${evidence.format}. This is a format issue, not a judgment of your English. No HP is lost.`
          : "The entry has a readable format, but the arrangement does not meet both records. Compare the restrictions and their order with your partner. This does not mean your sentence is bad English. Help and retries cost nothing.",
    };
  }
  progress.accepted.push(player.characterId);
  progress.solved = ["sam", "liz"].every((seat) =>
    progress.accepted.includes(seat as "sam" | "liz"),
  );
  if (progress.solved) reconcileRewards(state);
  return { accepted: true, solved: progress.solved };
}
export function revealHint(
  state: RoomState,
  id: string,
  expectedHintCount?: number,
) {
  if (state.phase !== "playing" || puzzles[state.chapter]?.id !== id)
    throw new GameError("That puzzle is not active.", 409);
  ensurePuzzles(state);
  const progress = state.puzzles!.find((v) => v.id === id)!;
  if (expectedHintCount !== undefined) {
    if (
      !Number.isInteger(expectedHintCount) ||
      expectedHintCount < 0 ||
      expectedHintCount > 3
    )
      throw new GameError(
        "The expected hint count must be an integer from 0 to 3.",
        400,
      );
    if (expectedHintCount !== progress.hintCount)
      return { hintCount: progress.hintCount };
  }
  progress.hintCount = Math.min(3, progress.hintCount + 1);
  return { hintCount: progress.hintCount };
}
export function dmPuzzleContext(state: RoomState) {
  ensurePuzzles(state);
  const p = puzzles[state.chapter];
  if (!p) return { complete: true };
  const progress = state.puzzles!.find((v) => v.id === p.id)!;
  return {
    id: p.id,
    title: p.title,
    premise: p.premise,
    focus: p.focus,
    progress: {
      id: progress.id,
      accepted: [...progress.accepted],
      attempts: progress.attempts,
      hintCount: progress.hintCount,
      solved: progress.solved,
    },
    hints: p.hints.slice(0, progress.hintCount),
    revelation: progress.solved ? p.revelation : null,
  };
}
