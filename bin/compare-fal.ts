// Explicit paid experiment, never part of npm test. Maximum three calls per run.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { initialState, setScene } from "../server/game.js";
import {
  availableReferences,
  illustrationPrompt,
  readCatalog,
} from "../server/workers.js";

const options = new Map(
  process.argv.slice(2).map((arg) => {
    const [name, ...value] = arg.split("=");
    return [name, value.join("=")];
  }),
);
const allowedOptions = new Set([
  "--models",
  "--seed",
  "--label",
  "--scene",
  "--explicit-roles",
  "--inline",
  "--size",
  "--revision",
]);
assert.ok(
  [...options.keys()].every((name) => allowedOptions.has(name)),
  "Unknown experiment option.",
);
assert.ok(
  [undefined, "arch", "continuation"].includes(options.get("--scene")),
  "Unknown scene case.",
);
const [width, height] = (options.get("--size") ?? "1536x1024")
  .split("x")
  .map(Number);
assert.ok(
  [width, height].every(
    (n) => Number.isInteger(n) && n >= 512 && n <= 2048 && n % 16 === 0,
  ),
);
const models: Record<string, string> = {
  "klein-4b": "fal-ai/flux-2/klein/4b/edit",
  "klein-9b": "fal-ai/flux-2/klein/9b/edit",
  turbo: "fal-ai/flux-2/turbo/edit",
};
const selected = (options.get("--models") ?? "klein-4b,klein-9b,turbo").split(
  ",",
);
assert.ok(selected.length > 0 && selected.length <= 3);
assert.equal(new Set(selected).size, selected.length);
assert.ok(selected.every((name) => models[name]));
const seed = Number(options.get("--seed") ?? 42);
assert.ok(Number.isSafeInteger(seed) && seed >= 0);
const label = options.get("--label") ?? "screening";
assert.match(label, /^[a-z0-9-]{1,50}$/);
const key = process.env.FAL_KEY;
assert.ok(
  key,
  "Load the existing private FAL_KEY before this paid experiment.",
);
const directory = resolve("output/verification/fal", label);
mkdirSync(directory, { recursive: true });

const state = initialState("image-comparison-only");
setScene(state, {
  title: "Three records, one discovery",
  location: "Shipwreck shore beneath the island palms",
  description:
    "Sam, Liz and their sixteen-year-old daughter Emily sit together by a driftwood shelter on the wrecked shore. Sam holds a weathered compass, Liz studies a field notebook and Emily points toward a distant old stone arch. They compare the salvage records in soft morning light. Ordinary practical clothes and attentive, relaxed expressions.",
  visualPrompt: "Comparison only",
});
if (options.get("--scene") === "arch") {
  state.scene.title = "The old arch in the mist";
  state.scene.location = "Fern-covered path beyond the low-tide crossing";
  state.scene.description =
    "Sam, Liz and their sixteen-year-old daughter Emily walk together toward a weathered stone arch on a misty island path. Sam carries a compass in his hand, Liz holds her closed field notebook, and Emily in her practical teal jacket looks up at the arch. Whole figures in the landscape, no portrait panels. Wet fern leaves, sea-grey morning light, ordinary practical clothes. The arch contains no readable inscription.";
}
const catalog = readCatalog();
const assets = availableReferences(state, catalog);
assert.deepEqual(
  new Set(assets.map((a) => a.id)),
  new Set(["coastal-field-study", "sam", "liz", "emily"]),
);
const explicitRoles = options.get("--explicit-roles") === "true";
const inline = options.get("--inline") === "true";
let prompt = explicitRoles
  ? `Create one new wide landscape scene. Image 1 is STYLE ONLY: match its matte gouache, sparse graphite, broken dry-brush pigment and warm ivory paper texture. Image 2 is Sam's exact identity: a middle-aged father with salt-and-pepper hair, stubble and olive shirt. Image 3 is Liz's exact identity: a MIDDLE-AGED MOTHER and archaeologist, visibly older than her daughter, with mature facial proportions, natural age lines, loosely tied brown hair and pale linen shirt. Image 4 is Emily's exact identity: their SIXTEEN-YEAR-OLD daughter, freckles, brown ponytail, practical teal jacket. Keep all three distinct and preserve their referenced faces. ${state.scene.description} Emily's pointing hand must point toward the distant arch, away from the notebook, when the scene requires that gesture. Use only the scene's actions, without inventing props, inscriptions or events. No text or lettering, no collage, no separate portrait panels. Preserve the rough gouache texture rather than smoothing it into a glossy render.`
  : illustrationPrompt(state, catalog, assets);
const hash = (data: string | Buffer) =>
  createHash("sha256").update(data).digest("hex");
const revision =
  options.get("--revision") ??
  execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
assert.match(revision, /^[a-f0-9]{40}$/);
// Public base assets at an immutable Git revision. No per-frame upload or player data.
let references = assets.map((a) => ({
  id: a.id,
  path: a.path,
  sha256: hash(readFileSync(resolve("public", a.path.slice(1)))),
  url: `https://raw.githubusercontent.com/raffareis/TheWhisperingSands/${revision}/public${a.path}`,
}));
let imageUrls = references.map((a) => a.url);
const preflightStart = performance.now();
if (options.get("--scene") === "continuation") {
  // This is the previously generated synthetic QA frame, never a player record or map.
  const proof = JSON.parse(
    readFileSync("output/verification/sunburst-composition.json", "utf8"),
  );
  const match = proof.scene.match(
    /^\/api\/rooms\/([a-z0-9]+)\/images\/([a-f0-9-]+\.webp)$/,
  );
  assert.ok(
    match,
    "Existing composition proof is required for this separate edit experiment.",
  );
  const path = resolve("data/images", match[1], match[2]);
  const bytes = readFileSync(path);
  references = [
    {
      id: "previous-approved-qa-scene",
      path,
      sha256: hash(bytes),
      url: "inline-reference",
    },
  ];
  imageUrls = [`data:image/webp;base64,${bytes.toString("base64")}`];
  prompt =
    "Edit this existing gouache scene for the next small narrative beat. Keep exactly the same THREE characters and their identities: middle-aged Sam on the left, middle-aged Liz in the centre, and sixteen-year-old Emily on the right. Emily has LOWERED her pointing arm and now rests that hand on her lap. Keep Sam holding the compass and Liz studying the notebook as before. Preserve all three faces, clothes, ages, the shoreline, stone arch, driftwood shelter, camera framing and especially the existing rough dry-brush gouache and graphite texture. Change only Emily's arm pose; do not add people, props, text or discoveries. Produce the next single full scene, not a collage.";
} else {
  await Promise.all(
    references.map(async (a) => {
      const response = await fetch(a.url, {
        signal: AbortSignal.timeout(20000),
      });
      assert.ok(response.ok, `Public base reference unavailable: ${a.id}`);
      assert.equal(hash(Buffer.from(await response.arrayBuffer())), a.sha256);
    }),
  );
}
const setupMs = Math.round(performance.now() - preflightStart);
writeFileSync(resolve(directory, "prompt.txt"), prompt);
for (const name of selected) {
  const reportPath = resolve(directory, `${name}.json`);
  const outputPath = resolve(directory, `${name}.webp`);
  const input = {
    prompt,
    image_urls: imageUrls,
    image_size: { width, height },
    num_images: 1,
    seed,
    output_format: "webp",
    enable_safety_checker: true,
    ...(inline ? { sync_mode: true } : {}),
    ...(name === "turbo"
      ? { enable_prompt_expansion: false, guidance_scale: 2.5 }
      : { num_inference_steps: 4 }),
  };
  const inputHash = hash(JSON.stringify(input));
  if (existsSync(reportPath)) {
    const prior = JSON.parse(readFileSync(reportPath, "utf8"));
    assert.equal(
      prior.input_sha256,
      inputHash,
      "Use a new label for changed inputs.",
    );
    assert.equal(
      prior.status,
      "ready",
      "Reconcile failed or pending requests before retrying.",
    );
    assert.ok(existsSync(outputPath));
    assert.equal(
      hash(readFileSync(outputPath)),
      prior.output.sha256,
      "Output changed; inspect before reusing proof.",
    );
    console.log(
      JSON.stringify({
        model: name,
        reused: true,
        duration_ms: prior.total_ms,
      }),
    );
    continue;
  }
  const report = {
    status: "submitted",
    model: models[name],
    seed,
    explicit_roles: explicitRoles,
    inline_output: inline,
    scene_case: options.get("--scene") ?? "composition",
    input_sha256: inputHash,
    prompt_sha256: hash(prompt),
    references,
    setup_ms: setupMs,
    submitted_at: new Date().toISOString(),
  };
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  const start = performance.now();
  try {
    const response = await fetch(`https://fal.run/${models[name]}`, {
      method: "POST",
      headers: {
        Authorization: `Key ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(90000),
    });
    const result = await response.json();
    const generationMs = Math.round(performance.now() - start);
    assert.ok(
      response.ok,
      `fal endpoint returned HTTP ${response.status}; no automatic retry.`,
    );
    assert.ok(
      !result.has_nsfw_concepts?.some(Boolean),
      "Image rejected by safety checker.",
    );
    const file = result.images?.[0];
    assert.ok(file?.url, "Provider returned no image.");
    const downloadStart = performance.now();
    let bytes: Buffer;
    if (file.url.startsWith("data:")) {
      assert.ok(file.url.startsWith("data:image/webp;base64,"));
      bytes = Buffer.from(file.url.slice(file.url.indexOf(",") + 1), "base64");
    } else {
      const download = await fetch(file.url, {
        signal: AbortSignal.timeout(20000),
      });
      assert.ok(
        download.ok,
        "Generated image download failed; generation must not be resubmitted.",
      );
      bytes = Buffer.from(await download.arrayBuffer());
    }
    writeFileSync(outputPath, bytes);
    const completed = {
      ...report,
      status: "ready",
      request_id:
        response.headers.get("x-fal-request-id") ??
        response.headers.get("x-request-id"),
      generation_ms: generationMs,
      download_ms: Math.round(performance.now() - downloadStart),
      total_ms: Math.round(performance.now() - start),
      timings: result.timings,
      output: {
        path: outputPath,
        width: file.width,
        height: file.height,
        bytes: bytes.length,
        sha256: hash(bytes),
        url: file.url.startsWith("data:") ? "inline-data-uri" : file.url,
      },
    };
    writeFileSync(reportPath, JSON.stringify(completed, null, 2));
    console.log(
      JSON.stringify({
        model: name,
        generation_ms: completed.generation_ms,
        total_ms: completed.total_ms,
        inference_s: result.timings?.inference,
        output: outputPath,
      }),
    );
  } catch (error) {
    writeFileSync(
      reportPath,
      JSON.stringify(
        {
          ...report,
          status: "error",
          error: error instanceof Error ? error.message : "Request failed",
          elapsed_ms: Math.round(performance.now() - start),
        },
        null,
        2,
      ),
    );
    throw error;
  }
}
