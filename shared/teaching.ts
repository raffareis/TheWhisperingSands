export type LessonStatus = "active" | "paused" | "archived";
export interface LessonDetails {
  title: string;
  cohort: string;
  notes: string;
  nextLesson: string;
}
export interface TeachingTable extends LessonDetails {
  id: string;
  status: LessonStatus;
  createdAt: string;
  updatedAt: string;
  lastPlayedAt: string;
  phase: "lobby" | "playing" | "complete";
  chapterTitle: string;
  solved: number;
  total: number;
  hints: number;
  attempts: number;
  recap: string;
  students: { name: string; character: "sam" | "liz"; entryPath: string }[];
}
