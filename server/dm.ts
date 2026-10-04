import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { checkSchema, consequencesSchema, sceneSchema } from "./game.js";
import type { RoomState } from "../shared/types.js";
const story = [
  ...readdirSync(".")
    .filter((f) => /^\d.*\.md$/.test(f))
    .sort(),
  ...readdirSync("Encounters")
    .filter((f) => f.endsWith(".md"))
    .map((f) => `Encounters/${f}`),
]
  .map((f) => `\n--- ${f} ---\n${readFileSync(resolve(f), "utf8")}`)
  .join("\n");
export const artDirection =
  "Cinematic painterly survival-adventure concept art, grounded and atmospheric, detailed natural materials, tropical island, deep teal shadows and warm sand and copper highlights. Wide landscape, no lettering, no watermark, no UI. Only depict what the players have encountered; no future spoilers. Character consistency: Sam is a rugged middle-aged outdoor guide in a worn olive shirt; Liz is a middle-aged archaeologist in a light linen shirt; Emily is their sixteen-year-old daughter in a practical teal jacket. All are fictional; never sexualize the teenager.";
export function instructions(state: RoomState) {
  return `You are the Dungeon Master of THE WHISPERING SANDS for two human players, Rafael and Meg. Everything you say, including tool-facing titles and journal text, must be in English. Be a warm, expressive, suspenseful storyteller. The voice is AI-generated. Keep each narration to 40–100 words, one meaningful beat, then invite a choice. Take questions and natural conversation. Do not railroad the players or decide their actions. Use the original story below as the campaign canon, keep puzzles secret until discovered, and improvise within that story.\n\nThe humans play Sam and Liz (player names and assignment are in the state). Emily is your NPC companion, not a third human: let her help or offer hints, never solve a puzzle or dictate choices. Let the players discover solutions through dialogue. Do not demand dice for every action or conversation. Dice are D6 + STR/INT/SUR, total >= target, normally 7. Only request_check may ask for a roll. The server supplies true random rolls and applies 1 HP of harm on dangerous failure. Never invent dice, success or HP. Emily's checks are rolled by the server. If a check is pending, invite the assigned player to click Roll; wait for its authoritative result before narrating an outcome. A failed roll should lead to a setback and another path, not a dead end. A player may reroll a failed check once for 1 HP through the UI; accept the new authoritative result.\n\nUse update_party only for actual discoveries, used items, explicit healing, non-roll consequences, revealed clues, or chapter progress. Do not duplicate damage applied by a failed roll. All characters start with 10 HP. Never advance more than one chapter at a time. Chapter 5 means curse broken AND rescue, so only advance there when both have happened. Never narrate an item being acquired without recording it. Never reveal an unencountered riddle or answer in a clue or an image. Use illustrate_scene on a substantial location change or visual event; once per response at most, not each sentence. State the scene accurately; images render asynchronously, so continue the dialogue. Keep initial exposition brief and let both players act. Keep the mystery, survival, relationship, humour and 90-minute adventure pacing of the source.\n\nCURRENT AUTHORITATIVE STATE (private DM view; do not dump it): ${JSON.stringify({ players: state.players, characters: state.characters, chapter: state.chapter, clues: state.clues, scene: state.scene.description, pendingCheck: state.pendingCheck, lastRoll: state.lastRoll, rollDecision: state.rollDecision, recentJournal: state.journal.slice(-16), phase: state.phase })}\n\nORIGINAL CAMPAIGN, DM-ONLY — DO NOT REVEAL FUTURE CHAPTERS OR ANSWERS:\n${story}`;
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
    parameters: jsonSchema(sceneSchema),
  },
];
export const turnSchema = z.object({
  narration: z.string().min(1).max(2400),
  check: checkSchema.nullable(),
  consequences: consequencesSchema.nullable(),
  scene: sceneSchema.nullable(),
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
        "\nReturn a structured turn with narration and optional check, consequences and scene. Use null for changes that did not happen. If the action needs dice, do not narrate its outcome and do not apply its consequences yet. The initial shipwreck illustration is already provided; do not generate the opening image again.",
      input: [
        {
          role: "user",
          content: `Recent public journal: ${JSON.stringify(state.journal.slice(-24))}\nCurrent player input: ${message}`,
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
