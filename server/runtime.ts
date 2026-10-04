import WebSocket from "ws";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type {
  RoomState,
  LiveState,
  Player,
  Scene,
  Roll,
  Configuration,
} from "../shared/types.js";
import {
  applyConsequences,
  log,
  requestCheck,
  setScene,
  rollCompanion,
} from "./game.js";
import { artDirection, instructions, textTurn, tools } from "./dm.js";
import { RoomStore, GameError } from "./store.js";
export interface Settings {
  key: string;
  textModel: string;
  realtimeModel: string;
  imageModel: string;
  dataDir: string;
}
export class RoomRuntime {
  state: RoomState;
  clients = new Map<WebSocket, string>();
  live: LiveState = {
    dmStatus: "offline",
    speaker: null,
    imageEnabled: true,
    presence: [],
  };
  realtime: WebSocket | null = null;
  voiceUsers = new Set<string>();
  private voiceReady: Promise<void> | null = null;
  private thinking = false;
  private replyActive = false;
  private generation = false;
  private nextImage: Scene | null = null;
  private imageCount = 0;
  private imageWindow = Date.now();
  private audioBytes = 0;
  private floorTimer: ReturnType<typeof setTimeout> | null = null;
  private toolRounds = 0;
  private currentResponseId: string | null = null;
  private closed = false;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private lastOutput: {
    itemId: string;
    started: number;
    duration: number;
  } | null = null;
  constructor(
    public store: RoomStore,
    id: string,
    public settings: Settings,
    private dial = (model: string, key: string) =>
      new WebSocket(
        `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`,
        {
          headers: { Authorization: `Bearer ${key}` },
          handshakeTimeout: 20000,
          maxPayload: 8_000_000,
        },
      ),
  ) {
    this.state = store.load(id);
    this.state.rollDecision ??= null;
    this.state.preferences ??= { illustrations: true };
    this.live.imageEnabled = this.state.preferences.illustrations;
    let interrupted = false;
    for (const scene of [this.state.scene, ...this.state.sceneHistory]) {
      if (scene.status === "generating") {
        scene.status = "error";
        scene.error = "Painting was interrupted when the table restarted.";
        interrupted = true;
      }
    }
    if (interrupted) this.store.save(this.state);
  }
  config(): Configuration {
    return {
      aiAvailable: !!this.settings.key,
      realtimeModel: this.settings.realtimeModel,
      imageModel: this.settings.imageModel,
    };
  }
  send(ws: WebSocket, value: unknown) {
    if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 2_000_000)
      ws.send(JSON.stringify(value));
  }
  broadcast(value: unknown, except?: string) {
    for (const [ws, player] of this.clients)
      if (player !== except) this.send(ws, value);
  }
  publish(persist = true) {
    if (persist) this.store.save(this.state);
    this.live.presence = this.state.players.map((p) => ({
      playerId: p.id,
      online: [...this.clients.values()].includes(p.id),
    }));
    this.broadcast({ type: "state", state: this.state, live: this.live });
  }
  connect(ws: WebSocket, player: Player) {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    // A seat gets a single microphone connection; reconnecting invalidates its stale tab.
    for (const [old, id] of this.clients)
      if (id === player.id) {
        if (this.live.speaker === id) this.releaseFloor(id, false);
        this.voiceUsers.delete(id);
        this.clients.delete(old);
        old.close(4001, "This seat was opened in another tab.");
      }
    if (!this.voiceUsers.size && this.realtime) this.stopVoice();
    this.clients.set(ws, player.id);
    this.publish(false);
    this.send(ws, { type: "config", config: this.config() });
  }
  disconnect(ws: WebSocket) {
    const id = this.clients.get(ws);
    this.clients.delete(ws);
    if (id && !this.clientsHas(id)) {
      this.voiceUsers.delete(id);
      if (this.live.speaker === id) this.releaseFloor(id, false);
    }
    if (!this.voiceUsers.size) this.stopVoice();
    this.publish(false);
    if (!this.clients.size)
      this.idleTimer = setTimeout(() => this.stopVoice(), 30000);
  }
  private clientsHas(id: string) {
    return [...this.clients.values()].includes(id);
  }
  private requireAI() {
    if (!this.settings.key)
      throw new GameError(
        "The storyteller needs an OpenAI API key on the server.",
        503,
      );
  }
  private assertTurn() {
    if (this.state.phase === "lobby")
      throw new GameError("Start the adventure first.");
    if (this.state.phase === "complete")
      throw new GameError("This adventure has ended.");
    if (this.thinking || this.replyActive || this.live.speaker)
      throw new GameError("Let the current speaker finish first.", 409);
    if (this.state.pendingCheck || this.state.rollDecision)
      throw new GameError(
        "Resolve the dice check before the next action.",
        409,
      );
  }
  async start(player: Player) {
    this.requireAI();
    if (this.state.players.length !== 2)
      throw new GameError("Invite your companion before starting.", 409);
    if (this.state.phase !== "lobby")
      throw new GameError("The adventure has already started.", 409);
    this.state.phase = "playing";
    log(this.state, "system", "Your adventure begins.");
    this.publish();
    await this.narrate(
      `${player.name} asks to begin. Set the opening scene on the shipwrecked shore. Both Sam and Liz are awake, and Emily is safe beside them. Ask what the players do first.`,
    );
  }
  async action(player: Player, text: string) {
    this.assertTurn();
    this.requireAI();
    this.state.lastRoll = null;
    log(this.state, "player", text, player.id);
    this.publish();
    await this.narrate(
      `${player.name}, playing ${player.characterId}: ${text}`,
    );
  }
  async afterRoll(roll: Roll) {
    await this.narrate(
      `AUTHORITATIVE DICE RESULT: ${JSON.stringify(roll)}. Server already applied any harm. Narrate this outcome without requesting the identical check again.`,
    );
  }
  async narrate(message: string, npcDepth = 0) {
    if (this.thinking || this.replyActive)
      throw new GameError("The storyteller is finishing a turn.", 409);
    this.toolRounds = 0;
    if (
      this.realtime?.readyState === WebSocket.OPEN &&
      this.live.dmStatus !== "connecting"
    ) {
      this.sendRT({
        type: "session.update",
        session: { instructions: instructions(this.state) },
      });
      this.sendRT({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: message }],
        },
      });
      this.requestResponse();
      return;
    }
    let npcRoll: Roll | null = null;
    this.thinking = true;
    this.live.dmStatus = "thinking";
    delete this.live.error;
    this.publish(false);
    try {
      const turn = await textTurn(
        this.settings.key,
        this.settings.textModel,
        this.state,
        message,
      );
      const staged = structuredClone(this.state);
      if (turn.consequences) applyConsequences(staged, turn.consequences);
      if (turn.check) requestCheck(staged, turn.check);
      if (turn.scene) setScene(staged, turn.scene);
      log(staged, "dm", turn.narration);
      this.state = staged;
      this.publish();
      if (turn.scene) this.enqueueImage(this.state.scene);
      if (this.state.pendingCheck?.characterId === "emily")
        npcRoll = this.rollNPC();
      this.live.dmStatus = this.realtime ? "ready" : "offline";
    } catch (error) {
      this.fail(error);
    } finally {
      this.thinking = false;
      this.publish(false);
    }
    if (npcRoll) {
      if (npcDepth >= 2)
        this.fail(
          new Error(
            "The storyteller requested too many companion checks. Resume to continue.",
          ),
        );
      else
        await this.narrate(
          `AUTHORITATIVE NPC DICE RESULT: ${JSON.stringify(npcRoll)}. Server already applied harm. Narrate its outcome, then invite a human player to choose.`,
          npcDepth + 1,
        );
    }
  }
  private fail(error: unknown) {
    this.live.dmStatus = "error";
    this.live.error =
      error instanceof Error
        ? error.message
        : "The storyteller could not complete this turn.";
    this.publish(false);
  }
  async startVoice(player: Player) {
    this.requireAI();
    this.voiceUsers.add(player.id);
    if (this.realtime?.readyState === WebSocket.OPEN && !this.voiceReady) {
      this.sendTo(player.id, { type: "voice_ready" });
      return;
    }
    if (this.voiceReady) {
      try {
        await this.voiceReady;
        this.sendTo(player.id, { type: "voice_ready" });
      } catch (error) {
        this.voiceUsers.delete(player.id);
        throw error;
      }
      return;
    }
    this.live.dmStatus = "connecting";
    delete this.live.error;
    this.publish(false);
    this.voiceReady = new Promise<void>((resolve, reject) => {
      const ws = this.dial(this.settings.realtimeModel, this.settings.key);
      this.realtime = ws;
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error("The voice connection did not become ready."));
          ws.close();
        }
      }, 25000);
      ws.on("open", () =>
        this.sendRT({
          type: "session.update",
          session: {
            type: "realtime",
            model: this.settings.realtimeModel,
            instructions: instructions(this.state),
            output_modalities: ["audio"],
            audio: {
              input: {
                format: { type: "audio/pcm", rate: 24000 },
                transcription: {
                  model: "gpt-4o-mini-transcribe",
                  language: "en",
                },
                turn_detection: null,
              },
              output: {
                format: { type: "audio/pcm", rate: 24000 },
                voice: "marin",
              },
            },
            tools,
            tool_choice: "auto",
          },
        }),
      );
      ws.on("message", (raw) => {
        let event: Record<string, unknown>;
        try {
          event = JSON.parse(raw.toString());
        } catch {
          return;
        }
        if (event.type === "session.updated" && !settled) {
          settled = true;
          clearTimeout(timer);
          this.live.dmStatus = "ready";
          this.publish(false);
          resolve();
        }
        if (event.type === "error" && !settled) {
          settled = true;
          clearTimeout(timer);
          reject(
            new Error(
              (event.error as { message?: string })?.message ??
                "Voice setup failed.",
            ),
          );
          ws.close();
          return;
        }
        this.onRealtime(event);
      });
      ws.on("error", (error) => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          reject(error);
        }
        this.fail(error);
      });
      ws.on("close", () => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          reject(new Error("Voice connection closed before it was ready."));
        }
        if (this.realtime === ws) {
          this.realtime = null;
          this.replyActive = false;
          this.currentResponseId = null;
          this.live.speaker = null;
          this.live.dmStatus = "offline";
          this.broadcast({ type: "voice_closed" });
          this.publish(false);
        }
      });
    });
    try {
      await this.voiceReady;
      this.sendTo(player.id, { type: "voice_ready" });
    } catch (error) {
      this.voiceUsers.delete(player.id);
      this.fail(error);
      throw error;
    } finally {
      this.voiceReady = null;
    }
  }
  leaveVoice(playerId: string) {
    this.voiceUsers.delete(playerId);
    if (this.live.speaker === playerId) this.releaseFloor(playerId, false);
    this.sendTo(playerId, { type: "voice_closed" });
    if (!this.voiceUsers.size) this.stopVoice();
  }
  private sendTo(playerId: string, event: unknown) {
    for (const [ws, id] of this.clients)
      if (id === playerId) this.send(ws, event);
  }
  private sendRT(event: unknown) {
    if (this.realtime?.readyState === WebSocket.OPEN)
      this.realtime.send(JSON.stringify(event));
  }
  private requestResponse() {
    this.replyActive = true;
    this.live.dmStatus = "thinking";
    this.sendRT({ type: "response.create" });
    this.publish(false);
  }
  beginFloor(player: Player) {
    if (
      !this.voiceUsers.has(player.id) ||
      !this.realtime ||
      this.live.dmStatus === "connecting"
    )
      throw new GameError("Enable voice first.");
    if (
      this.state.phase !== "playing" ||
      this.state.pendingCheck ||
      this.state.rollDecision ||
      this.thinking
    )
      throw new GameError("Finish the current turn or dice check first.");
    if (this.live.speaker && this.live.speaker !== player.id)
      throw new GameError("Your companion is speaking.", 409);
    if (this.live.speaker === player.id) return;
    if (this.replyActive) {
      this.sendRT({ type: "response.cancel" });
      this.replyActive = false;
    }
    if (this.lastOutput) {
      const elapsed = Math.max(
        0,
        Math.min(
          this.lastOutput.duration,
          Date.now() - this.lastOutput.started - 150,
        ),
      );
      this.sendRT({
        type: "conversation.item.truncate",
        item_id: this.lastOutput.itemId,
        content_index: 0,
        audio_end_ms: Math.floor(elapsed),
      });
      this.lastOutput = null;
    }
    this.broadcast({ type: "audio_clear" });
    this.sendRT({ type: "input_audio_buffer.clear" });
    this.sendRT({
      type: "session.update",
      session: { instructions: instructions(this.state) },
    });
    this.sendRT({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: `The next audio turn is ${player.name} playing ${player.characterId}. Listen to their action, do not respond to this label.`,
          },
        ],
      },
    });
    this.toolRounds = 0;
    this.state.lastRoll = null;
    this.live.speaker = player.id;
    this.audioBytes = 0;
    this.floorTimer = setTimeout(
      () => this.releaseFloor(player.id, true),
      60000,
    );
    this.sendTo(player.id, { type: "floor_granted" });
    this.publish(false);
  }
  audio(playerId: string, data: string) {
    if (this.live.speaker !== playerId) return;
    const bytes = Buffer.from(data, "base64");
    if (bytes.length > 12000 || bytes.length % 2 !== 0) return;
    if (this.audioBytes + bytes.length > 2_880_000) {
      this.commitFloor(playerId);
      return;
    }
    this.audioBytes += bytes.length;
    this.sendRT({ type: "input_audio_buffer.append", audio: data });
    this.broadcast({ type: "audio", delta: data, source: playerId }, playerId);
  }
  releaseFloor(playerId: string, commit = true) {
    if (this.live.speaker !== playerId) return;
    if (this.floorTimer) clearTimeout(this.floorTimer);
    this.floorTimer = null;
    this.live.speaker = null;
    this.sendTo(playerId, { type: "floor_released" });
    if (commit && this.audioBytes >= 4800) {
      this.speakerCommits.push(playerId);
      this.sendRT({ type: "input_audio_buffer.commit" });
      this.requestResponse();
    } else {
      this.sendRT({ type: "input_audio_buffer.clear" });
      this.live.dmStatus = this.realtime ? "ready" : "offline";
    }
    this.audioBytes = 0;
    this.publish(false);
  }
  private onRealtime(event: Record<string, unknown>) {
    const type = event.type;
    if (type === "response.created") {
      this.replyActive = true;
      this.currentResponseId = (event.response as { id: string }).id;
    }
    if (type === "response.output_audio.delta") {
      const delta = event.delta as string;
      const itemId = event.item_id as string;
      if (this.lastOutput?.itemId !== itemId)
        this.lastOutput = { itemId, started: Date.now(), duration: 0 };
      this.lastOutput.duration += Buffer.from(delta, "base64").length / 48;
      this.live.dmStatus = "speaking";
      this.broadcast({ type: "audio", delta, source: "dm" });
      this.broadcast({ type: "dm_status", status: "speaking" });
    }
    if (type === "response.output_audio_transcript.delta")
      this.broadcast({
        type: "caption",
        delta: event.delta,
        itemId: event.item_id,
      });
    if (type === "response.output_audio_transcript.done") {
      log(this.state, "dm", event.transcript as string);
      this.broadcast({ type: "caption_done" });
      this.publish();
    }
    if (type === "input_audio_buffer.committed") {
      const speaker = this.speakerCommits.shift();
      if (speaker) this.committedSpeakers.set(event.item_id as string, speaker);
    }
    if (type === "conversation.item.input_audio_transcription.completed") {
      // Speaker identity is captured before commit, not read from a floor that may now be empty.
      const transcript = event.transcript as string;
      log(
        this.state,
        "player",
        transcript,
        this.committedSpeakers.get(event.item_id as string),
      );
      this.committedSpeakers.delete(event.item_id as string);
      this.publish();
    }
    if (type === "response.done") {
      const response = event.response as {
        id: string;
        status: string;
        status_details?: { error?: { message?: string } };
        output?: {
          type: string;
          name?: string;
          arguments?: string;
          call_id?: string;
        }[];
      };
      if (this.currentResponseId !== response.id) return;
      this.replyActive = false;
      this.currentResponseId = null;
      if (response.status === "failed") {
        this.fail(
          new Error(
            response.status_details?.error?.message ??
              "The voice storyteller could not complete the turn.",
          ),
        );
        return;
      }
      const calls =
        response.output?.filter((o) => o.type === "function_call") ?? [];
      if (calls.length) {
        if (++this.toolRounds > 8) {
          this.fail(
            new Error(
              "The storyteller could not finish this turn. Resume to continue.",
            ),
          );
          return;
        }
        let illustrates = 0;
        for (const call of calls) {
          let result: unknown;
          try {
            const args = JSON.parse(call.arguments ?? "{}");
            if (call.name === "request_check")
              result = requestCheck(this.state, args);
            else if (call.name === "update_party")
              result = applyConsequences(this.state, args);
            else if (call.name === "illustrate_scene" && illustrates++ === 0) {
              result = setScene(this.state, args);
              this.enqueueImage(this.state.scene);
            } else throw new Error("Unknown or duplicate tool.");
          } catch (error) {
            result = {
              error: error instanceof Error ? error.message : "Tool rejected",
            };
          }
          this.sendRT({
            type: "conversation.item.create",
            item: {
              type: "function_call_output",
              call_id: call.call_id,
              output: JSON.stringify(result),
            },
          });
        }
        this.publish();
        if (this.state.pendingCheck?.characterId === "emily") this.rollNPC();
        this.requestResponse();
      } else {
        this.live.dmStatus = "ready";
        this.publish(false);
      }
    }
    if (type === "error") {
      const err = event.error as { code?: string; message?: string };
      if (err.code === "response_cancel_not_active") return;
      this.replyActive = false;
      this.fail(new Error(err.message ?? "Voice session error."));
    }
  }
  private speakerCommits: string[] = [];
  private committedSpeakers = new Map<string, string>();
  commitFloor(playerId: string) {
    this.releaseFloor(playerId, true);
  }
  private rollNPC() {
    const check = this.state.pendingCheck;
    if (!check || check.characterId !== "emily") return null;
    const result = rollCompanion(this.state, check.id);
    this.publish();
    if (this.realtime)
      this.sendRT({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: `NPC authoritative dice result: ${JSON.stringify(this.state.lastRoll)}. Harm is already applied.`,
            },
          ],
        },
      });
    return result;
  }
  toggleImages(enabled: boolean) {
    this.live.imageEnabled = enabled;
    this.state.preferences.illustrations = enabled;
    this.publish();
  }
  retryImage() {
    if (this.generation)
      throw new GameError("An illustration is already being painted.", 409);
    if (!this.live.imageEnabled)
      throw new GameError("Enable scene illustrations first.");
    this.state.scene.status = "generating";
    delete this.state.scene.error;
    this.publish();
    this.enqueueImage(this.state.scene);
  }
  private enqueueImage(scene: Scene) {
    if (!this.live.imageEnabled) {
      scene.status = "error";
      scene.error = "Scene illustrations are paused.";
      this.publish();
      return;
    }
    if (this.nextImage && this.nextImage.id !== scene.id) {
      this.nextImage.status = "error";
      this.nextImage.error =
        "A newer scene took its place before painting began.";
    }
    this.nextImage = scene;
    if (!this.generation) void this.generateImage();
  }
  private async generateImage() {
    const scene = this.nextImage;
    if (!scene || this.closed) return;
    this.nextImage = null;
    this.generation = true;
    if (Date.now() - this.imageWindow > 3600000) {
      this.imageWindow = Date.now();
      this.imageCount = 0;
    }
    try {
      this.requireAI();
      if (this.imageCount >= 24)
        throw new Error(
          "This table has reached its 24 illustrations per hour limit.",
        );
      this.imageCount++;
      const response = await fetch(
        "https://api.openai.com/v1/images/generations",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.settings.key}`,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(180000),
          body: JSON.stringify({
            model: this.settings.imageModel,
            prompt: `${artDirection}\nCurrent scene: ${scene.title}, ${scene.location}. ${scene.description}\nVisual direction: ${scene.prompt}`,
            quality: "low",
            size: "1536x1024",
            output_format: "webp",
            n: 1,
          }),
        },
      );
      const result = (await response.json()) as {
        data?: { b64_json?: string }[];
        error?: { message?: string };
      };
      if (!response.ok)
        throw new Error(
          `Scene generation failed (${response.status}): ${result.error?.message ?? "Unknown error"}`,
        );
      const b64 = result.data?.[0]?.b64_json;
      if (!b64) throw new Error("The image service returned no illustration.");
      const directory = join(this.settings.dataDir, "images", this.state.id);
      mkdirSync(directory, { recursive: true });
      writeFileSync(
        join(directory, `${scene.id}.webp`),
        Buffer.from(b64, "base64"),
      );
      this.updateImage(scene.id, {
        imageUrl: `/api/rooms/${this.state.id}/images/${scene.id}.webp`,
        status: "ready",
      });
    } catch (error) {
      this.updateImage(scene.id, {
        status: "error",
        error:
          error instanceof Error ? error.message : "Scene generation failed.",
      });
    } finally {
      this.generation = false;
      this.publish();
      if (this.nextImage) void this.generateImage();
    }
  }
  private updateImage(id: string, patch: Partial<Scene>) {
    const scene = [this.state.scene, ...this.state.sceneHistory].find(
      (s) => s.id === id,
    );
    if (scene) Object.assign(scene, patch);
  }
  stopVoice() {
    if (this.floorTimer) clearTimeout(this.floorTimer);
    this.floorTimer = null;
    this.live.speaker = null;
    this.voiceUsers.clear();
    if (this.realtime) {
      const ws = this.realtime;
      this.realtime = null;
      ws.close();
    }
    this.replyActive = false;
    this.currentResponseId = null;
    this.speakerCommits = [];
    this.committedSpeakers.clear();
    this.live.dmStatus = "offline";
    this.broadcast({ type: "audio_clear" });
    this.broadcast({ type: "voice_closed" });
    this.publish(false);
  }
  close() {
    this.closed = true;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.stopVoice();
    for (const ws of this.clients.keys()) ws.close();
  }
}
export const socketMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("voice_start") }),
  z.object({ type: z.literal("voice_stop") }),
  z.object({ type: z.literal("floor_start") }),
  z.object({ type: z.literal("floor_end") }),
  z.object({ type: z.literal("audio"), data: z.string().max(18000) }),
]);
