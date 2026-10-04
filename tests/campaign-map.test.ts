import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { campaignMap, campaignMapContext } from "../server/campaign-map.js";
import { initialState } from "../server/game.js";
import { puzzles, projectRoom } from "../server/puzzles.js";
import { instructions } from "../server/dm.js";

test("the private island graph connects the rescue route and all five evidence gates", () => {
  const ids = new Set(campaignMap.nodes.map((n) => n.id));
  assert.equal(ids.size, campaignMap.nodes.length);
  assert.ok(existsSync(campaignMap.map_file));
  for (const e of campaignMap.edges) {
    assert.ok(ids.has(e.from) && ids.has(e.to));
    assert.ok(e.travel_minutes > 0);
  }
  const reached = new Set([campaignMap.chapter_anchor[0]]);
  for (let i = 0; i < ids.size; i++)
    for (const e of campaignMap.edges)
      if (reached.has(e.from)) reached.add(e.to);
  assert.deepEqual(reached, ids);
  assert.deepEqual(
    new Set(
      campaignMap.edges.flatMap((e) => (e.gate ? [e.gate.puzzle_id] : [])),
    ),
    new Set(puzzles.map((p) => p.id)),
  );
});

test("the DM receives compact spatial context; players and illustration workers do not", () => {
  const state = initialState("map-proof");
  const player = { id: "a", name: "Student", characterId: "sam" as const };
  state.players = [player];
  state.chapter = 1;
  const context = campaignMapContext(state);
  assert.equal(context.area.id, "palm_camp");
  assert.ok(context.nearby_routes.some((e) => e.to === "nine_stone_crossing"));
  assert.ok(instructions(state).includes("PRIVATE ISLAND CHART"));
  assert.ok(
    !JSON.stringify(projectRoom(state, player)).includes("island_locations"),
  );
  assert.ok(!JSON.stringify(state).includes("chapter_anchor"));
  for (const p of puzzles)
    for (const evidence of [p.sam, p.liz])
      assert.ok(!JSON.stringify(campaignMap).includes(evidence.answers[0]));
  state.chapter = 2;
  state.scene.location = "Keeper's Archive";
  assert.equal(campaignMapContext(state).area_is_chapter_anchor, false);
  const gate = campaignMapContext(state).nearby_routes.find((e) => e.gate);
  assert.equal(gate?.gate?.solved, false);
  state.puzzles![2].solved = true;
  assert.equal(
    campaignMapContext(state).nearby_routes.find((e) => e.gate)?.gate?.solved,
    true,
  );
});
