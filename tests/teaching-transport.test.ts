import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
test(
  "teacher workflow enforces private management, durable entry, pause and revocation over HTTP/WS",
  { timeout: 25000 },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "whispering-teach-http-"));
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "server/index.ts"],
      {
        env: {
          ...process.env,
          NODE_ENV: "production",
          OPENAI_API_KEY: "",
          HOST_ACCESS_KEY: "test-teacher-key",
          PORT: "0",
          DATA_DIR: dir,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr += d;
    });
    try {
      const base = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Teacher test startup: " + stderr)),
          10000,
        );
        child.stdout.on("data", (d) => {
          const url = d.toString().match(/http:\/\/127\.0\.0\.1:\d+/);
          if (url) {
            clearTimeout(timer);
            resolve(url[0]);
          }
        });
        child.once("exit", () => {
          clearTimeout(timer);
          reject(new Error(stderr));
        });
      });
      const path = join(dir, "teaching.json");
      const proof = spawn(
        process.execPath,
        ["--import", "tsx", "bin/check-teaching.ts"],
        {
          env: {
            ...process.env,
            APP_URL: base,
            HOST_ACCESS_KEY: "test-teacher-key",
            TEACHING_REPORT: path,
            CHECK_KEEP_TABLE: "0",
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let logs = "";
      proof.stdout.on("data", (d) => {
        logs += d;
      });
      proof.stderr.on("data", (d) => {
        logs += d;
      });
      assert.equal((await once(proof, "exit"))[0], 0, logs);
      const report = JSON.parse(readFileSync(path, "utf8"));
      assert.equal(report.status, "ready");
      assert.equal(report.pause_enforced_http_and_ws, true);
    } finally {
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      await exited;
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
