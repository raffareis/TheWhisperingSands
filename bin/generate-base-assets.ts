/** Explicit paid Sunburst edits. Uses the installed imagegen skill CLI, never an SDK clone.
 * taskctl start --timeout 3600 -- node --import tsx bin/generate-base-assets.ts --all
 * Inspect every output before --activate. Existing outputs are never overwritten.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const art = resolve(root, "public/art");
const output = resolve(root, "output/imagegen-sunburst");
const cli =
  process.env.IMAGEGEN_CLI ??
  resolve(homedir(), ".codex/skills/imagegen/scripts/image_gen.py");
const model = "gpt-image-2.5-sunburst";
const ids = [
  "coastal-field-study",
  "shipwreck",
  "sam",
  "liz",
  "emily",
  "pocket-knife",
  "field-notebook",
  "ancient-talisman",
] as const;
type AssetId = (typeof ids)[number];
const style =
  "Distinctly hand-painted matte gouache with sparse graphite and scratched ink on warm ivory paper. Visible dry brush and pigment texture, simplified masses, careful observed details, restrained sea-grey, dusty eucalyptus/olive, raw umber and pale ochre. Intimate archaeological field journal illustration, not a photograph, not glossy 3D or fantasy concept art. No words, lettering, numbers, logos, watermark or interface.";
const subjects: Record<AssetId, string> = {
  "coastal-field-study":
    "Image 1 is the target and approved composition: a post-storm tropical shore, wrecked small boat planks and rope in the left foreground, quiet grey waves, wet sand, misty forested rocky cliffs, carved tree on right. Preserve this geography and calm asymmetrical composition, no characters. Refine into the canonical painted field-journal plate. Broad pale sky, brush masses, paper visible at the edges, fine wood details. Do not add objects, magical light, talismans, buildings or spectacular sunbeams.",
  shipwreck:
    "Image 1 is the geographical reference of the storm-wrecked shore. Image 2 is the canonical Sunburst painting-style reference. Repaint the opening scene in exactly that matte gouache language: scattered wreck timber and rope, grey ocean, wet beach, jungle edge with the existing carved tree and misty cliffs. Preserve the geography and existing carving motif, remove theatrical golden sunbeams in favour of overcast soft morning. No people or talisman, no new plot clues, no buildings.",
  sam: "Image 1 is Samuel's canonical identity reference. Image 2 is the painting-style reference only. Preserve this specific fictional middle-aged man's face, features, short salt-and-pepper hair and stubble, weathered olive field shirt and practical backpack straps. Transform the photo-like rendering into the same matte gouache/graphite field illustration as image 2. Chest-up square portrait, whole head visible, eyes in upper third, subdued forest and mist background. Kind, alert, ordinary resilient father and outdoor guide, not a superhero. No accessories added.",
  liz: "Image 1 is Elizabeth's canonical identity reference. Image 2 is the painting-style reference only. Preserve this specific fictional middle-aged woman's face, features, brown eyes, loosely tied brown hair, pale linen field shirt, practical shoulder straps and warm thoughtful expression. Transform into matte gouache/graphite field illustration matching image 2. Chest-up square portrait, whole head visible, eyes in upper third, subdued island foliage and mist background. She is a capable archaeologist and Emily's mother. No makeup glamour, no new accessories. Remove the decorative pendant so it cannot be mistaken for the story's talisman.",
  emily:
    "Image 1 is Emily's canonical identity reference. Image 2 is painting-style reference only. Preserve this fictional girl's recognizable face, brown eyes, freckles, brown ponytail, practical teal outdoor jacket and backpack straps. She is SIXTEEN YEARS OLD, the teenage daughter of Sam and Liz: clearly a youthful ordinary teen, soft adolescent facial proportions, no adult face ageing, no makeup. Curious, observant and brave. Fully clothed practical outdoor look. Chest-up square portrait, whole head visible and eyes in upper third. Repaint into matte gouache and graphite matching image 2 with subdued island foliage and mist. No mature fashion styling, no heroic armour, no new accessories.",
  "pocket-knife":
    "Image 1 is the canonical object shape and materials. Image 2 is the painting-style reference only; do not transfer its landscape or paper background. Preserve a single practical folding pocketknife with half-open scratched steel blade, weathered walnut handle and brass rivets. Repaint as a carefully observed graphite and matte gouache specimen with simplified brush texture. Complete object centered diagonally inside a square with generous margins. Preserve genuine transparent alpha outside object. No ground, no background, no shadow aura, no added props.",
  "field-notebook":
    "Image 1 is the canonical object reference. Image 2 is the painting-style reference only; do not transfer landscape or paper background. Preserve the closed salt-stained notebook: worn olive-brown cloth cover, faded red linen spine, wavy cream pages, elastic band and one graphite pencil beneath it. Repaint as a tactile matte gouache/graphite specimen. Square composition, single entire notebook and pencil centered with generous margins. Genuine transparent alpha outside object, no ground or shadow aura. No readable text, marks implying a puzzle answer, or added props.",
  "ancient-talisman":
    "Image 1 is the canonical object's exact silhouette, carving and materials. Image 2 is painting-style reference only; do not transfer landscape or paper background. Preserve the irregular palm-sized dark bronze pendant, suspension hole and small broken plant cord, single spiral and three carved waves, verdigris in incisions and rubbed metal edges. Repaint as a precise matte gouache/graphite specimen. Do not change the carving; decorative motif only, no encoded answer. Center whole object within square with clear margins. Genuine transparent alpha outside object, no background, ground, glow or shadow aura, no gemstones or additional props.",
};
const outputPath = (id: AssetId) => resolve(art, `${id}-sunburst.webp`);
const reportPath = (id: AssetId) => resolve(output, `${id}.json`);
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
function prompt(id: AssetId) {
  return `Use case: illustration-story\nAsset type: canonical base asset for The Whispering Sands\n${subjects[id]}\nStyle: ${style}`;
}
async function generate(id: AssetId) {
  if (existsSync(outputPath(id))) {
    if (!existsSync(reportPath(id))) {
      const manifest = JSON.parse(
        readFileSync(resolve(art, "base-assets.json"), "utf8"),
      );
      const receipt = manifest.assets.find(
        (a: { id: string }) => a.id === id,
      )?.provenance;
      if (
        receipt?.model !== model ||
        receipt.output_sha256 !== hash(outputPath(id))
      )
        throw new Error(
          `Existing image without a matching generation receipt: ${id}. Reconcile before another paid call.`,
        );
      writeFileSync(reportPath(id), JSON.stringify(receipt, null, 2) + "\n", {
        mode: 0o600,
      });
    }
    const receipt = JSON.parse(readFileSync(reportPath(id), "utf8"));
    if (receipt.output_sha256 !== hash(outputPath(id)))
      throw new Error(`Output hash changed: ${id}. Inspect before reuse.`);
    console.log(`Reusing completed ${id}.`);
    return;
  }
  const source = resolve(art, `${id}.png`);
  if (!existsSync(source))
    throw new Error(`Original reference is missing: ${source}`);
  const refs = [source];
  if (id !== "coastal-field-study")
    refs.push(outputPath("coastal-field-study"));
  for (const ref of refs)
    if (!existsSync(ref)) throw new Error(`Reference missing: ${ref}`);
  const size = ["coastal-field-study", "shipwreck"].includes(id)
    ? "1536x1024"
    : "1024x1024";
  const background = [
    "pocket-knife",
    "field-notebook",
    "ancient-talisman",
  ].includes(id)
    ? "transparent"
    : "opaque";
  const fullPrompt = prompt(id);
  const promptPath = resolve(output, `${id}.txt`);
  writeFileSync(promptPath, fullPrompt, { mode: 0o600 });
  const args = [
    "run",
    "--with",
    "openai",
    "--with",
    "pillow",
    "python",
    cli,
    "edit",
    "--model",
    model,
    "--quality",
    "medium",
    "--size",
    size,
    "--background",
    background,
    "--output-format",
    "webp",
    "--output-compression",
    "90",
    "--max-attempts",
    "2",
    "--no-augment",
    "--prompt-file",
    promptPath,
    "--out",
    outputPath(id),
    ...refs.flatMap((path) => ["--image", path]),
  ];
  const started = Date.now();
  console.log(`Generating ${id} with ${model}.`);
  const chunks: string[] = [];
  const child = spawn("uv", args, {
    cwd: root,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const terminate = () => child.kill("SIGTERM");
  process.once("SIGTERM", terminate);
  process.once("SIGINT", terminate);
  child.stdout.on("data", (data) => chunks.push(String(data)));
  child.stderr.on("data", (data) => chunks.push(String(data)));
  const code = await new Promise<number | null>((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("close", resolvePromise);
  });
  process.removeListener("SIGTERM", terminate);
  process.removeListener("SIGINT", terminate);
  const log = chunks.join("");
  writeFileSync(resolve(output, `${id}.log`), log, { mode: 0o600 });
  if (code !== 0)
    throw new Error(
      `${id} CLI exited ${code}; inspect private output/imagegen-sunburst/${id}.log before retrying.`,
    );
  if (!existsSync(outputPath(id)))
    throw new Error(`${id} returned without an output file.`);
  const metrics = log.split("\n").flatMap((line) => {
    try {
      return [JSON.parse(line) as Record<string, unknown>];
    } catch {
      return [];
    }
  });
  const receipt = {
    mode: "imagegen CLI/API",
    model,
    quality: "medium",
    size,
    background,
    output_format: "webp",
    output_compression: 90,
    generated_at: new Date().toISOString(),
    duration_ms: Date.now() - started,
    prompt: fullPrompt,
    reference_ids: id === "coastal-field-study" ? [] : ["coastal-field-study"],
    source_references: refs.map((path) => ({
      path: `/art/${path.split("/").at(-1)}`,
      sha256: hash(path),
    })),
    metrics,
    output_sha256: hash(outputPath(id)),
  };
  writeFileSync(reportPath(id), JSON.stringify(receipt, null, 2) + "\n", {
    mode: 0o600,
  });
  console.log(`Completed ${id} in ${Math.round(receipt.duration_ms / 1000)}s.`);
}
const requested = process.argv.slice(2);
mkdirSync(output, { recursive: true, mode: 0o700 });
if (requested[0] === "--activate") {
  const manifestPath = resolve(art, "base-assets.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  for (const id of ids) {
    if (!existsSync(outputPath(id)) || !existsSync(reportPath(id)))
      throw new Error(`Incomplete library: ${id}`);
    const asset = manifest.assets.find((a: { id: string }) => a.id === id);
    if (!asset) throw new Error(`Missing manifest entry ${id}`);
    asset.path = `/art/${id}-sunburst.webp`;
    asset.provenance = JSON.parse(readFileSync(reportPath(id), "utf8"));
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log("Activated complete Sunburst manifest.");
} else {
  const selected =
    requested[0] === "--all"
      ? [...ids]
      : requested.filter((id): id is AssetId => ids.includes(id as AssetId));
  if (
    !selected.length ||
    (requested[0] !== "--all" && selected.length !== requested.length)
  )
    throw new Error(
      `Specify --all or asset IDs: ${ids.join(", ")}. This command makes paid API calls.`,
    );
  if (process.env.OPENAI_ENV_FILE)
    process.loadEnvFile(process.env.OPENAI_ENV_FILE);
  if (!process.env.OPENAI_API_KEY)
    throw new Error(
      "Set OPENAI_API_KEY or OPENAI_ENV_FILE in the private environment.",
    );
  if (selected.includes("coastal-field-study"))
    await generate("coastal-field-study");
  const queue = selected.filter((id) => id !== "coastal-field-study");
  let failure = false;
  const results = await Promise.allSettled(
    Array.from({ length: Math.min(2, queue.length) }, async () => {
      while (queue.length && !failure) {
        const id = queue.shift()!;
        try {
          await generate(id);
        } catch (error) {
          failure = true;
          throw error;
        }
      }
    }),
  );
  const rejected = results.find((result) => result.status === "rejected");
  if (rejected?.status === "rejected") throw rejected.reason;
}
