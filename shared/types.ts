export type CharacterId = "sam" | "liz" | "emily";
export type Stat = "STR" | "INT" | "SUR";
export interface Item {
  id: string;
  name: string;
  description: string;
  quantity: number;
}
export interface Character {
  id: CharacterId;
  name: string;
  shortName: string;
  role: string;
  bio: string;
  stats: Record<Stat, number>;
  hp: number;
  maxHp: number;
  inventory: Item[];
}
export interface Player {
  id: string;
  name: string;
  characterId: "sam" | "liz";
}
export interface JournalEntry {
  id: string;
  kind: "dm" | "player" | "roll" | "system";
  text: string;
  at: string;
  playerId?: string;
}
export interface Check {
  id: string;
  characterId: CharacterId;
  stat: Stat;
  target: number;
  reason: string;
  dangerous: boolean;
}
export interface Roll extends Check {
  die: number;
  total: number;
  success: boolean;
  rerolled: boolean;
}
export interface Scene {
  id: string;
  title: string;
  location: string;
  description: string;
  prompt: string;
  imageUrl: string;
  status: "ready" | "generating" | "error";
  error?: string;
}
export interface RoomState {
  id: string;
  revision: number;
  createdAt: string;
  players: Player[];
  characters: Character[];
  chapter: number;
  chapterTitle: string;
  scene: Scene;
  sceneHistory: Scene[];
  clues: { id: string; title: string; text: string }[];
  journal: JournalEntry[];
  pendingCheck: Check | null;
  lastRoll: Roll | null;
  rollDecision: string | null;
  preferences: { illustrations: boolean };
  puzzles?: PuzzleProgress[];
  puzzleView?: PuzzleView | null;
  workers?: WorkerJob[];
  learningNotes?: { id: string; text: string; sceneId: string }[];
  phase: "lobby" | "playing" | "complete";
}
export interface Credentials {
  roomId: string;
  playerId: string;
  token: string;
}
export interface Presence {
  playerId: string;
  online: boolean;
}
export type DMStatus =
  "offline" | "connecting" | "ready" | "thinking" | "speaking" | "error";
export interface LiveState {
  dmStatus: DMStatus;
  speaker: string | null;
  imageEnabled: boolean;
  error?: string;
  presence: Presence[];
}
export interface Configuration {
  aiAvailable: boolean;
  realtimeModel: string;
  imageModel: string;
}

export interface PuzzleProgress {
  id: string;
  accepted: ("sam" | "liz")[];
  attempts: number;
  hintCount: number;
  solved: boolean;
}
export interface PuzzleView {
  id: string;
  title: string;
  premise: string;
  languageFocus: string;
  evidenceTitle: string;
  evidence: string[];
  task: string;
  format: string;
  hints: string[];
  accepted: ("sam" | "liz")[];
  solved: boolean;
  attempts: number;
  reward: string | null;
}
export interface WorkerJob {
  id: string;
  task: "illustration" | "recap" | "language_coach";
  contextId: string;
  status: "queued" | "running" | "ready" | "error" | "superseded";
  startedAt: string;
  durationMs?: number;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  error?: string;
}
