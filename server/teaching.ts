import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { z } from "zod";
import { RoomStore, GameError } from "./store.js";
import { initialState, log } from "./game.js";
import type { Credentials, RoomState } from "../shared/types.js";
import type { TeachingTable } from "../shared/teaching.js";

const label = z.string().trim().min(1).max(100);
const date = z
  .string()
  .refine(
    (value) =>
      value === "" ||
      (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
        !Number.isNaN(Date.parse(value)) &&
        new Date(value).toISOString().slice(0, 10) === value),
    "Use a valid lesson date.",
  );
export const lessonDetailsSchema = z.object({
  title: label,
  cohort: z.string().trim().max(100),
  notes: z.string().max(6000),
  nextLesson: date,
});
export const lessonCreateSchema = lessonDetailsSchema
  .extend({
    sam: z.string().trim().max(40),
    liz: z.string().trim().max(40),
    existingRoomId: z
      .string()
      .regex(/^[a-z0-9_-]{4,20}$/)
      .optional(),
  })
  .strict()
  .refine(
    (value) => !!value.existingRoomId || !!(value.sam && value.liz),
    "Enter both student names.",
  );
export const lessonUpdateSchema = lessonDetailsSchema
  .partial()
  .extend({ status: z.enum(["active", "paused", "archived"]).optional() })
  .strict();
type RecordRow = {
  room_id: string;
  details: string;
  status: TeachingTable["status"];
  created_at: string;
  updated_at: string;
  sealed_links: string;
};
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");

// The teacher sees private access links; SQLite stores only their hashes and
// authenticated ciphertext, encrypted by the existing installation host key.
export class TeachingDesk {
  private key: Buffer;
  constructor(
    private store: RoomStore,
    hostKey: string,
  ) {
    if (!hostKey)
      throw new Error("Configure host access before opening the teacher desk.");
    this.key = createHash("sha256")
      .update("classroom-links:" + hostKey)
      .digest();
  }
  private seal(codes: Record<string, string>) {
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const body = Buffer.concat([
      cipher.update(JSON.stringify(codes), "utf8"),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
  }
  private unseal(value: string): Record<string, string> {
    const data = Buffer.from(value, "base64"),
      decipher = createDecipheriv(
        "aes-256-gcm",
        this.key,
        data.subarray(0, 12),
      );
    decipher.setAuthTag(data.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([
        decipher.update(data.subarray(28)),
        decipher.final(),
      ]).toString("utf8"),
    );
  }
  private record(id: string) {
    const row = this.store.db
      .prepare("SELECT * FROM classroom_tables WHERE room_id=?")
      .get(id) as RecordRow | undefined;
    if (!row)
      throw new GameError("This teaching table could not be found.", 404);
    return row;
  }
  private view(row: RecordRow): TeachingTable {
    const state = this.store.load(row.room_id),
      codes = this.unseal(row.sealed_links);
    const progress = state.puzzles ?? [];
    return {
      ...JSON.parse(row.details),
      id: row.room_id,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastPlayedAt: state.journal.at(-1)?.at ?? state.createdAt,
      phase: state.phase,
      chapterTitle: state.chapterTitle,
      solved: progress.filter((p) => p.solved).length,
      total: 5,
      hints: progress.reduce((n, p) => n + p.hintCount, 0),
      attempts: progress.reduce((n, p) => n + p.attempts, 0),
      recap:
        state.journal.filter((e) => e.kind === "dm").at(-1)?.text ??
        "The adventure has not started yet.",
      students: state.players.map((p) => ({
        name: p.name,
        character: p.characterId,
        entryPath: `/whispering-sands?room=${state.id}#seat=${codes[p.id]}`,
      })),
    };
  }
  list() {
    return (
      this.store.db
        .prepare("SELECT * FROM classroom_tables ORDER BY updated_at DESC")
        .all() as RecordRow[]
    ).map((row) => this.view(row));
  }
  get(id: string) {
    return this.view(this.record(id));
  }
  create(raw: unknown) {
    const { sam, liz, existingRoomId, ...details } =
      lessonCreateSchema.parse(raw);
    const state = existingRoomId
      ? this.store.load(existingRoomId)
      : initialState(randomBytes(6).toString("base64url").toLowerCase());
    if (existingRoomId) {
      if (state.players.length !== 2)
        throw new GameError(
          "Invite the second player before bringing this adventure to the teacher desk.",
          409,
        );
      if (
        this.store.db
          .prepare("SELECT room_id FROM classroom_tables WHERE room_id=?")
          .get(state.id)
      )
        throw new GameError(
          "This adventure is already on the teacher desk.",
          409,
        );
    } else {
      for (const [name, characterId] of [
        [sam, "sam"],
        [liz, "liz"],
      ] as const) {
        state.players.push({ id: randomUUID(), name, characterId });
        log(
          state,
          "system",
          `${name} has a reserved seat as ${characterId === "sam" ? "Sam" : "Liz"}.`,
        );
      }
    }
    const codes = Object.fromEntries(
      state.players.map((p) => [p.id, randomBytes(32).toString("base64url")]),
    );
    const sealed = this.seal(codes),
      now = new Date().toISOString();
    this.store.db.exec("BEGIN IMMEDIATE");
    try {
      if (!existingRoomId)
        this.store.db
          .prepare("INSERT INTO rooms VALUES(?,?,?)")
          .run(
            state.id,
            JSON.stringify(state),
            digest(randomBytes(32).toString("base64url")),
          );
      this.store.db
        .prepare("INSERT INTO classroom_tables VALUES(?,?,?,?,?,?)")
        .run(state.id, JSON.stringify(details), "active", now, now, sealed);
      for (const p of state.players)
        this.store.db
          .prepare("INSERT INTO classroom_entries VALUES(?,?,?)")
          .run(digest(codes[p.id]), state.id, p.id);
      this.store.db.exec("COMMIT");
    } catch (error) {
      this.store.db.exec("ROLLBACK");
      throw error;
    }
    return this.get(state.id);
  }
  update(id: string, raw: unknown) {
    const { status, ...patch } = lessonUpdateSchema.parse(raw),
      row = this.record(id);
    this.store.db
      .prepare(
        "UPDATE classroom_tables SET details=?,status=?,updated_at=? WHERE room_id=?",
      )
      .run(
        JSON.stringify({ ...JSON.parse(row.details), ...patch }),
        status ?? row.status,
        new Date().toISOString(),
        id,
      );
    return this.get(id);
  }
  // A permanent lesson link works from a fresh browser next week, while a
  // newly claimed seat replaces its previous device's credentials.
  enter(
    roomId: string,
    code: string,
  ): { state: RoomState; credentials: Credentials } {
    this.store.db.exec("BEGIN IMMEDIATE");
    try {
      const row = this.store.db
        .prepare(
          "SELECT player_id FROM classroom_entries WHERE code_hash=? AND room_id=?",
        )
        .get(digest(code), roomId) as { player_id: string } | undefined;
      if (!row)
        throw new GameError(
          "This student link is not valid. Ask your teacher for the current link.",
          403,
        );
      const state = this.store.load(roomId),
        token = randomBytes(32).toString("base64url");
      if (!state.players.some((p) => p.id === row.player_id))
        throw new GameError("This student seat is unavailable.", 403);
      this.store.db
        .prepare("DELETE FROM seats WHERE room_id=? AND player_id=?")
        .run(roomId, row.player_id);
      this.store.db
        .prepare("INSERT INTO seats VALUES(?,?,?)")
        .run(digest(token), roomId, row.player_id);
      this.store.db
        .prepare("DELETE FROM recovery_codes WHERE room_id=? AND player_id=?")
        .run(roomId, row.player_id);
      this.store.db.exec("COMMIT");
      return { state, credentials: { roomId, playerId: row.player_id, token } };
    } catch (error) {
      this.store.db.exec("ROLLBACK");
      throw error;
    }
  }
  rotate(id: string, character: "sam" | "liz") {
    const row = this.record(id),
      state = this.store.load(id),
      player = state.players.find((p) => p.characterId === character)!;
    const codes = this.unseal(row.sealed_links);
    codes[player.id] = randomBytes(32).toString("base64url");
    const sealed = this.seal(codes);
    this.store.db.exec("BEGIN IMMEDIATE");
    try {
      this.store.db
        .prepare(
          "DELETE FROM classroom_entries WHERE room_id=? AND player_id=?",
        )
        .run(id, player.id);
      this.store.db
        .prepare("INSERT INTO classroom_entries VALUES(?,?,?)")
        .run(digest(codes[player.id]), id, player.id);
      this.store.db
        .prepare("DELETE FROM seats WHERE room_id=? AND player_id=?")
        .run(id, player.id);
      this.store.db
        .prepare("DELETE FROM recovery_codes WHERE room_id=? AND player_id=?")
        .run(id, player.id);
      this.store.db
        .prepare(
          "UPDATE classroom_tables SET sealed_links=?,updated_at=? WHERE room_id=?",
        )
        .run(sealed, new Date().toISOString(), id);
      this.store.db.exec("COMMIT");
    } catch (error) {
      this.store.db.exec("ROLLBACK");
      throw error;
    }
    return { table: this.get(id), playerId: player.id };
  }
}
