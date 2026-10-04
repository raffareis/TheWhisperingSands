import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import type { RoomState } from "../shared/types.js";

export const kleinModel = "fal-ai/flux-2/klein/9b/edit";
const maxBytes = 8 * 1024 * 1024;
export function isWebp(bytes: Buffer) {
  return (
    bytes.length >= 12 &&
    bytes.length <= maxBytes &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  );
}
function cast(description: string) {
  return [/\bsam\b/i, /\b(?:liz|elizabeth)\b/i, /\bemily\b/i]
    .map((pattern, index) => (pattern.test(description) ? index : -1))
    .filter((index) => index >= 0)
    .join(",");
}
// Only an immediately preceding, confirmed frame from this room can be edited.
// Public base art and inherited placeholder URLs are never edit targets.
export function fastEditSource(snapshot: RoomState, dataDir: string) {
  const edit = snapshot.scene.edit;
  const previous = snapshot.sceneHistory.at(-1);
  if (
    !edit ||
    !previous ||
    previous.id !== edit.sourceSceneId ||
    previous.status !== "ready" ||
    previous.chapter !== snapshot.chapter ||
    (previous.editDepth ?? 0) >= 2 ||
    previous.location.trim().toLowerCase() !==
      snapshot.scene.location.trim().toLowerCase() ||
    !cast(previous.description) ||
    cast(previous.description) !== cast(snapshot.scene.description) ||
    !/^[a-z0-9_-]{4,20}$/.test(snapshot.id) ||
    !/^[a-f0-9-]{36}$/.test(previous.id) ||
    previous.imageUrl !== `/api/rooms/${snapshot.id}/images/${previous.id}.webp`
  )
    return null;
  try {
    const directory = realpathSync(resolve(dataDir, "images", snapshot.id));
    // Disallow room symlinks escaping the configured image directory as well.
    if (
      directory !==
      resolve(realpathSync(resolve(dataDir, "images")), snapshot.id)
    )
      return null;
    const path = resolve(directory, `${previous.id}.webp`);
    const info = lstatSync(path);
    if (!info.isFile() || info.size > maxBytes) return null;
    const bytes = readFileSync(path);
    if (!isWebp(bytes)) return null;
    return { bytes, depth: (previous.editDepth ?? 0) + 1 };
  } catch {
    return null;
  }
}

export class FastEditError extends Error {
  constructor(
    message: string,
    public allowFallback = false,
  ) {
    super(message);
  }
}
export async function editFrame(
  bytes: Buffer,
  change: string,
  key: string,
  signal: AbortSignal,
  request: typeof fetch,
) {
  const response = await request(`https://fal.run/${kleinModel}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${key}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
    body: JSON.stringify({
      prompt: `Edit the supplied approved illustration with ONLY this small public change: ${change}. Preserve the exact number of people, their identities, ages, faces, clothes, framing, location, all other objects, rough matte gouache, graphite marks and paper texture. No new people or events. No text, letters, puzzle answers or UI.`,
      image_urls: [`data:image/webp;base64,${bytes.toString("base64")}`],
      image_size: { width: 1536, height: 1024 },
      num_inference_steps: 4,
      num_images: 1,
      output_format: "webp",
      sync_mode: true,
      enable_safety_checker: true,
    }),
  });
  if (!response.ok)
    throw new FastEditError(
      `Fast illustration edit failed (${response.status}).`,
      [400, 401, 403, 404, 422, 429].includes(response.status),
    );
  const result = await response.json();
  if (result.has_nsfw_concepts?.some(Boolean))
    throw new FastEditError(
      "Fast illustration edit was rejected by safety checks.",
    );
  const url = result.images?.[0]?.url;
  if (
    typeof url !== "string" ||
    url.length > Math.ceil((maxBytes * 4) / 3) + 32 ||
    !/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(url)
  )
    throw new FastEditError(
      "Fast illustration edit returned no valid inline image.",
    );
  const output = Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
  if (!isWebp(output))
    throw new FastEditError(
      "Fast illustration edit returned invalid WebP bytes.",
    );
  return {
    bytes: output,
    requestId:
      response.headers.get("x-fal-request-id") ??
      response.headers.get("x-request-id") ??
      undefined,
  };
}
