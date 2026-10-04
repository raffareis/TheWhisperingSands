import { randomInt, randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  Character,
  Check,
  RoomState,
  Stat,
  JournalEntry,
  Scene,
} from "../shared/types.js";
export const chapterTitles = [
  "The shipwreck",
  "Survival",
  "Exploration",
  "The curse",
  "The final ritual",
  "A new dawn",
];
export function initialState(id: string): RoomState {
  const characters: Character[] = [
    {
      id: "sam",
      name: "Samuel",
      shortName: "Sam",
      role: "The protector",
      bio: "A former military officer turned outdoor guide. Resilient, resourceful, and fiercely protective of his family.",
      stats: { STR: 5, INT: 2, SUR: 3 },
      hp: 10,
      maxHp: 10,
      inventory: [
        {
          id: "pocket-knife",
          name: "Pocket knife",
          description: "A small, well-worn blade that survived the storm.",
          quantity: 1,
        },
      ],
    },
    {
      id: "liz",
      name: "Elizabeth",
      shortName: "Liz",
      role: "The archaeologist",
      bio: "An archaeologist with a gift for ancient languages. There is a story hidden in every symbol, and she means to find it.",
      stats: { STR: 2, INT: 5, SUR: 3 },
      hp: 10,
      maxHp: 10,
      inventory: [
        {
          id: "field-notebook",
          name: "Field notebook",
          description:
            "Salt-stained pages, a pencil, and room for new discoveries.",
          quantity: 1,
        },
      ],
    },
    {
      id: "emily",
      name: "Emily",
      shortName: "Emily",
      role: "Your companion",
      bio: "Your curious, brave sixteen-year-old companion. She knows the outdoors and has an ear for languages and puzzles.",
      stats: { STR: 2, INT: 3, SUR: 5 },
      hp: 10,
      maxHp: 10,
      inventory: [],
    },
  ];
  const scene: Scene = {
    id: randomUUID(),
    title: "Where the sea leaves you",
    location: "The uncharted shore",
    description:
      "The storm is gone. Your boat is scattered across the sand. Beyond the palms, something waits to be discovered.",
    prompt:
      "Shipwreck debris on a tropical shore after a storm, dawn, sea mist, ancient markings on a tree at the jungle edge. No people, talismans or spirits.",
    imageUrl: "/art/shipwreck.png",
    status: "ready",
  };
  return {
    id,
    revision: 0,
    createdAt: new Date().toISOString(),
    players: [],
    characters,
    chapter: 0,
    chapterTitle: chapterTitles[0],
    scene,
    sceneHistory: [],
    clues: [],
    journal: [],
    pendingCheck: null,
    lastRoll: null,
    rollDecision: null,
    preferences: { illustrations: true },
    phase: "lobby",
  };
}
export function log(
  state: RoomState,
  kind: JournalEntry["kind"],
  text: string,
  playerId?: string,
) {
  state.journal.push({
    id: randomUUID(),
    kind,
    text,
    at: new Date().toISOString(),
    ...(playerId ? { playerId } : {}),
  });
  // Only public events enter this journal. The adventure's DM notes stay server-side.
}
export const checkSchema = z.object({
  characterId: z.enum(["sam", "liz", "emily"]),
  stat: z.enum(["STR", "INT", "SUR"]),
  target: z.number().int().min(2).max(16),
  reason: z.string().min(1).max(300),
  dangerous: z.boolean(),
});
export function requestCheck(state: RoomState, raw: unknown): Check {
  if (state.phase !== "playing")
    throw new Error("Start the adventure before requesting a check.");
  if (state.pendingCheck || state.rollDecision)
    throw new Error("Resolve the current check first.");
  const value = checkSchema.parse(raw);
  const character = state.characters.find((c) => c.id === value.characterId)!;
  if (character.hp === 0)
    throw new Error(`${character.shortName} is incapacitated.`);
  state.pendingCheck = { ...value, id: randomUUID() };
  state.lastRoll = null;
  return state.pendingCheck;
}
export function rollCheck(
  state: RoomState,
  playerId: string,
  checkId: string,
  dieSource = () => randomInt(1, 7),
) {
  const check = state.pendingCheck;
  if (!check || check.id !== checkId)
    throw new Error(
      "This check has already been resolved or is no longer active.",
    );
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.characterId !== check.characterId)
    throw new Error("Only the character taking this check can roll it.");
  return resolveCheck(state, check, dieSource, false);
}
function resolveCheck(
  state: RoomState,
  check: Check,
  dieSource: () => number,
  rerolled: boolean,
) {
  const character = state.characters.find((c) => c.id === check.characterId)!;
  const die = dieSource();
  if (!Number.isInteger(die) || die < 1 || die > 6)
    throw new Error("Invalid D6 result.");
  const total = die + character.stats[check.stat];
  const success = total >= check.target;
  if (!success && check.dangerous) character.hp = Math.max(0, character.hp - 1);
  state.lastRoll = { ...check, die, total, success, rerolled };
  state.pendingCheck = null;
  state.rollDecision =
    !success && !rerolled && character.hp >= 2 && character.id !== "emily"
      ? check.id
      : null;
  log(
    state,
    "roll",
    `${character.shortName}: D6 ${die} + ${check.stat} ${character.stats[check.stat]} = ${total} / ${check.target}. ${success ? "Success." : "Setback."}${!success && check.dangerous ? " Lost 1 HP." : ""}${rerolled ? " Rerolled at the cost of 1 HP." : ""}`,
  );
  if (state.characters.every((c) => c.hp === 0)) {
    state.phase = "complete";
    log(
      state,
      "system",
      "The party is incapacitated. Your adventure has come to an end.",
    );
  }
  return state.lastRoll;
}
export function rerollCheck(
  state: RoomState,
  playerId: string,
  rollId: string,
  dieSource = () => randomInt(1, 7),
) {
  const roll = state.lastRoll;
  if (
    !roll ||
    roll.id !== rollId ||
    state.rollDecision !== rollId ||
    roll.success ||
    roll.rerolled ||
    state.pendingCheck ||
    state.phase !== "playing"
  )
    throw new Error("This check cannot be rerolled.");
  const player = state.players.find((p) => p.id === playerId);
  const character = state.characters.find((c) => c.id === roll.characterId)!;
  if (!player || player.characterId !== roll.characterId || character.hp < 2)
    throw new Error("A reroll needs your own character and at least 2 HP.");
  character.hp -= 1;
  // The failed attempt's harm already happened; a reroll does not apply that harm twice.
  const result = resolveCheck(
    state,
    { ...roll, dangerous: false },
    dieSource,
    true,
  );
  result.dangerous = roll.dangerous;
  return result;
}
export function acceptRoll(state: RoomState, playerId: string, rollId: string) {
  const roll = state.lastRoll;
  const player = state.players.find((p) => p.id === playerId);
  if (
    !roll ||
    state.rollDecision !== rollId ||
    roll.id !== rollId ||
    !player ||
    player.characterId !== roll.characterId
  )
    throw new Error("This dice decision is no longer available to you.");
  state.rollDecision = null;
  return roll;
}
export function rollCompanion(
  state: RoomState,
  checkId: string,
  dieSource = () => randomInt(1, 7),
) {
  const check = state.pendingCheck;
  if (!check || check.id !== checkId || check.characterId !== "emily")
    throw new Error("Emily has no matching pending check.");
  return resolveCheck(state, check, dieSource, false);
}
export const consequencesSchema = z.object({
  reason: z.string().min(1).max(500),
  health: z
    .array(
      z.object({
        characterId: z.enum(["sam", "liz", "emily"]),
        delta: z.number().int().min(-1).max(2),
      }),
    )
    .max(3),
  items: z
    .array(
      z.object({
        characterId: z.enum(["sam", "liz", "emily"]),
        id: z.string().regex(/^[a-z0-9-]{1,60}$/),
        name: z.string().min(1).max(80),
        description: z.string().max(300),
        quantityChange: z.number().int().min(-10).max(10),
      }),
    )
    .max(8),
  clues: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9-]{1,60}$/),
        title: z.string().min(1).max(100),
        text: z.string().min(1).max(500),
      }),
    )
    .max(3),
  nextChapter: z.number().int().min(0).max(5).nullable(),
});
export function applyConsequences(state: RoomState, raw: unknown) {
  if (state.phase !== "playing")
    throw new Error("The adventure is not in progress.");
  const value = consequencesSchema.parse(raw);
  if (
    value.nextChapter !== null &&
    (value.nextChapter < state.chapter || value.nextChapter > state.chapter + 1)
  )
    throw new Error("Advance only one chapter at a time.");
  if (
    value.health.some(
      (h, i) =>
        value.health.findIndex((x) => x.characterId === h.characterId) !== i,
    )
  )
    throw new Error("Duplicate health changes.");
  if (state.pendingCheck || state.rollDecision)
    throw new Error("Resolve the pending check before consequences.");
  if (
    new Set(value.items.map((i) => `${i.characterId}:${i.id}`)).size !==
    value.items.length
  )
    throw new Error("Duplicate item changes.");
  for (const change of value.items) {
    const current =
      state.characters
        .find((c) => c.id === change.characterId)!
        .inventory.find((i) => i.id === change.id)?.quantity ?? 0;
    if (current + change.quantityChange < 0)
      throw new Error("Cannot remove items a character does not have.");
  }
  for (const h of value.health) {
    const c = state.characters.find((c) => c.id === h.characterId)!;
    c.hp = Math.max(0, Math.min(c.maxHp, c.hp + h.delta));
  }
  for (const change of value.items) {
    const c = state.characters.find((c) => c.id === change.characterId)!;
    const item = c.inventory.find((i) => i.id === change.id);
    if (item) item.quantity += change.quantityChange;
    else if (change.quantityChange > 0)
      c.inventory.push({
        id: change.id,
        name: change.name,
        description: change.description,
        quantity: change.quantityChange,
      });
    c.inventory = c.inventory.filter((i) => i.quantity > 0);
  }
  for (const clue of value.clues)
    if (!state.clues.some((c) => c.id === clue.id)) state.clues.push(clue);
  if (value.nextChapter !== null) {
    state.chapter = value.nextChapter;
    state.chapterTitle = chapterTitles[state.chapter];
    if (state.chapter === 5) state.phase = "complete";
  }
  if (state.characters.every((c) => c.hp === 0)) state.phase = "complete";
  log(state, "system", value.reason);
  return {
    characters: state.characters,
    clues: state.clues,
    chapter: state.chapter,
  };
}
export const sceneSchema = z.object({
  title: z.string().min(1).max(100),
  location: z.string().min(1).max(100),
  description: z.string().min(1).max(600),
  visualPrompt: z.string().min(10).max(1800),
});
export function setScene(state: RoomState, raw: unknown) {
  const v = sceneSchema.parse(raw);
  state.sceneHistory.push({ ...state.scene });
  state.scene = {
    id: randomUUID(),
    title: v.title,
    location: v.location,
    description: v.description,
    prompt: v.visualPrompt,
    imageUrl: state.scene.imageUrl,
    status: "generating",
  };
  return state.scene;
}
export function statName(stat: Stat) {
  return { STR: "Strength", INT: "Intelligence", SUR: "Survival" }[stat];
}
