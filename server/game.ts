import {
  puzzles,
  reservedCampaignItemIds,
  reservedCampaignClueIds,
} from "./puzzles.js";
import { campaignMap } from "./campaign-map.js";
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
    imageUrl: "/art/coastal-field-study-sunburst.webp",
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
    partyChat: [],
    pendingCheck: null,
    lastRoll: null,
    rollDecision: null,
    preferences: { illustrations: true },
    puzzles: puzzles.map((p) => ({
      id: p.id,
      accepted: [],
      attempts: 0,
      hintCount: 0,
      solved: false,
    })),
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
  purpose: z.enum(["physical", "puzzle"]).optional().default("physical"),
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
  if (value.purpose !== "physical")
    throw new Error("Evidence puzzles cannot be solved or graded with dice.");
  const character = state.characters.find((c) => c.id === value.characterId)!;
  if (value.target > character.stats[value.stat] + 6)
    throw new Error("This difficulty is impossible for the character.");
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
    log(
      state,
      "system",
      "The party needs a safe rest in shelter. Evidence and discussion remain available; rest to recover before another physical check.",
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
    value.nextChapter !== null &&
    value.nextChapter > state.chapter &&
    state.puzzles &&
    !state.puzzles[state.chapter]?.solved
  )
    throw new Error(
      "Both players must solve this chapter's evidence puzzle before advancing.",
    );
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
  const reservedItems = new Set(reservedCampaignItemIds);
  const reservedClues = new Set(reservedCampaignClueIds);
  if (
    value.items.some((item) => reservedItems.has(item.id)) ||
    value.clues.some((clue) => reservedClues.has(clue.id))
  )
    throw new Error(
      "Campaign evidence and artifacts are controlled by the puzzle engine.",
    );
  if (value.nextChapter === 5 && !state.ending?.rescued)
    throw new Error(
      "Use finish_rescue after the final puzzle and boarding beat.",
    );
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

  log(state, "system", value.reason);
  return {
    characters: state.characters,
    clues: state.clues,
    chapter: state.chapter,
  };
}
export const visualEditSchema = z.object({
  kind: z.enum(["pose", "lighting", "weather", "object_state"]),
  change: z.string().trim().min(5).max(300),
});
export const sceneSchema = z.object({
  title: z.string().min(1).max(100),
  location: z.string().min(1).max(100),
  locationId: z.string().max(60).nullable().optional(),
  description: z.string().min(1).max(600),
  visualPrompt: z.string().min(10).max(1800),
  edit: visualEditSchema.nullable().optional(),
});
export const publicSceneSchema = sceneSchema.omit({ visualPrompt: true });
export const partyUpdateSchema = consequencesSchema.extend({
  scene: publicSceneSchema.nullable().optional(),
});
export function applyNarratedConsequences(state: RoomState, raw: unknown) {
  const value = partyUpdateSchema.parse(raw);
  if (
    value.nextChapter !== null &&
    value.nextChapter > state.chapter &&
    !value.scene
  )
    throw new Error(
      "A chapter transition requires its public scene in update_party.scene.",
    );
  const staged = structuredClone(state);
  const result = applyConsequences(staged, value);
  if (value.scene)
    setScene(staged, { ...value.scene, visualPrompt: value.scene.description });
  Object.assign(state, staged);
  return { ...result, scene: state.scene };
}
export function setScene(state: RoomState, raw: unknown) {
  const v = sceneSchema.parse(raw);
  const normalize = (text: string) => text.trim().toLowerCase();
  // Only explicit identifiers or recognised location names have deterministic gates.
  // Free prose is not a semantic validator and may still require DM review.
  const aliases: Record<string, string> = {
    "the uncharted shore": "wreck_beach",
    "the beacon gallery": "beacon_gallery",
    "the ferry quay": "ferry_quay",
    quay: "ferry_quay",
    beacon: "beacon_gallery",
  };
  const requestedId = v.locationId ?? aliases[normalize(v.location)];
  const node = requestedId
    ? campaignMap.nodes.find((node) => node.id === requestedId)
    : campaignMap.nodes.find(
        (node) => normalize(node.label) === normalize(v.location),
      );
  if (requestedId && !node) throw new Error("Unknown campaign location.");
  if (node) {
    // Shelter stays accessible before the first evidence lock. The quay becomes
    // available for the boarding beat after the final lock, before completion.
    const minimumChapter =
      node.id === "palm_camp"
        ? 0
        : node.id === "ferry_quay"
          ? 4
          : node.first_chapter;
    const gate = campaignMap.edges.find((edge) => edge.to === node.id)?.gate;
    const gateSolved =
      !gate ||
      node.id === "palm_camp" ||
      !!state.puzzles?.find((p) => p.id === gate.puzzle_id)?.solved;
    if (state.chapter < minimumChapter || !gateSolved)
      throw new Error("This campaign location is not available yet.");
  }
  state.sceneHistory.push({ ...state.scene });
  state.scene = {
    id: randomUUID(),
    title: v.title,
    location: v.location,
    ...(node ? { locationId: node.id } : {}),
    description: v.description,
    prompt: v.visualPrompt,
    imageUrl: state.scene.imageUrl,
    status: "generating",
    chapter: state.chapter,
    ...(v.edit ? { edit: { ...v.edit, sourceSceneId: state.scene.id } } : {}),
  };
  return state.scene;
}
export function statName(stat: Stat) {
  return { STR: "Strength", INT: "Intelligence", SUR: "Survival" }[stat];
}

export const finishRescueSchema = z.object({
  choice: z.enum(["confront", "forgive", "leave"]),
});
export const narratedRescueSchema = finishRescueSchema.extend({
  scene: publicSceneSchema.extend({ locationId: z.literal("ferry_quay") }),
});
export function finishNarratedRescue(state: RoomState, raw: unknown) {
  const value = narratedRescueSchema.parse(raw);
  const staged = structuredClone(state);
  setScene(staged, { ...value.scene, visualPrompt: value.scene.description });
  const result = finishRescue(staged, value);
  Object.assign(state, staged);
  return { ...result, scene: state.scene };
}
export function finishRescue(state: RoomState, raw: unknown) {
  const { choice } = finishRescueSchema.parse(raw);
  if (
    state.phase !== "playing" ||
    state.chapter !== 4 ||
    !state.puzzles?.find((p) => p.id === puzzles[4].id)?.solved
  )
    throw new Error(
      "Solve the final evidence puzzle and play the boarding beat before finishing the rescue.",
    );
  if (state.pendingCheck || state.rollDecision)
    throw new Error("Resolve the current check before boarding.");
  state.ending = { choice, rescued: true };
  state.chapter = 5;
  state.chapterTitle = chapterTitles[5];
  state.phase = "complete";
  const epilogues = {
    confront:
      "The family boards the rescue ferry. The stolen voices are returned, and the keeper must answer for his actions.",
    forgive:
      "The family boards the rescue ferry. The stolen voices are returned; forgiveness is offered freely, without promising to stay.",
    leave:
      "The family boards the rescue ferry. The stolen voices are returned, and they leave without reconciliation or any promise to remain.",
  };
  log(state, "system", epilogues[choice]);
  return state.ending;
}
export function safeRest(state: RoomState) {
  if (state.phase !== "playing" || !state.characters.every((c) => c.hp === 0))
    throw new Error(
      "A recovery rest is available when the whole party is incapacitated.",
    );
  if (state.pendingCheck || state.rollDecision)
    throw new Error("Resolve the current check before resting.");
  for (const character of state.characters)
    character.hp = Math.min(character.maxHp, 3);
  log(
    state,
    "system",
    "The party rests in safe shelter and recovers 3 HP each. Evidence, items and chapter progress are preserved.",
  );
  return { characters: state.characters };
}
export function cancelAbsentCheck(
  state: RoomState,
  playerId: string,
  checkId: string,
  onlinePlayerIds: Iterable<string>,
) {
  const check = state.pendingCheck;
  const actor = state.players.find((p) => p.id === playerId);
  const owner = state.players.find((p) => p.characterId === check?.characterId);
  if (
    !check ||
    check.id !== checkId ||
    !actor ||
    !owner ||
    actor.id === owner.id ||
    new Set(onlinePlayerIds).has(owner.id)
  )
    throw new Error(
      "Only the companion can cancel a pending check while its owner is offline.",
    );
  state.pendingCheck = null;
  log(
    state,
    "system",
    `${actor.name} cancelled ${owner.name}'s pending physical check while they were offline. No roll or consequence was applied.`,
  );
  return { cancelled: checkId };
}
