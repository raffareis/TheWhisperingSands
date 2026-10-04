import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { resolve, extname } from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import { z } from "zod";
import { createServer as createViteServer } from "vite";
import { RoomStore, GameError } from "./store.js";
import { RoomRuntime, socketMessage, type Settings } from "./runtime.js";
import { projectRoom } from "./puzzles.js";
import { rollCheck, rerollCheck, acceptRoll } from "./game.js";
if (existsSync(".env")) process.loadEnvFile(".env");
const production = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT ?? 4317);
const host = process.env.HOST ?? "127.0.0.1";
const settings: Settings = {
  key: process.env.OPENAI_API_KEY ?? "",
  textModel: process.env.OPENAI_TEXT_MODEL ?? "gpt-6.1-sol",
  realtimeModel: process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime-2.1",
  imageModel: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2.5-flare",
  workerModel: process.env.OPENAI_WORKER_MODEL ?? "gpt-5.4-nano",
  ...(process.env.SYSTEM_ONE_BASE_URL
    ? {
        systemOne: {
          baseUrl: process.env.SYSTEM_ONE_BASE_URL,
          model: process.env.SYSTEM_ONE_MODEL ?? "jev-1.13.0",
          key: process.env.SYSTEM_ONE_API_KEY ?? "",
          shadow: process.env.SYSTEM_ONE_SHADOW !== "false",
        },
      }
    : {}),
  dataDir: resolve(process.env.DATA_DIR ?? "data"),
};
const store = new RoomStore(settings.dataDir);
const rooms = new Map<string, RoomRuntime>();
function runtime(id: string) {
  let room = rooms.get(id);
  if (!room) {
    room = new RoomRuntime(store, id, settings);
    rooms.set(id, room);
  }
  return room;
}
const vite = production
  ? null
  : await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
const rate = new Map<string, { count: number; until: number }>();
function limited(req: IncomingMessage) {
  const key = req.socket.remoteAddress ?? "unknown";
  const current = rate.get(key);
  if (!current || Date.now() > current.until) {
    rate.set(key, { count: 1, until: Date.now() + 60000 });
    return false;
  }
  return ++current.count > 90;
}
async function body(req: IncomingMessage) {
  let size = 0;
  const buffers: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16000) throw new GameError("Request is too large.", 413);
    buffers.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(buffers).toString() || "{}");
  } catch {
    throw new GameError("Invalid request body.");
  }
}
function json(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(data));
}
const name = z.string().trim().min(1).max(40);
const createSchema = z.object({ name, characterId: z.enum(["sam", "liz"]) });
const joinSchema = z.object({ name, invite: z.string().min(16).max(100) });
const server = createServer(async (req, res) => {
  try {
    const url = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`,
    );
    // The DM map is internal campaign knowledge, including in Vite development.
    if (
      /(?:^|\/)(?:assets\/dm(?:\/|$)|server\/campaign-map\.json(?:$|\?))/.test(
        decodeURIComponent(url.pathname),
      )
    )
      throw new GameError("Not found.", 404);
    if (url.pathname.startsWith("/api/")) {
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host)
        throw new GameError("Cross-origin requests are not allowed.", 403);
      if (limited(req))
        throw new GameError("Please slow down and try again shortly.", 429);
      if (req.method === "GET" && url.pathname === "/api/config")
        return json(res, {
          aiAvailable: !!settings.key,
          realtimeModel: settings.realtimeModel,
          imageModel: settings.imageModel,
        });
      if (req.method === "POST" && url.pathname === "/api/rooms") {
        const value = createSchema.parse(await body(req));
        const created = store.create(value.name, value.characterId);
        runtime(created.state.id);
        return json(
          res,
          {
            ...created,
            state: projectRoom(
              runtime(created.state.id).state,
              created.state.players[0],
            ),
          },
          201,
        );
      }
      const match = url.pathname.match(
        /^\/api\/rooms\/([a-z0-9_-]{4,20})(?:\/(.*))?$/,
      );
      if (!match) throw new GameError("Not found.", 404);
      const [, id, route = ""] = match;
      if (req.method === "POST" && route === "join") {
        const value = joinSchema.parse(await body(req));
        const joined = store.join(id, value.invite, value.name);
        const room = runtime(id);
        room.state = joined.state;
        room.publish(false);
        return json(
          res,
          {
            ...joined,
            state: projectRoom(
              room.state,
              joined.state.players.find(
                (p) => p.id === joined.credentials.playerId,
              )!,
            ),
          },
          201,
        );
      }
      const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
      // Image requests use an HttpOnly room cookie; API requests use the seat token.
      const cookieToken = req.headers.cookie
        ?.split(";")
        .map((s) => s.trim())
        .find((s) => s.startsWith(`ws_${id}=`))
        ?.split("=")[1];
      const { player } = store.authenticate(token || cookieToken || "", id);
      const room = runtime(id);
      if (req.method === "GET" && route === "") {
        res.setHeader(
          "Set-Cookie",
          `ws_${id}=${token || cookieToken}; HttpOnly; SameSite=Strict; Path=/api/rooms/${id}/images/; Max-Age=2592000${req.headers["x-forwarded-proto"] === "https" ? "; Secure" : ""}`,
        );
        return json(res, {
          state: projectRoom(room.state, player),
          live: room.live,
          config: room.config(),
        });
      }
      if (req.method === "GET" && route.startsWith("images/")) {
        const image = route.slice(7);
        if (!/^[a-f0-9-]{36}\.webp$/.test(image))
          throw new GameError("Image not found.", 404);
        const path = resolve(settings.dataDir, "images", id, image);
        if (!existsSync(path)) throw new GameError("Image not found.", 404);
        res.writeHead(200, {
          "Content-Type": "image/webp",
          "Cache-Control": "private, max-age=86400",
          "X-Content-Type-Options": "nosniff",
        });
        return res.end(readFileSync(path));
      }
      if (req.method !== "POST") throw new GameError("Not found.", 404);
      const value = await body(req);
      if (route === "puzzle-answer") {
        const v = z
          .object({
            puzzleId: z.string().max(60),
            answer: z.string().trim().min(1).max(200),
          })
          .parse(value);
        return json(res, room.puzzleAnswer(player, v.puzzleId, v.answer));
      }
      if (route === "puzzle-hint") {
        const v = z.object({ puzzleId: z.string().max(60) }).parse(value);
        return json(res, room.puzzleHint(v.puzzleId));
      }
      if (route === "background") {
        const v = z
          .object({ task: z.enum(["recap", "language_coach"]) })
          .parse(value);
        if (room.state.phase !== "playing")
          throw new GameError("Start the adventure first.", 409);
        return json(res, room.workers.dispatch(v.task, "current"));
      }
      if (route === "start") {
        await room.start(player);
        return json(res, { ok: true });
      }
      if (route === "action") {
        const v = z
          .object({ text: z.string().trim().min(1).max(1200) })
          .parse(value);
        await room.action(player, v.text);
        return json(res, { ok: true });
      }
      if (route === "roll" || route === "reroll" || route === "roll-accept") {
        if (
          room.live.dmStatus === "thinking" ||
          room.live.dmStatus === "speaking" ||
          room.live.speaker
        )
          throw new GameError("Let the storyteller finish first.", 409);
        const v = z.object({ checkId: z.string().uuid() }).parse(value);
        const roll =
          route === "roll"
            ? rollCheck(room.state, player.id, v.checkId)
            : route === "reroll"
              ? rerollCheck(room.state, player.id, v.checkId)
              : acceptRoll(room.state, player.id, v.checkId);
        room.publish();
        if (!room.state.rollDecision) await room.afterRoll(roll);
        return json(res, { roll });
      }
      if (route === "invite") return json(res, { invite: store.invite(id) });
      if (route === "images") {
        const v = z.object({ enabled: z.boolean() }).parse(value);
        room.toggleImages(v.enabled);
        return json(res, { ok: true });
      }
      if (route === "image-retry") {
        room.retryImage();
        return json(res, { ok: true });
      }
      if (route === "resume") {
        if (
          room.live.dmStatus !== "error" &&
          room.state.journal.some((e) => e.kind === "dm")
        )
          throw new GameError("The storyteller is already available.");
        await room.narrate(
          "Resume the current adventure from the authoritative state and last public journal entry. If a check is pending, remind that character to roll. Do not repeat completed consequences.",
        );
        return json(res, { ok: true });
      }
      throw new GameError("Not found.", 404);
    }
    if (vite) {
      vite.middlewares(req, res);
      return;
    }
    const root = resolve("output/web");
    const path = resolve(root, "." + url.pathname);
    if (path !== root && !path.startsWith(root + "/"))
      throw new GameError("Not found.", 404);
    const target =
      existsSync(path) && extname(path) ? path : resolve(root, "index.html");
    const contentTypes: Record<string, string> = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".webp": "image/webp",
    };
    res.writeHead(200, {
      "Content-Type":
        contentTypes[extname(target)] ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(readFileSync(target));
  } catch (error) {
    const status =
      error instanceof GameError
        ? error.status
        : error instanceof z.ZodError
          ? 400
          : 500;
    const message =
      error instanceof z.ZodError
        ? "Some fields are invalid. Please check your input."
        : error instanceof Error
          ? error.message
          : "Something went wrong.";
    json(res, { error: message }, status);
  }
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 24000 });
server.on("upgrade", (req, socket, head) => {
  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  );
  if (url.pathname !== "/api/live") return;
  if (
    req.headers.origin &&
    new URL(req.headers.origin).host !== req.headers.host
  ) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    let room: RoomRuntime | undefined;
    let playerId: string | undefined;
    let alive = true;
    const authTimeout = setTimeout(
      () => ws.close(4003, "Authentication required."),
      5000,
    );
    ws.on("pong", () => {
      alive = true;
    });
    const heartbeat = setInterval(() => {
      if (!alive) {
        ws.terminate();
        return;
      }
      alive = false;
      ws.ping();
    }, 30000);
    ws.on("message", async (raw) => {
      let action = "unknown";
      try {
        const value = JSON.parse(raw.toString());
        action = typeof value.type === "string" ? value.type : "unknown";
        if (!room) {
          const auth = z
            .object({
              type: z.literal("authenticate"),
              token: z.string().min(20).max(100),
              roomId: z.string().max(20),
            })
            .parse(value);
          const found = store.authenticate(auth.token, auth.roomId);
          room = runtime(found.state.id);
          playerId = found.player.id;
          clearTimeout(authTimeout);
          room.connect(ws, found.player);
          return;
        }
        const event = socketMessage.parse(value);
        const player = room.state.players.find((p) => p.id === playerId)!;
        if (event.type === "voice_start") await room.startVoice(player);
        if (event.type === "voice_stop") room.leaveVoice(player.id);
        if (event.type === "floor_start") room.beginFloor(player);
        if (event.type === "floor_end") room.commitFloor(player.id);
        if (event.type === "audio") room.audio(player.id, event.data);
      } catch (error) {
        if (ws.readyState === WebSocket.OPEN)
          ws.send(
            JSON.stringify({
              type: "error",
              action,
              message:
                error instanceof z.ZodError
                  ? "Invalid live message."
                  : error instanceof Error
                    ? error.message
                    : "Live action failed.",
            }),
          );
        if (!room) ws.close(4003, "Authentication failed.");
      }
    });
    ws.on("error", () => {});
    ws.on("close", () => {
      clearTimeout(authTimeout);
      clearInterval(heartbeat);
      room?.disconnect(ws);
    });
  });
});
server.listen(port, host, () =>
  console.log(
    `The Whispering Sands is ready at http://${host}:${(server.address() as { port: number }).port} (OpenAI ${settings.key ? "configured" : "not configured"}).`,
  ),
);
let ending = false;
async function shutdown() {
  if (ending) return;
  ending = true;
  for (const room of rooms.values()) room.close();
  wss.close();
  server.close();
  await vite?.close();
  store.close();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
