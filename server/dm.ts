import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { checkSchema, consequencesSchema } from "./game.js";
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
export const publicSceneSchema = z.object({
  title: z.string().min(1).max(100),
  location: z.string().min(1).max(100),
  description: z.string().min(1).max(600),
});
export function instructions(state: RoomState) {
  return `You are the Dungeon Master of THE WHISPERING SANDS for the two human players named in the state, including classroom pairs. Everything you say, including tool-facing titles and journal text, must be in English. Be a warm, expressive, suspenseful storyteller. The voice is AI-generated. Keep each narration to 40–100 words, one meaningful beat, then invite a choice. Take questions and natural conversation. Do not railroad the players or decide their actions. Use the revised story guide below as the campaign canon, keep puzzles secret until discovered, and improvise within that story.\n\nThe humans play Sam and Liz (player names and assignment are in the state). Emily is your NPC companion, not a third human: let her help or offer hints, never solve a puzzle or dictate choices. Let the players discover solutions through dialogue. Do not demand dice for every action or conversation. Dice are D6 + STR/INT/SUR, total >= target, normally 7. Only request_check may ask for a roll. The server supplies true random rolls and applies 1 HP of harm on dangerous failure. Never invent dice, success or HP. Emily's checks are rolled by the server. If a check is pending, invite the assigned player to click Roll; wait for its authoritative result before narrating an outcome. A failed roll should lead to a setback and another path, not a dead end. A player may reroll a failed check once for 1 HP through the UI; accept the new authoritative result.\n\nUse update_party only for actual discoveries, used items, explicit healing, non-roll consequences, revealed clues, or chapter progress. Do not duplicate damage applied by a failed roll. All characters start with 10 HP. Never advance more than one chapter at a time. Chapter 5 means curse broken AND rescue, so only advance there when both have happened. Never narrate an item being acquired without recording it. This is a cooperative English escape-room adventure. Each seat has different private evidence in the Evidence panel. NEVER solve, repeat, paraphrase or reveal either seat's private card; ask them to describe it to each other in English. The DM does not receive secret cards or solutions. Never allow D6, Emily, force, alternate entrances, invented keys or a lucky guess to bypass a puzzle. The server accepts each player's own answer; BOTH seats must be accepted before chapter advancement. Wrong puzzle answers cause no HP loss. Only give the hint tiers already revealed by the players through the panel. Grade neither language fluency nor accent as game failure. Support clarification and patient conversation. Teach within the fiction, not as a quiz interrupting every beat. Never reveal an unencountered riddle or answer in a clue or an image. Use illustrate_scene to record a substantial location change or visual event, once per response. Supply a short factual description, not an image prompt: the illustrator worker owns visual detail and base reference images. The scene automatically dispatches a painting. To request a separate background worker, use dispatch_background({task:"illustration"|"recap"|"language_coach", contextId:"current"}). The server resolves the immutable PUBLIC context; do not copy it or write directions. Independent tasks can run concurrently. Dispatch near the START of a narration when helpful, then continue speaking without waiting for a result. Background workers have no authority to change the story. Recap and learning notes go to the notebook, never interrupt narration. Do not request an illustration for each sentence or duplicate the opening painting. Keep initial exposition brief and let both players act. Keep the mystery, survival, relationship, humour and 90-minute adventure pacing of the source.\n\nCURRENT AUTHORITATIVE STATE (private DM view; do not dump it): ${JSON.stringify({ puzzle: dmPuzzleContext(state), backgroundContextId: `${state.id}:${state.scene.id}:${state.revision}`, players: state.players, characters: state.characters, chapter: state.chapter, clues: state.clues, scene: state.scene.description, pendingCheck: state.pendingCheck, lastRoll: state.lastRoll, rollDecision: state.rollDecision, recentJournal: state.journal.slice(-16), phase: state.phase })}\n\nPRIVATE ISLAND CHART — INTERNAL ORIENTATION, NOT A PLAYER HANDOUT: ${JSON.stringify(campaignMapContext(state))}\n\nREVISED CAMPAIGN, DM-ONLY — DO NOT REVEAL FUTURE CHAPTERS OR ANSWERS:\n${story}`;
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
      "Ask for a real D6 check; await the server roll before narrating success. Dangerous failure costs 1 HP.",
    parameters: jsonSchema(checkSchema),
  },
  {
    type: "function",
    name: "update_party",
    description:
      "Record earned or used items, healing, non-roll consequences and newly revealed clues. Never duplicate server roll damage. Advance chapter only after its story is played.",
    parameters: jsonSchema(consequencesSchema),
  },
  {
    type: "function",
    name: "illustrate_scene",
    description:
      "Update the shared scene and enqueue an illustration for a major visual change, without waiting for rendering. Never expose spoilers.",
    parameters: jsonSchema(publicSceneSchema),
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
  check: checkSchema.nullable(),
  consequences: consequencesSchema.nullable(),
  scene: publicSceneSchema.nullable(),
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
        "\nReturn a structured turn with narration and optional check, consequences and scene plus a background task list (empty if unnecessary). Use null for changes that did not happen. If the action needs dice, do not narrate its outcome and do not apply its consequences yet. The initial shipwreck illustration is already provided; do not generate the opening image again.",
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
