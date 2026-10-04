/** One paid contact sheet, via the installed imagegen CLI.
 * OPENAI_ENV_FILE=/private/.env taskctl start --timeout 900 -- node --import tsx bin/generate-inventory-assets.ts --generate
 * Inspect output/imagegen-inventory/inventory-specimens-sunburst.webp before:
 * node --import tsx bin/generate-inventory-assets.ts --activate <inspected SHA-256>
 * A started checkpoint is never retried automatically; existing files are never overwritten.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  constants,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "output/imagegen-inventory");
const id = "inventory-specimens";
const filename = `${id}-sunburst.webp`;
const candidate = resolve(output, filename);
const destination = resolve(root, "public/art", filename);
const reference = resolve(root, "public/art/coastal-field-study-sunburst.webp");
const checkpoint = resolve(output, "checkpoint.json");
const receiptPath = resolve(output, "receipt.json");
const model = "gpt-image-2.5-sunburst";
const prompt = `Use case: illustration-story
Asset type: public inventory specimen sprite sheet for The Whispering Sands.
Input image 1 is ONLY a painting-style reference: borrow matte gouache, graphite, warm ivory paper, olive green, sea grey, raw umber and pale ochre. Do NOT copy its landscape, coast, trees, carvings or composition.
Create ONE square 1024x1024 contact sheet with exactly NINE isolated objects, arranged in an EXACT equal 3-column by 3-row grid, no gutters or drawn grid lines. Each cell occupies exactly one third of the width and height. Object centers in pixels: (171,171), (512,171), (853,171); (171,512), (512,512), (853,512); (171,853), (512,853), (853,853). Each entire object must stay within the middle 70 percent of its own cell, including all shadows. Leave clean paper between objects. Consistent softly lit top-down specimen view, no overlap.
Row 1 left to right: a single angular dark grey flint spark stone with chipped facets; neatly folded weathered olive canvas shelter cloth; a compact coil of ochre hemp rope.
Row 2 left to right: a small worn brass compass with an unlettered ivory face and one simple dark needle, no directional letters or numerals; a single blank ivory sheet of copied chart paper, lightly folded and salt worn, entirely unmarked, no map or symbols; a closed worn archive log book, grey-green cloth cover, cream page edges, no writing, no pencil.
Row 3 left to right: a circular pale sea-green glass signal lens in a weathered brass rim, subtle concentric glass ridges, no glow; a single plain round brass token, completely blank on both sides, no marks or carvings; one short sharpened graphite pencil with plain olive-painted wooden barrel, diagonally centered, no writing or lettering.
Style: tactile matte gouache and sparse graphite on evenly colored warm ivory paper, restrained pigment, visible dry brush, credible small field objects. Strong distinct silhouettes legible as small inventory pictures. Flat quiet paper background, no scenery, no surface horizon, no frames.
Text: NONE. No words, labels, letters, numbers, glyphs, logos, watermarks, interface, puzzle clues, solutions, routes, diagrams, map, narrative or people. The chart and token must be BLANK. Only these nine objects, no extra props.`;
const cells = [
  { row: 0, column: 0, subject: "flint", item_ids: ["rescue-flint"] },
  { row: 0, column: 1, subject: "folded-canvas", item_ids: ["rescue-canvas"] },
  { row: 0, column: 2, subject: "rope-coil", item_ids: ["rescue-rope"] },
  { row: 1, column: 0, subject: "compass", item_ids: ["rescue-compass"] },
  { row: 1, column: 1, subject: "blank-chart", item_ids: ["tide-chart"] },
  { row: 1, column: 2, subject: "archive-log", item_ids: ["keeper-log"] },
  { row: 2, column: 0, subject: "signal-lens", item_ids: ["signal-lens"] },
  {
    row: 2,
    column: 1,
    subject: "blank-brass-token",
    item_ids: ["word-we", "word-will", "word-find", "word-home"],
  },
  { row: 2, column: 2, subject: "pencil", item_ids: [] },
];
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const save = (path: string, value: unknown) =>
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", {
    mode: 0o600,
    flag: "wx",
  });
const [mode, inspectedHash] = process.argv.slice(2);
mkdirSync(output, { recursive: true, mode: 0o700 });

if (mode === "--activate") {
  const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
  if (
    inspectedHash !== receipt.output_sha256 ||
    hash(candidate) !== inspectedHash
  )
    throw new Error(
      "Activation requires the inspected candidate's matching SHA-256.",
    );
  const manifestPath = resolve(root, "public/art/base-assets.json");
  const original = readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(original);
  const existing = manifest.assets.find(
    (asset: { id: string }) => asset.id === id,
  );
  if (
    existing &&
    (existing.provenance?.output_sha256 !== inspectedHash ||
      existing.path !== `/art/${filename}`)
  )
    throw new Error(
      "Existing manifest entry differs; reconcile before activation.",
    );
  if (existsSync(destination)) {
    if (hash(destination) !== inspectedHash)
      throw new Error("Refusing to overwrite existing public asset.");
  } else copyFileSync(candidate, destination, constants.COPYFILE_EXCL);
  if (!existing) {
    const entry = {
      id,
      path: `/art/${filename}`,
      role: "inventory-sheet",
      tags: ["inventory", "specimens", "gouache"],
      visual_description:
        "Nine isolated inventory specimens on ivory paper in a 3×3 grid. UI sprite sheet only: crop a cell for individual objects; never use the entire plate as a scene. Blank chart and brass token contain no game information.",
      grid: { rows: 3, columns: 3, cells },
      provenance: receipt,
    };
    // Append just this entry, preserving unrelated manifest formatting and metadata.
    const end = original.lastIndexOf("]");
    if (end < 0) throw new Error("Invalid manifest array.");
    const addition = JSON.stringify(entry, null, 2)
      .split("\n")
      .map((line) => `    ${line}`)
      .join("\n");
    const updated =
      original.slice(0, end).trimEnd() +
      ",\n" +
      addition +
      "\n  " +
      original.slice(end);
    JSON.parse(updated);
    writeFileSync(manifestPath, updated);
  }
  console.log(`Activated ${destination}; SHA-256 ${inspectedHash}`);
} else if (mode === "--generate" || mode === "--dry-run") {
  if (existsSync(receiptPath)) {
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    if (hash(candidate) !== receipt.output_sha256)
      throw new Error("Candidate hash changed.");
    console.log(
      `Reusing completed candidate: ${candidate}; SHA-256 ${receipt.output_sha256}`,
    );
    process.exit(0);
  }
  if (
    existsSync(checkpoint) ||
    existsSync(candidate) ||
    existsSync(destination)
  )
    throw new Error(
      "Prior attempt/output exists. Reconcile its effects; no automatic paid retry.",
    );
  const referenceHash = hash(reference);
  const promptPath = resolve(output, "prompt.txt");
  writeFileSync(promptPath, prompt, { mode: 0o600 });
  const cli =
    process.env.IMAGEGEN_CLI ??
    resolve(homedir(), ".codex/skills/imagegen/scripts/image_gen.py");
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
    "1024x1024",
    "--background",
    "opaque",
    "--output-format",
    "webp",
    "--output-compression",
    "90",
    "--max-attempts",
    "1",
    "--no-augment",
    "--prompt-file",
    promptPath,
    "--image",
    reference,
    "--out",
    candidate,
  ];
  if (mode === "--dry-run") args.push("--dry-run");
  const env = { ...process.env };
  if (mode === "--generate") {
    if (env.OPENAI_ENV_FILE)
      env.OPENAI_API_KEY = parseEnv(
        readFileSync(env.OPENAI_ENV_FILE, "utf8"),
      ).OPENAI_API_KEY;
    if (!env.OPENAI_API_KEY)
      throw new Error(
        "Missing OpenAI key in the designated private environment.",
      );
    save(checkpoint, {
      status: "started",
      model,
      started_at: new Date().toISOString(),
      max_attempts: 1,
      prompt_sha256: hash(promptPath),
      reference_sha256: referenceHash,
    });
  }
  const started = Date.now();
  const chunks: string[] = [];
  const child = spawn("uv", args, {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const terminate = () => child.kill("SIGTERM");
  process.once("SIGTERM", terminate);
  process.once("SIGINT", terminate);
  child.stdout.on("data", (data) => chunks.push(String(data)));
  child.stderr.on("data", (data) => chunks.push(String(data)));
  const code = await new Promise<number | null>((done, reject) => {
    child.once("error", reject);
    child.once("close", done);
  });
  process.removeListener("SIGTERM", terminate);
  process.removeListener("SIGINT", terminate);
  const log = chunks.join("");
  writeFileSync(
    resolve(output, mode === "--dry-run" ? "dry-run.log" : "generation.log"),
    log,
    { mode: 0o600 },
  );
  if (code !== 0)
    throw new Error(
      `CLI exited ${code}; inspect the private log and reconcile before any retry.`,
    );
  if (mode === "--dry-run") {
    console.log("Dry-run passed; no API request.");
    process.exit(0);
  }
  const metrics = log.split("\n").flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
  const receipt = {
    mode: "imagegen CLI/API",
    model,
    quality: "medium",
    size: "1024x1024",
    background: "opaque",
    output_format: "webp",
    output_compression: 90,
    max_attempts: 1,
    generated_at: new Date().toISOString(),
    duration_ms: Date.now() - started,
    prompt,
    prompt_sha256: hash(promptPath),
    reference_ids: ["coastal-field-study"],
    source_references: [
      {
        path: "/art/coastal-field-study-sunburst.webp",
        sha256: referenceHash,
        role: "style-only",
      },
    ],
    metrics,
    output_sha256: hash(candidate),
  };
  save(receiptPath, receipt);
  console.log(
    `Generated ${candidate} in ${receipt.duration_ms}ms; SHA-256 ${receipt.output_sha256}. Inspect before activation.`,
  );
} else
  throw new Error(
    "Use --dry-run, --generate (one paid call), or --activate <inspected SHA-256>.",
  );
