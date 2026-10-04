import map from "./campaign-map.json";
import type { RoomState } from "../shared/types.js";

export const campaignMap = map;

// Read the structured chart once. No vision call or repeated SVG payload per turn.
export function campaignMapContext(state: RoomState) {
  const description =
    `${state.scene.title} ${state.scene.location}`.toLowerCase();
  const encountered = map.nodes.filter((n) => n.first_chapter <= state.chapter);
  const area =
    encountered.find((n) => description.includes(n.label.toLowerCase())) ??
    map.nodes.find((n) => n.id === map.chapter_anchor[state.chapter])!;
  const routes = map.edges
    .filter((e) => e.from === area.id || e.to === area.id)
    .map((e) => ({
      from: e.from,
      to: e.to,
      travel_minutes: e.travel_minutes,
      tide: e.tide,
      gate: e.gate
        ? {
            puzzle_id: e.gate.puzzle_id,
            solved: !!state.puzzles?.find((p) => p.id === e.gate!.puzzle_id)
              ?.solved,
          }
        : null,
      description: e.description,
    }));
  return {
    visibility: "DM only; never display or dictate the chart to players",
    orientation: map.orientation,
    island_locations: map.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      position: n.position,
      first_chapter: n.first_chapter,
    })),
    area,
    area_is_chapter_anchor: !description.includes(area.label.toLowerCase()),
    anchor_policy:
      "A chapter anchor is an orientation fallback, never proof that the party moved. Use the current scene and journal for actual position. Reveal only encountered places or the stated visible silhouettes.",
    nearby_routes: routes,
    sightlines: map.sightlines.filter((s) => s.from === area.id),
    tide_policy: map.tide_rules.dm_policy,
  };
}
