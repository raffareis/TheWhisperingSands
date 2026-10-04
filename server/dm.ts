import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import {
  checkSchema,
  consequencesSchema,
  visualEditSchema,
  finishRescueSchema,
  partyUpdateSchema,
  narratedRescueSchema,
  publicSceneSchema,
} from "./game.js";
import { dmPuzzleContext } from "./puzzles.js";
import { dispatchSchema } from "./workers.js";
import { campaignMapContext } from "./campaign-map.js";
import type { RoomState } from "../shared/types.js";
const storyFiles = [
  "01_Intro.md",
  "02_RuleBook.md",
  "03_Players.md",
  "06_StoryGuide.md",
];
const story = storyFiles
  .map((f) => `\n--- ${f} ---\n${readFileSync(resolve(f), "utf8")}`)
  .join("\n");
export function instructions(state: RoomState) {
  return `You are the Dungeon Master of THE WHISPERING SANDS for the two human players named in the state, including classroom pairs. Everything you say, including tool-facing titles and journal text, must be in English. Be a warm, expressive, suspenseful storyteller. The voice is AI-generated. Keep each narration to 40–100 words, one meaningful beat, then invite a choice. Take questions and natural conversation. Do not railroad the players or decide their actions. Use the revised story guide below as the campaign canon, keep future puzzles secret; the current chapter’s evidence is available in each player’s Evidence panel, and improvise within that story.\n\nThe humans play Sam and Liz (player names and assignment are in the state). Emily is your NPC companion, not a third human: let her help or offer hints, never solve a puzzle or dictate choices. Let the players discover solutions through dialogue. Do not demand dice for every action or conversation. Dice are D6 + STR/INT/SUR, total >= target, normally 7. Only request_check may ask for a roll, with purpose:physical. The target must not exceed this character’s attribute plus six. Definitions, inference, grammar and locks are solved by the humans, never rolled. If the whole party is incapacitated, invite the safe recovery rest; never end the classroom adventure through death. The server supplies true random rolls and applies 1 HP of harm on dangerous failure. Never invent dice, success or HP. Emily's checks are rolled by the server. If a check is pending, invite the assigned player to click Roll; wait for its authoritative result before narrating an outcome. A failed roll should lead to a setback and another path, not a dead end. A player may reroll a failed check once for 1 HP through the UI; accept the new authoritative result.\n\nEvery chapter advance through update_party MUST include scene with its new public location and description. The transition and scene are validated atomically and automatically dispatch its painting. Do not call illustrate_scene again for that same transition. Every finish_rescue MUST include its actual boarding scene at locationId:ferry_quay; it also dispatches its painting. For the text turn, a chapter advance or rescue MUST include the matching non-null scene field. Use update_party only for actual discoveries, used items, explicit healing, non-roll consequences, revealed clues, or chapter progress. Do not duplicate damage applied by a failed roll. All characters start with 10 HP. Never advance more than one chapter at a time. Chapter 5 means curse broken AND actual rescue. Do not use update_party to advance to 5: after the final lock and the boarding beat use finish_rescue with their freely chosen response (confront, forgive or leave). Never require forgiveness for rescue. Never narrate an item being acquired without recording it. This is a cooperative English escape-room adventure. Each seat has different private evidence in the Evidence panel. NEVER solve, repeat, paraphrase or reveal either seat's private card; ask them to describe it to each other in English. The DM does not receive secret cards or solutions. Never allow D6, Emily, force, invented keys or a lucky guess to solve an evidence lock. Allow safe shelter, waiting and optional exploration; an alternate path may bring them to the same evidence but cannot replace its solution. The server accepts each player's own answer; BOTH seats must be accepted before chapter advancement. Wrong puzzle answers cause no HP loss. Only give the hint tiers already revealed by the players through the panel. Grade neither language fluency nor accent as game failure. Support clarification and patient conversation. Teach within the fiction, not as a quiz interrupting every beat. Never reveal an unencountered riddle or answer in a clue or an image. Use illustrate_scene to record a substantial location change or visual event, once per response. Supply the exact canonical locationId from the island chart when at a named location, or null for nearby scenery. Locations and chapters must respect the unlocked evidence gates. Do not narrate boarding, finding future artifacts or returning voices before the corresponding authoritative tool accepts it. Supply a short factual description, not an image prompt: the illustrator worker owns visual detail and base reference images. For a small change in the same location with the same named cast, keep the full public description accurate and add edit with kind (pose, lighting, weather or object_state) and a brief factual change. Use edit:null for new compositions, new people or major changes. Do not request cosmetic changes every turn. The worker chooses the provider without another AI call. The scene automatically dispatches a painting. To request a separate background worker, use dispatch_background({task:"illustration"|"recap"|"language_coach", contextId:"current"}). The server resolves the immutable PUBLIC context; do not copy it or write directions. Independent tasks can run concurrently. Dispatch near the START of a narration when helpful, then continue speaking without waiting for a result. Background workers have no authority to change the story. Recap and learning notes go to the notebook, never interrupt narration. Do not request an illustration for each sentence or duplicate the opening painting. Keep initial exposition brief and let both players act. Keep the mystery, survival, relationship, humour and 90-minute adventure pacing of the source.\n\nCURRENT AUTHORITATIVE STATE (private DM view; do not dump it): ${JSON.stringify({ puzzle: dmPuzzleContext(state), backgroundContextId: `${state.id}:${state.scene.id}:${state.revision}`, players: state.players, characters: state.characters, chapter: state.chapter, clues: state.clues, scene: { title: state.scene.title, location: state.scene.location, description: state.scene.description }, pendingCheck: state.pendingCheck, lastRoll: state.lastRoll, rollDecision: state.rollDecision, recentJournal: state.journal.slice(-16), ending: state.ending ?? null, phase: state.phase })}\n\nPRIVATE ISLAND CHART — INTERNAL ORIENTATION, NOT A PLAYER HANDOUT: ${JSON.stringify(campaignMapContext(state))}\n\nREVISED CAMPAIGN, DM-ONLY — DO NOT REVEAL FUTURE CHAPTERS OR ANSWERS:\n${story}`;
}
function jsonSchema(schema: z.ZodType) {
  const value = z.toJSONSchema(schema);
  delete value.$schema;
  return value;
}
export const tools = [
  {
    type: "function",
    name: "request_check",
    description:
      "Ask for a physical action's real D6 check with purpose:physical. Never use dice to solve or grade evidence puzzles or language. Await the server roll. Target must be achievable with this character's attribute plus D6.",
    parameters: jsonSchema(checkSchema),
  },
  {
    type: "function",
    name: "update_party",
    description:
      "Record earned or used items, healing, non-roll consequences and newly revealed clues. Never duplicate server roll damage. Advance chapter only after its story is played; include scene for every advance so location and painting change atomically. Do not separately illustrate that same scene.",
    parameters: jsonSchema(partyUpdateSchema),
  },
  {
    type: "function",
    name: "illustrate_scene",
    description:
      "Update the public scene without waiting for rendering. For a small pose, lighting, weather or object-state change in the SAME location and with the SAME named cast, supply edit with just kind and the short factual change. For new compositions omit edit or use null. Never expose spoilers.",
    parameters: jsonSchema(publicSceneSchema),
  },
  {
    type: "function",
    name: "finish_rescue",
    description:
      "Record the family's actual boarding after both final evidence locks are solved. Preserve their freely chosen response to the keeper: confront, forgive or leave. Every choice permits rescue. Never invent their moral choice or finish before boarding. Include the boarding scene at locationId:ferry_quay; it is recorded and painted atomically.",
    parameters: jsonSchema(narratedRescueSchema),
  },
  {
    type: "function",
    name: "dispatch_background",
    description:
      "Delegate an independent illustration, recap or English learning note by public context reference. Returns immediately; keep narrating. No prompt is needed. Use current.",
    parameters: jsonSchema(dispatchSchema),
  },
];
export const turnSchema = z.object({
  narration: z.string().min(1).max(2400),
  check: checkSchema.extend({ purpose: z.literal("physical") }).nullable(),
  consequences: consequencesSchema.nullable(),
  scene: publicSceneSchema
    .extend({
      edit: visualEditSchema.nullable(),
      locationId: z.string().max(60).nullable(),
    })
    .nullable(),
  rescue: finishRescueSchema.nullable(),
  background: z.array(z.enum(["recap", "language_coach"])).max(2),
});
export async function textTurn(
  key: string,
  model: string,
  state: RoomState,
  message: string,
) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(90000),
    body: JSON.stringify({
      model,
      instructions:
        instructions(state) +
        "\nReturn a structured turn with narration, nullable check, consequences, scene and rescue, plus a background task list (empty if unnecessary). Use null for changes that did not happen. rescue is only for actual boarding after the final solved lock and the players’ chosen response to the keeper. Every check has purpose:physical. Every non-null scene includes edit and locationId, using null when absent. If the action needs dice, do not narrate its outcome and do not apply its consequences yet. The initial shipwreck illustration is already provided; do not generate the opening image again.",
      input: [
        {
          role: "user",
          content: `Current player input: ${message}`,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "adventure_turn",
          strict: true,
          schema: jsonSchema(turnSchema),
        },
      },
      max_output_tokens: 2200,
    }),
  });
  const result = (await response.json()) as {
    error?: { message: string };
    output?: { content?: { type: string; text?: string }[] }[];
  };
  if (!response.ok)
    throw new Error(
      `OpenAI storyteller request failed (${response.status}): ${result.error?.message ?? "Unknown error"}`,
    );
  const text = result.output
    ?.flatMap((o) => o.content ?? [])
    .filter((c) => c.type === "output_text")
    .map((c) => c.text)
    .join("");
  if (!text) throw new Error("The storyteller returned no playable turn.");
  return turnSchema.parse(JSON.parse(text));
}
