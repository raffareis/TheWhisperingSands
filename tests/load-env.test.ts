import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadFalEnv } from "../server/load-env.js";
test("a mixed media env loads only fal.ai and preserves the master's credential", () => {
  const dir = mkdtempSync(join(tmpdir(), "whispering-env-"));
  try {
    const path = join(dir, "media.env");
    writeFileSync(
      path,
      "OPENAI_API_KEY=wrong-dm-project\nFAL_KEY='private-fal-test'\nHOST_ACCESS_KEY=wrong-host\n",
      { mode: 0o600 },
    );
    const env: NodeJS.ProcessEnv = {
      OPENAI_API_KEY: "actual-dm-project",
      HOST_ACCESS_KEY: "actual-host",
    };
    loadFalEnv(path, env);
    assert.deepEqual(env, {
      OPENAI_API_KEY: "actual-dm-project",
      HOST_ACCESS_KEY: "actual-host",
      FAL_KEY: "private-fal-test",
    });
    env.FAL_KEY = "explicit-fal-key";
    loadFalEnv(path, env);
    assert.equal(env.FAL_KEY, "explicit-fal-key");
    const empty: NodeJS.ProcessEnv = {};
    loadFalEnv(path, empty);
    assert.deepEqual(empty, { FAL_KEY: "private-fal-test" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
