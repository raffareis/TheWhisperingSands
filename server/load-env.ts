import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

// Media CLI files may contain several providers' keys. Never replace the DM key.
export function loadFalEnv(
  path: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (!path || env.FAL_KEY) return;
  const values = parseEnv(readFileSync(path, "utf8"));
  if (values.FAL_KEY) env.FAL_KEY = values.FAL_KEY;
}
