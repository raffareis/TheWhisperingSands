import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import type { Credentials } from "../shared/types.js";
for (const mode of ["production", "development"] as const)
  test(
    `HTTP + shared WebSocket (${mode}): authorization, party channels, recovery and private source denial`,
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
            NODE_ENV: mode,
            HOST_ACCESS_KEY: "test-host-code",
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
        let hostCookie = "";
        async function api(route: string, value?: unknown, token?: string) {
          const r = await fetch(base + route, {
            method: value === undefined ? "GET" : "POST",
            headers: {
              "Content-Type": "application/json",
              ...(hostCookie ? { Cookie: hostCookie } : {}),
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
        assert.equal(config.body.hostAccessRequired, true);
        assert.equal(
          (await api("/api/rooms", { name: "Uninvited", characterId: "sam" }))
            .status,
          403,
        );
        assert.equal(
          (await api("/api/host-access", { key: "wrong" })).status,
          403,
        );
        const granted = await api("/api/host-access", {
          key: "test-host-code",
        });
        assert.equal(granted.status, 200);
        assert.ok(granted.cookie?.includes("HttpOnly"));
        hostCookie = granted.cookie!.split(";")[0];

        for (const path of [
          "/assets/dm/island-map.svg",
          "/server/campaign-map.json",
          "/@fs/home/raffareis/repos/workshop/projetos/the-whispering-sands/assets/dm/island-map.svg",
          "/server%2fcampaign-map.json",
          "/server/puzzles.ts?raw",
          "/server%252fpuzzles.ts?raw",
          "/server/runtime.ts",
          "/06_StoryGuide.md?raw",
          "/01_Intro.md",
          "/data/adventure.sqlite",
          "/.env",
          "/%2eenv.local?raw",
          "/@fs" + process.cwd() + "/server/puzzles.ts?raw",
          "/@fs" + process.cwd() + "/06_StoryGuide.md?raw",
          "/@fs" + process.cwd() + "/data/adventure.sqlite?raw",
          "/@fs" + process.cwd() + "/.env?raw",
        ]) {
          const hidden = await fetch(base + path);
          assert.equal(hidden.status, 404, path);
          assert.equal((await hidden.json()).error, "Not found.");
        }
        assert.equal(
          (await fetch(base + "/missing-server-file.ts")).status,
          404,
        );
        if (mode === "production" && existsSync("output/web/index.html")) {
          for (const path of ["/", "/whispering-sands?room=test#recover=code"])
            assert.equal((await fetch(base + path)).status, 200);
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
        const snapshot = await api(
          `/api/rooms/${a.roomId}`,
          undefined,
          a.token,
        );
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
          both?.live.presence.filter((p: { online: boolean }) => p.online)
            .length,
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
          one.states.filter((s) => s.type === "state").at(-1)?.live
            .imageEnabled,
          false,
        );
        assert.equal(
          two.states.filter((s) => s.type === "state").at(-1)?.live
            .imageEnabled,
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
        const waitFor = async (predicate: () => boolean) => {
          const started = Date.now();
          while (!predicate()) {
            assert.ok(
              Date.now() - started < 2500,
              "Expected live event did not arrive.",
            );
            await new Promise((r) => setTimeout(r, 5));
          }
        };
        assert.equal(
          (
            await api(`/api/rooms/${a.roomId}/party-chat`, {
              text: "Unauthenticated",
            })
          ).status,
          401,
        );
        assert.equal(
          (
            await api(
              `/api/rooms/${a.roomId}/party-chat`,
              { text: " " },
              a.token,
            )
          ).status,
          400,
        );
        assert.equal(
          (await api(`/api/rooms/${a.roomId}/rest`, {}, a.token)).status,
          400,
        );
        const journalBefore = (
          await api(`/api/rooms/${a.roomId}`, undefined, a.token)
        ).body.state.journal.length;
        const chat = await api(
          `/api/rooms/${a.roomId}/party-chat`,
          { text: "What does your clue say?" },
          a.token,
        );
        assert.equal(chat.status, 200);
        const afterChat = await api(
          `/api/rooms/${a.roomId}`,
          undefined,
          a.token,
        );
        assert.equal(afterChat.body.state.journal.length, journalBefore);
        assert.equal(
          afterChat.body.state.partyChat.at(-1).playerId,
          a.playerId,
        );
        await waitFor(() =>
          back.states.some(
            (e) =>
              e.state?.partyChat?.at(-1)?.text === "What does your clue say?",
          ),
        );
        one.ws.send(JSON.stringify({ type: "party_start" }));
        await waitFor(() =>
          one.states.some((e) => e.type === "party_floor_granted"),
        );
        back.ws.send(JSON.stringify({ type: "party_start" }));
        await waitFor(() =>
          back.states.some(
            (e) => e.type === "error" && e.action === "party_start",
          ),
        );
        const pcm = Buffer.alloc(4800).toString("base64");
        one.ws.send(JSON.stringify({ type: "party_audio", data: pcm }));
        await waitFor(() =>
          back.states.some(
            (e) =>
              e.type === "party_audio" &&
              e.delta === pcm &&
              e.playerId === a.playerId,
          ),
        );
        assert.ok(!one.states.some((e) => e.type === "party_audio"));
        one.ws.send(JSON.stringify({ type: "party_end" }));
        await waitFor(() =>
          one.states.some((e) => e.type === "party_floor_released"),
        );
        assert.equal(
          (await api(`/api/rooms/${a.roomId}`, undefined, a.token)).body.live
            .dmStatus,
          "offline",
        );
        back.ws.send(JSON.stringify({ type: "party_start" }));
        await waitFor(() =>
          back.states.some((e) => e.type === "party_floor_granted"),
        );
        const recovery = await api(
          `/api/rooms/${a.roomId}/recovery`,
          { characterId: "liz" },
          a.token,
        );
        assert.equal(recovery.status, 200);
        const recoveryCode = recovery.body.recoveryCode;
        const closing = once(back.ws, "close");
        const recovered = await api(`/api/rooms/${a.roomId}/recover`, {
          recoveryCode,
        });
        assert.equal(recovered.status, 200);
        assert.equal(recovered.body.credentials.playerId, b.playerId);
        const [code, reason] = await closing;
        assert.equal(code, 4001);
        assert.match(reason.toString(), /saved token/);
        assert.equal(
          (await api(`/api/rooms/${a.roomId}`, undefined, b.token)).status,
          401,
        );
        assert.equal(
          (await api(`/api/rooms/${a.roomId}/recover`, { recoveryCode }))
            .status,
          403,
        );
        assert.equal(
          (
            await api(`/api/rooms/${other.body.state.id}/recover`, {
              recoveryCode,
            })
          ).status,
          403,
        );
        const recoveredClient = connect(recovered.body.credentials);
        await recoveredClient.ready;
        assert.equal(
          recoveredClient.states.find((e) => e.type === "state")?.state.players
            .length,
          2,
        );
        assert.equal(
          recoveredClient.states.find((e) => e.type === "state")?.live
            .partySpeaker,
          null,
        );
        assert.ok(
          !JSON.stringify(recoveredClient.states).includes(recoveryCode),
        );
      } finally {
        for (const s of sockets) s.close();
        controller.abort();
        if (child.exitCode === null) await once(child, "exit").catch(() => {});
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );
