import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import type { Credentials } from "../shared/types.js";
test(
  "HTTP + shared WebSocket: authorized snapshots, two players, presence and reconnect",
  { timeout: 25000 },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "whispering-http-"));
    const controller = new AbortController();
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "server/index.ts"],
      {
        env: {
          ...process.env,
          OPENAI_API_KEY: "",
          PORT: "0",
          NODE_ENV: "production",
          DATA_DIR: dir,
        },
        stdio: ["ignore", "pipe", "pipe"],
        signal: controller.signal,
      },
    );
    child.on("error", () => {});
    let errors = "";
    child.stderr.on("data", (d) => {
      errors += d;
    });
    const sockets: WebSocket[] = [];
    try {
      const base = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`Server startup timed out: ${errors}`)),
          15000,
        );
        child.stdout.on("data", (data) => {
          const url = data.toString().match(/http:\/\/127\.0\.0\.1:(\d+)/);
          if (url) {
            clearTimeout(timer);
            resolve(url[0]);
          }
        });
        child.on("exit", () => {
          clearTimeout(timer);
          reject(new Error(`Server exited: ${errors}`));
        });
      });
      async function api(route: string, value?: unknown, token?: string) {
        const r = await fetch(base + route, {
          method: value === undefined ? "GET" : "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          ...(value === undefined ? {} : { body: JSON.stringify(value) }),
        });
        return {
          status: r.status,
          body: await r.json(),
          cookie: r.headers.get("set-cookie"),
        };
      }
      const config = await api("/api/config");
      assert.equal(config.body.aiAvailable, false);
      for (const path of [
        "/assets/dm/island-map.svg",
        "/server/campaign-map.json",
        "/@fs/home/raffareis/repos/workshop/projetos/the-whispering-sands/assets/dm/island-map.svg",
        "/server%2fcampaign-map.json",
      ]) {
        const hidden = await fetch(base + path);
        assert.equal(hidden.status, 404, path);
        assert.equal((await hidden.json()).error, "Not found.");
      }
      const created = await api("/api/rooms", {
        name: "Rafael",
        characterId: "sam",
      });
      assert.equal(created.status, 201);
      const a = created.body.credentials as Credentials;
      const unauth = await api(`/api/rooms/${a.roomId}`);
      assert.equal(unauth.status, 401);
      const invalid = await api(`/api/rooms/${a.roomId}/join`, {
        name: "Meg",
        invite: "1234567890123456",
      });
      assert.equal(invalid.status, 403);
      const joined = await api(`/api/rooms/${a.roomId}/join`, {
        name: "Meg",
        invite: created.body.invite,
      });
      assert.equal(joined.status, 201);
      const b = joined.body.credentials as Credentials;
      const snapshot = await api(`/api/rooms/${a.roomId}`, undefined, a.token);
      assert.equal(snapshot.body.state.players.length, 2);
      assert.ok(!JSON.stringify(snapshot.body).includes(a.token));
      assert.ok(!JSON.stringify(snapshot.body).includes("reverse the call"));
      assert.ok(snapshot.cookie?.includes("HttpOnly"));
      const third = await api(`/api/rooms/${a.roomId}/join`, {
        name: "Third",
        invite: created.body.invite,
      });
      assert.equal(third.status, 409);
      function connect(c: Credentials) {
        const ws = new WebSocket(base.replace("http", "ws") + "/api/live");
        sockets.push(ws);
        const states: Record<string, any>[] = [];
        ws.on("message", (raw) => states.push(JSON.parse(raw.toString())));
        return {
          ws,
          states,
          ready: (async () => {
            await once(ws, "open");
            ws.send(
              JSON.stringify({
                type: "authenticate",
                token: c.token,
                roomId: c.roomId,
              }),
            );
            await once(ws, "message");
          })(),
        };
      }
      const one = connect(a);
      await one.ready;
      const two = connect(b);
      await two.ready;
      const both = two.states.find((s) => s.type === "state");
      assert.equal(
        both?.live.presence.filter((p: { online: boolean }) => p.online).length,
        2,
      );
      const disabled = await api(
        `/api/rooms/${a.roomId}/images`,
        { enabled: false },
        a.token,
      );
      assert.equal(disabled.status, 200);
      await new Promise((r) => setTimeout(r, 30));
      assert.equal(
        one.states.filter((s) => s.type === "state").at(-1)?.live.imageEnabled,
        false,
      );
      assert.equal(
        two.states.filter((s) => s.type === "state").at(-1)?.live.imageEnabled,
        false,
      );
      const start = await api(`/api/rooms/${a.roomId}/start`, {}, a.token);
      assert.equal(start.status, 503);
      assert.equal(
        (await api(`/api/rooms/${a.roomId}`, undefined, a.token)).body.state
          .phase,
        "lobby",
      );
      const closed = once(two.ws, "close");
      two.ws.close();
      await closed;
      await new Promise((r) => setTimeout(r, 30));
      assert.equal(
        one.states
          .filter((s) => s.type === "state")
          .at(-1)
          ?.live.presence.find(
            (p: { playerId: string }) => p.playerId === b.playerId,
          ).online,
        false,
      );
      const back = connect(b);
      await back.ready;
      assert.equal(
        back.states.find((s) => s.type === "state")?.state.players.length,
        2,
      );
      const other = await api("/api/rooms", {
        name: "Other",
        characterId: "liz",
      });
      assert.equal(
        (await api(`/api/rooms/${other.body.state.id}`, undefined, a.token))
          .status,
        401,
      );
    } finally {
      for (const s of sockets) s.close();
      controller.abort();
      if (child.exitCode === null) await once(child, "exit").catch(() => {});
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
