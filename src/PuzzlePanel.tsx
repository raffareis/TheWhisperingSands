import { useState } from "react";
import type { Credentials, RoomState } from "../shared/types";
export function PuzzlePanel({
  room,
  credentials,
}: {
  room: RoomState;
  credentials: Credentials;
}) {
  const [answer, setAnswer] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const p = room.puzzleView;
  if (!p) return null;
  const character = room.players.find(
    (p) => p.id === credentials.playerId,
  )?.characterId;
  const accepted = !!character && p.accepted.includes(character);
  async function send(route: string, value: unknown) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/rooms/${room.id}/${route}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${credentials.token}`,
        },
        body: JSON.stringify(value),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Please try again.");
      if (route === "puzzle-answer")
        setMessage(
          result.message ??
            (result.solved
              ? "Both locks accepted. Read your discovery below."
              : "Your lock accepted. Let your partner complete theirs."),
        );
      if (route === "background")
        setMessage("Your notebook helper is working in the background.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="puzzle-panel" aria-labelledby="puzzle-title">
      <div className="section-eyebrow">
        FIELD EVIDENCE · CHAPTER {room.chapter + 1} / 5
      </div>
      <h2 id="puzzle-title">{p.title}</h2>
      <p>{p.premise}</p>
      <p className="language-focus">English in use: {p.languageFocus}</p>
      <article className="evidence-card">
        <span className="section-eyebrow">
          YOUR PRIVATE RECORD · {character?.toUpperCase()}
        </span>
        <h3>{p.evidenceTitle}</h3>
        {p.evidence.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
        <small>
          Your partner has a different record. Describe this one in English.
        </small>
      </article>
      <div className="puzzle-status" aria-live="polite">
        Sam's lock: {p.accepted.includes("sam") ? "accepted" : "waiting"} ·
        Liz's lock: {p.accepted.includes("liz") ? "accepted" : "waiting"}
      </div>
      {p.solved ? (
        <article className="evidence-card solved">
          <h3>Discovery recorded</h3>
          <p>{p.reward}</p>
          <p>Tell the storyteller what you discovered to continue.</p>
        </article>
      ) : (
        <form
          className="puzzle-submit"
          onSubmit={(e) => {
            e.preventDefault();
            void send("puzzle-answer", { puzzleId: p.id, answer });
          }}
        >
          <label htmlFor="puzzle-answer">{p.task}</label>
          <small>{p.format}</small>
          <input
            id="puzzle-answer"
            value={answer}
            maxLength={200}
            autoComplete="off"
            onChange={(e) => setAnswer(e.target.value)}
            disabled={accepted || busy}
            placeholder="Compare your evidence first…"
          />
          <button type="submit" disabled={accepted || busy || !answer.trim()}>
            {accepted ? "Your lock accepted" : "Test arrangement"}
          </button>
        </form>
      )}
      {!p.solved && (
        <div className="puzzle-hints">
          <button
            disabled={busy || p.hints.length >= 3}
            onClick={() => void send("puzzle-hint", { puzzleId: p.id })}
          >
            Reveal hint {Math.min(p.hints.length + 1, 3)} of 3
          </button>
          <small>No time penalty. No HP lost for trying.</small>
          {p.hints.map((hint, i) => (
            <p key={i}>
              <strong>Hint {i + 1}.</strong> {hint}
            </p>
          ))}
        </div>
      )}
      {message && <p role="status">{message}</p>}
      <details className="worker-notebook">
        <summary>Expedition notebook &amp; English helper</summary>
        <p>Ask a helper while the storyteller continues.</p>
        <button
          disabled={busy}
          onClick={() => void send("background", { task: "recap" })}
        >
          Summarise our discoveries
        </button>
        <button
          disabled={busy}
          onClick={() => void send("background", { task: "language_coach" })}
        >
          English feedback
        </button>
        {room.workers
          ?.filter(
            (j) =>
              j.status === "queued" ||
              j.status === "running" ||
              j.status === "error",
          )
          .slice(-4)
          .map((j) => (
            <p key={j.id}>
              {j.task.replaceAll("_", " ")}: {j.status}
              {j.error ? ` — ${j.error}` : ""}
            </p>
          ))}
        {room.learningNotes
          ?.filter((n) => n.sceneId === room.scene.id)
          .map((n) => (
            <p key={n.id}>{n.text.replaceAll("**", "")}</p>
          ))}
      </details>
    </section>
  );
}
