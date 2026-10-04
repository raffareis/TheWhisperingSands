import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  createHash,
  timingSafeEqual,
  randomUUID,
} from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { initialState, log } from "./game.js";
import type { Credentials, RoomState, Player } from "../shared/types.js";
export class GameError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const equal = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export class RoomStore {
  db: DatabaseSync;
  constructor(directory: string) {
    mkdirSync(directory, { recursive: true });
    this.db = new DatabaseSync(join(directory, "adventure.sqlite"));
    this.db.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS rooms(id TEXT PRIMARY KEY, state TEXT NOT NULL, invite_hash TEXT NOT NULL); CREATE TABLE IF NOT EXISTS seats(token_hash TEXT PRIMARY KEY,room_id TEXT NOT NULL,player_id TEXT NOT NULL); CREATE TABLE IF NOT EXISTS worker_attempts(room_id TEXT NOT NULL,task TEXT NOT NULL,at INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS worker_attempts_at ON worker_attempts(at); CREATE TABLE IF NOT EXISTS recovery_codes(code_hash TEXT PRIMARY KEY,room_id TEXT NOT NULL,player_id TEXT NOT NULL,expires_at INTEGER NOT NULL);",
    );
  }
  load(id: string): RoomState {
    const row = this.db
      .prepare("SELECT state FROM rooms WHERE id=?")
      .get(id) as { state: string } | undefined;
    if (!row) throw new GameError("This adventure could not be found.", 404);
    return JSON.parse(row.state);
  }
  save(state: RoomState) {
    state.revision++;
    this.db
      .prepare("UPDATE rooms SET state=? WHERE id=?")
      .run(JSON.stringify(state), state.id);
  }
  create(name: string, characterId: "sam" | "liz") {
    const id = randomBytes(6).toString("base64url").toLowerCase();
    const invite = randomBytes(24).toString("base64url");
    const state = initialState(id);
    this.db
      .prepare("INSERT INTO rooms VALUES(?,?,?)")
      .run(id, JSON.stringify(state), digest(invite));
    const credentials = this.addPlayer(state, name, characterId);
    return { state, credentials, invite };
  }
  join(id: string, invite: string, name: string) {
    const row = this.db
      .prepare("SELECT invite_hash FROM rooms WHERE id=?")
      .get(id) as { invite_hash: string } | undefined;
    if (!row || !equal(row.invite_hash, digest(invite)))
      throw new GameError("This invite is not valid.", 403);
    const state = this.load(id);
    if (state.players.length >= 2)
      throw new GameError(
        "This table already has two players. Use your saved session to return.",
        409,
      );
    const characterId = state.players[0].characterId === "sam" ? "liz" : "sam";
    const credentials = this.addPlayer(state, name, characterId);
    return { state, credentials };
  }
  private addPlayer(
    state: RoomState,
    name: string,
    characterId: "sam" | "liz",
  ): Credentials {
    const id = randomUUID();
    const token = randomBytes(32).toString("base64url");
    state.players.push({ id, name, characterId });
    log(
      state,
      "system",
      `${name} joined the table as ${state.characters.find((c) => c.id === characterId)!.shortName}.`,
    );
    this.db.exec("BEGIN");
    try {
      this.db
        .prepare("INSERT INTO seats VALUES(?,?,?)")
        .run(digest(token), state.id, id);
      this.save(state);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    return { roomId: state.id, playerId: id, token };
  }
  authenticate(
    token: string,
    roomId?: string,
  ): { state: RoomState; player: Player } {
    const row = this.db
      .prepare("SELECT room_id,player_id FROM seats WHERE token_hash=?")
      .get(digest(token)) as { room_id: string; player_id: string } | undefined;
    if (!row || (roomId && row.room_id !== roomId))
      throw new GameError(
        "Your saved seat token is not valid. Ask your companion for a recovery link.",
        401,
      );
    const state = this.load(row.room_id);
    const player = state.players.find((p) => p.id === row.player_id);
    if (!player) throw new GameError("Player not found.", 401);
    return { state, player };
  }
  invite(roomId: string) {
    const invite = randomBytes(24).toString("base64url");
    this.db
      .prepare("UPDATE rooms SET invite_hash=? WHERE id=?")
      .run(digest(invite), roomId);
    return invite;
  }
  // A current seat holder may transfer either occupied seat in their own table.
  // The code is a bearer secret: never put it in public state, logs or a URL query.
  recovery(
    token: string,
    roomId: string,
    characterId: "sam" | "liz",
    now = Date.now(),
  ) {
    const { state } = this.authenticate(token, roomId);
    const target = state.players.find(
      (player) => player.characterId === characterId,
    );
    if (!target)
      throw new GameError("That seat has not been occupied yet.", 409);
    const recoveryCode = randomBytes(32).toString("base64url");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          "DELETE FROM recovery_codes WHERE (room_id=? AND player_id=?) OR expires_at<=?",
        )
        .run(roomId, target.id, now);
      this.db
        .prepare("INSERT INTO recovery_codes VALUES(?,?,?,?)")
        .run(digest(recoveryCode), roomId, target.id, now + 15 * 60 * 1000);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return { recoveryCode };
  }
  recover(roomId: string, recoveryCode: string, now = Date.now()) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const row = this.db
        .prepare(
          "SELECT player_id,expires_at FROM recovery_codes WHERE code_hash=? AND room_id=?",
        )
        .get(digest(recoveryCode), roomId) as
        { player_id: string; expires_at: number } | undefined;
      if (!row || row.expires_at <= now)
        throw new GameError(
          "This recovery code is invalid, expired or already used.",
          403,
        );
      const state = this.load(roomId);
      if (!state.players.some((player) => player.id === row.player_id))
        throw new GameError("This seat cannot be recovered.", 403);
      const token = randomBytes(32).toString("base64url");
      this.db
        .prepare("DELETE FROM seats WHERE room_id=? AND player_id=?")
        .run(roomId, row.player_id);
      this.db
        .prepare("INSERT INTO seats VALUES(?,?,?)")
        .run(digest(token), roomId, row.player_id);
      this.db
        .prepare("DELETE FROM recovery_codes WHERE room_id=? AND player_id=?")
        .run(roomId, row.player_id);
      this.db.exec("COMMIT");
      return { state, credentials: { roomId, playerId: row.player_id, token } };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  reserveWorker(roomId: string, task: string) {
    const since = Date.now() - 3600000;
    const image = task === "illustration";
    const category = image ? "illustration" : "notebook";
    const count = (room: boolean) =>
      (
        this.db
          .prepare(
            `SELECT count(*) AS n FROM worker_attempts WHERE at>? AND task=?${room ? " AND room_id=?" : ""}`,
          )
          .get(...(room ? [since, category, roomId] : [since, category])) as {
          n: number;
        }
      ).n;
    if (count(true) >= (image ? 24 : 60) || count(false) >= (image ? 120 : 300))
      throw new GameError(
        "Background work has reached its hourly budget. Continue playing; no automatic retry.",
        429,
      );
    this.db
      .prepare("INSERT INTO worker_attempts VALUES(?,?,?)")
      .run(roomId, category, Date.now());
    this.db
      .prepare("DELETE FROM worker_attempts WHERE at<?")
      .run(since - 3600000);
  }
  close() {
    this.db.close();
  }
}
