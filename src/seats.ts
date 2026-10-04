import type { Credentials, RoomState } from "../shared/types";

export interface SavedSeat {
  credentials: Credentials;
  name: string;
  character: string;
  title: string;
}
const historyKey = "whispering-seats";
export function savedSeats(): SavedSeat[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(historyKey) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((seat): seat is SavedSeat => {
      const c = seat?.credentials;
      return (
        !!c &&
        typeof c.roomId === "string" &&
        typeof c.playerId === "string" &&
        typeof c.token === "string"
      );
    });
  } catch {
    return [];
  }
}
export function rememberSeat(
  credentials: Credentials,
  room?: RoomState | null,
) {
  const previous = savedSeats();
  const player = room?.players.find((p) => p.id === credentials.playerId);
  const existing = previous.find(
    (s) =>
      s.credentials.roomId === credentials.roomId &&
      s.credentials.playerId === credentials.playerId,
  );
  const value: SavedSeat = {
    credentials,
    name: player?.name ?? existing?.name ?? "Your saved seat",
    character: player?.characterId ?? existing?.character ?? "",
    title: room?.chapterTitle ?? existing?.title ?? "Saved adventure",
  };
  localStorage.setItem(
    historyKey,
    JSON.stringify([
      value,
      ...previous.filter(
        (s) =>
          s.credentials.roomId !== credentials.roomId ||
          s.credentials.playerId !== credentials.playerId,
      ),
    ]),
  );
}
