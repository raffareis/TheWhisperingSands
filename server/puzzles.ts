import type { Player, PuzzleView, RoomState } from "../shared/types.js";
import { GameError } from "./store.js";
// Definitions and solutions stay on the server. A seat receives only its own evidence.
interface Evidence {
  title: string;
  lines: string[];
  task: string;
  format: string;
  answers: string[];
}
interface Puzzle {
  id: string;
  title: string;
  premise: string;
  focus: string;
  sam: Evidence;
  liz: Evidence;
  hints: string[];
  reward: string;
  revelation: string;
}
export const puzzles: Puzzle[] = [
  {
    id: "salvage-lock",
    title: "The Quartermaster's Lock",
    focus: "Definitions, paraphrasing and comparative language",
    premise:
      "A locked rescue chest has two damaged instruction plates. Choose exactly four useful supplies, then arrange their shipping labels from lightest to heaviest. Describe your evidence to your partner; neither plate is enough alone.",
    sam: {
      title: "Water-damaged equipment glossary",
      lines: [
        "The rescue kit needs: something that makes a spark; fabric for shelter; a line for tying; an instrument for direction. Leave food and signalling equipment behind for this lock.",
        "FLINT — a stone that produces sparks. CANVAS — strong cloth. ROPE — a thick cord. COMPASS — an instrument that points north. WHISTLE — an instrument you blow to signal. BISCUIT — baked food.",
      ],
      task: "Enter the four shipping label numbers in ascending weight order.",
      format: "Four digits, no spaces",
      answers: ["3142"],
    },
    liz: {
      title: "Quartermaster's shipping ledger",
      lines: [
        "Label 2 · 480 g · points towards the pole",
        "Label 5 · 60 g · makes a high sound when blown",
        "Label 4 · 360 g · binds bundles together",
        "Label 1 · 240 g · can be stretched over poles",
        "Label 6 · 90 g · can be eaten without cooking",
        "Label 3 · 120 g · strikes a spark against steel",
      ],
      task: "Enter the four equipment names in ascending weight order.",
      format: "Four words separated by spaces",
      answers: ["flint canvas rope compass"],
    },
    hints: [
      "One plate identifies what belongs in the kit; the other gives weights. Compare descriptions, not just numbers.",
      "Say which object makes a spark, then ask your partner for its shipping label and weight.",
      "Discard the food and the signalling instrument. Arrange the remaining four by increasing weight; each player enters a different representation.",
    ],
    reward: "WE",
    revelation:
      "The chest contains a tide chart and a brass word-token: WE. A rescue bell is scratched out of every shipping record.",
  },
  {
    id: "tide-route",
    title: "The Path That Disappears",
    focus: "Prepositions, directions and spatial description",
    premise:
      "The tide is rising. A route notebook and a map must agree before the submerged passage can be marked. North is the top of the map. Coordinates use column letter, then row number; row 1 is north.",
    sam: {
      title: "Nine-stone tide chart",
      lines: [
        "Columns from west to east: A, B, C.",
        "Row 1: A1 OLD · B1 UNDER · C1 REED",
        "Row 2: A2 STONE · B2 SHELL · C2 BRIDGE",
        "Row 3: A3 ARCH · B3 TIDE · C3 CAVE",
        "Read only the starting stone and the endpoint of each instruction, in that order.",
      ],
      task: "Enter the four words visited by your partner's route.",
      format: "Four words separated by spaces",
      answers: ["under old stone arch"],
    },
    liz: {
      title: "The ferryman's route notebook",
      lines: [
        "Begin at the northern stone between the two corner stones.",
        "Move one stone west. Next, go one stone south. Finally, go one more stone south.",
        "Do not start at the middle of the island. The beginning belongs in the answer too.",
      ],
      task: "Enter the four coordinates visited, including the start.",
      format: "Four coordinates separated by spaces",
      answers: ["b1 a1 a2 a3"],
    },
    hints: [
      "The northern row is row 1. The stone between the corners is in the middle column.",
      "Describe the grid to the route-reader and read each movement aloud. Include the starting point.",
      "There are exactly four visited stones. West changes the column; south increases the row number.",
    ],
    reward: "WILL",
    revelation:
      "Under the old stone arch, you find the keeper's log and the word-token WILL. The lighthouse was extinguished deliberately, not by the storm.",
  },
  {
    id: "keeper-timeline",
    title: "Four Events, One Lie",
    focus: "Before, after, past tense and evidence-based inference",
    premise:
      "The keeper claims the storm put out the lighthouse before anyone opened the vault. Reconstruct the actual sequence from the torn log and the witness statements. Decide whether that explanation survives the evidence.",
    sam: {
      title: "Torn keeper's log",
      lines: [
        "A · The lighthouse went dark. Symbol: LIGHT.",
        "B · Someone removed the voice-seal from the vault. Symbol: SEAL.",
        "C · The warning bell rang. Symbol: BELL.",
        "D · The ferry returned to the quay. Symbol: FERRY.",
        "The letters identify entries, not chronological order.",
      ],
      task: "Enter the four log letters from earliest to latest.",
      format: "Four letters, no spaces",
      answers: ["cdba"],
    },
    liz: {
      title: "Three witness statements",
      lines: [
        "The ferryman: 'When I returned, the warning bell had already rung.'",
        "The archivist: 'Nobody removed the seal until after the ferry returned.'",
        "The lamp tender: 'The light went dark only after the seal had been removed.'",
      ],
      task: "Enter the four log symbols from earliest to latest.",
      format: "Four words separated by spaces",
      answers: ["bell ferry seal light"],
    },
    hints: [
      "Translate each statement into a pair of events: which had happened first?",
      "The bell rang before the ferry returned. Place the other two using the remaining statements.",
      "Join all three before/after relationships into one chain. The lighthouse event belongs at one end, not before the vault event.",
    ],
    reward: "FIND",
    revelation:
      "The keeper removed a seal to trap the islanders' voices inside the lighthouse. The storm is a symptom. You recover FIND and the missing voice-seal.",
  },
  {
    id: "voice-machine",
    title: "The Keeper's Instructions",
    focus: "Phrasal verbs, literal meaning and sequencing",
    premise:
      "The voice-seal fits a machine whose handles use expressions rather than pictures. Follow the archivist's restoration instructions, in order. Pulling a handle is an agreed team action, not a dice test.",
    sam: {
      title: "Five brass handles",
      lines: [
        "1 GIVE BACK — return something to its owner",
        "2 PUT OUT — extinguish a flame",
        "3 TURN DOWN — reduce an intensity",
        "4 BREAK DOWN — dismantle into parts",
        "5 TURN UP — increase an intensity",
        "Three handles are needed. Each is used once.",
      ],
      task: "Enter the handle numbers in restoration order.",
      format: "Three digits, no spaces",
      answers: ["312"],
    },
    liz: {
      title: "Archivist's restoration memo",
      lines: [
        "First, make the lamp less bright. Do not make it brighter.",
        "Then, return the stolen voices to their owners. Do not dismantle the machine.",
        "Finally, extinguish the brazier's flame. The warning bell must remain available.",
      ],
      task: "Enter the three handle expressions in restoration order.",
      format: "Three phrasal verbs separated by commas",
      answers: ["turn down give back put out"],
    },
    hints: [
      "Translate each instruction into the meaning of a handle expression.",
      "The first action reduces something. The second restores ownership. The third stops a flame.",
      "Do not confuse TURN DOWN with TURN UP, or returning with dismantling. Exchange handle labels and numbers before entering your answers.",
    ],
    reward: "HOME",
    revelation:
      "The voices return. HOME appears inside the signal lens. The keeper's final promise was a conditional, not an order to imprison people.",
  },
  {
    id: "final-promise",
    title: "The Promise at Dawn",
    focus: "First conditional, sentence order and meaning",
    premise:
      "Repair the keeper's promise to focus the signal lens. Use the four recovered word-tokens WE, WILL, FIND, HOME in the result clause. Each player must reconstruct the half held by their partner. The beacon needs both halves.",
    sam: {
      title: "Result-clause frame",
      lines: [
        "Tokens recovered, in discovery order: WE / WILL / FIND / HOME.",
        "Result grammar: subject → future auxiliary → base verb → destination.",
        "The promise must describe a possible future, not a certainty about the past.",
        "Ask your partner for the condition tiles. You enter the condition; your partner enters the result.",
      ],
      task: "Enter the complete condition clause from your partner's tiles.",
      format: "Start with IF; six words",
      answers: ["if we give back the voices"],
    },
    liz: {
      title: "Condition-clause tiles",
      lines: [
        "Tiles: VOICES / BACK / IF / THE / GIVE / WE",
        "IF starts the clause. WE is its subject. Use the restoration expression that means return something to its owner. THE introduces what is returned.",
        "The repaired condition contains six words. Ask your partner how the four recovered tokens make the result clause.",
      ],
      task: "Enter the result clause using the recovered tokens and your partner's grammar frame.",
      format: "Four words; no IF in this half",
      answers: ["we will find home"],
    },
    hints: [
      "The promise connects an action you can take now to a future result. Read your partner's evidence aloud.",
      "The condition uses present simple, even though the result uses WILL.",
      "Each player enters the other plate's clause. Combine them aloud after both locks accept: condition, then result.",
    ],
    reward: "A voice answered",
    revelation:
      "If we give back the voices, we will find home. The lighthouse sends your distress signal; a ferry answers through the morning mist.",
  },
];
const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
export function ensurePuzzles(state: RoomState) {
  state.puzzles ??= puzzles.map((p) => ({
    id: p.id,
    accepted: [],
    attempts: 0,
    hintCount: 0,
    solved: false,
  }));
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
    evidence: evidence.lines,
    task: evidence.task,
    format: evidence.format,
    hints: p.hints.slice(0, progress.hintCount),
    accepted: progress.accepted,
    solved: progress.solved,
    attempts: progress.attempts,
    reward: progress.solved ? p.revelation : null,
  };
}
export function projectRoom(state: RoomState, player: Player) {
  return { ...state, puzzleView: puzzleView(state, player) };
}
export function submitPuzzle(
  state: RoomState,
  player: Player,
  id: string,
  answer: string,
) {
  if (state.phase !== "playing" || state.players.length !== 2)
    throw new GameError("The two-player adventure must be in progress.", 409);
  ensurePuzzles(state);
  const p = puzzles[state.chapter];
  if (!p || p.id !== id)
    throw new GameError("That puzzle is no longer active.", 409);
  const progress = state.puzzles!.find((v) => v.id === id)!;
  if (progress.solved || progress.accepted.includes(player.characterId))
    return { accepted: true, solved: progress.solved };
  progress.attempts++;
  const accepted = p[player.characterId].answers.some(
    (a) => normalize(a) === normalize(answer),
  );
  if (!accepted)
    return {
      accepted: false,
      solved: false,
      message:
        "The mechanism does not accept this arrangement. Compare both pieces of evidence and try again. No HP is lost.",
    };
  progress.accepted.push(player.characterId);
  progress.solved = progress.accepted.length === 2;
  if (progress.solved && !state.clues.some((c) => c.id === id)) {
    state.clues.push({ id, title: p.title, text: p.revelation });
    const owner = state.characters.find((c) => c.id === "liz")!;
    const artifact = [
      { id: "tide-chart", name: "Tide chart" },
      { id: "keeper-log", name: "Keeper's log" },
      { id: "ancient-talisman", name: "Voice-seal" },
      { id: "signal-lens", name: "Signal lens" },
    ][state.chapter];
    if (artifact && !owner.inventory.some((i) => i.id === artifact.id))
      owner.inventory.push({
        ...artifact,
        description: p.revelation,
        quantity: 1,
      });
    if (state.chapter < 4)
      owner.inventory.push({
        id: `word-${p.reward.toLowerCase()}`,
        name: `Recovered token: ${p.reward}`,
        description: p.revelation,
        quantity: 1,
      });
  }
  return { accepted: true, solved: progress.solved };
}
export function revealHint(state: RoomState, id: string) {
  if (state.phase !== "playing" || puzzles[state.chapter]?.id !== id)
    throw new GameError("That puzzle is not active.", 409);
  ensurePuzzles(state);
  const progress = state.puzzles!.find((v) => v.id === id)!;
  progress.hintCount = Math.min(3, progress.hintCount + 1);
  return { hintCount: progress.hintCount };
}
export function dmPuzzleContext(state: RoomState) {
  ensurePuzzles(state);
  const p = puzzles[state.chapter];
  if (!p) return { complete: true };
  const progress = state.puzzles!.find((v) => v.id === p.id)!;
  // DM has premise/progress/hints, never solutions or the other seat's private evidence.
  return {
    id: p.id,
    title: p.title,
    premise: p.premise,
    focus: p.focus,
    progress,
    hints: p.hints.slice(0, progress.hintCount),
    revelation: progress.solved ? p.revelation : null,
  };
}
