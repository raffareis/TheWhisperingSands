import { useEffect, useState } from "react";
import { BookOpenText, EyeOff, Lightbulb, Lock, LockOpen } from "lucide-react";
import type { Credentials, RoomState } from "../shared/types";
export function PuzzlePanel({
  room,
  credentials,
  readingMode,
  setReadingMode,
}: {
  room: RoomState;
  credentials: Credentials;
  readingMode: boolean;
  setReadingMode: (value: boolean) => void;
}) {
  const [answer, setAnswer] = useState("");
  const [message, setMessage] = useState("");
  const [requestBusy, setBusy] = useState(false);
  const lessonPaused = !!room.lessonStatus && room.lessonStatus !== "active";
  const busy = requestBusy || lessonPaused;
  const p = room.puzzleView;
  useEffect(() => {
    setAnswer("");
    setMessage("");
  }, [p?.id]);
  if (!p) return null;
  const character = room.players.find(
    (p) => p.id === credentials.playerId,
  )?.characterId;
  const accepted = !!character && p.accepted.includes(character);
  async function send(route: string, value: unknown) {
    if (lessonPaused) return;
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
  const partner = character === "sam" ? "liz" : "sam";
  const locks = (["sam", "liz"] as const).map((id) => ({
    id,
    name:
      room.characters.find((c) => c.id === id)?.shortName ??
      (id === "sam" ? "Sam" : "Liz"),
    accepted: p.accepted.includes(id),
    own: id === character,
  }));
  return (
    <section
      className={`puzzle-panel ${readingMode ? "reading-mode" : ""}`}
      aria-labelledby="puzzle-title"
    >
      <div className="puzzle-heading">
        <span className="section-eyebrow">Evidence lock</span>
        <button
          className="reading-toggle"
          aria-pressed={readingMode}
          onClick={() => setReadingMode(!readingMode)}
        >
          <BookOpenText size={15} />
          Reading mode
        </button>
      </div>
      <h2 id="puzzle-title">{p.title}</h2>
      <p className="puzzle-premise">{p.premise}</p>
      <p className="language-focus">
        <strong>English in use:</strong> {p.languageFocus}
      </p>
      <ul className="puzzle-status" aria-live="polite" aria-label="Locks">
        {locks.map((lock) => (
          <li key={lock.id} className={lock.accepted ? "accepted" : ""}>
            {lock.accepted ? <LockOpen size={16} /> : <Lock size={16} />}
            <span>
              {lock.own ? "Your lock" : `${lock.name}'s lock`}
              <strong>{lock.accepted ? "accepted" : "waiting"}</strong>
            </span>
          </li>
        ))}
      </ul>
      <article className="evidence-card">
        <span className="evidence-owner">
          <EyeOff size={14} />
          Private · only you can see this
        </span>
        <h3>{p.evidenceTitle}</h3>
        <div className="evidence-lines">
          {p.evidence.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
        <small>
          {locks.find((l) => l.id === partner)?.name ?? "Your partner"} has a
          different record. Describe yours in English.
        </small>
      </article>
      {!!p.glossary?.length && (
        <details className="puzzle-glossary">
          <summary>Key words</summary>
          <dl>
            {p.glossary.map(({ term, meaning }) => (
              <div key={term}>
                <dt>{term}</dt>
                <dd>{meaning}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
      {p.solved ? (
        <article className="discovery">
          <h3>Discovery recorded</h3>
          <p>{p.reward}</p>
          <p>Tell the storyteller to continue.</p>
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
          <small id="answer-format">{p.format}</small>
          <div className="answer-row">
            <input
              id="puzzle-answer"
              aria-describedby="answer-format"
              value={answer}
              maxLength={200}
              autoComplete="off"
              onChange={(e) => setAnswer(e.target.value)}
              disabled={accepted || busy}
            />
            <button
              type="submit"
              className="primary"
              disabled={accepted || busy || !answer.trim()}
            >
              {accepted ? "Accepted" : "Try answer"}
            </button>
          </div>
        </form>
      )}
      {message && (
        <p role="status" className="puzzle-message">
          {message}
        </p>
      )}
      {(p.hints.length > 0 || !p.solved) && (
        <div className="puzzle-hints">
          {p.hints.map((hint, i) => (
            <p key={i}>
              <strong>Hint {i + 1}.</strong> {hint}
            </p>
          ))}
          <div className="hint-row">
            <button
              className="subtle"
              disabled={busy || p.hints.length >= 3 || p.solved}
              onClick={() =>
                void send("puzzle-hint", {
                  puzzleId: p.id,
                  expectedHintCount: p.hints.length,
                })
              }
            >
              <Lightbulb size={15} />
              {p.hints.length >= 3
                ? "No more hints"
                : `Reveal hint ${p.hints.length + 1} of 3`}
            </button>
            <small>Hints and wrong answers cost no HP.</small>
          </div>
        </div>
      )}
      <details className="worker-notebook">
        <summary>Notebook helpers</summary>
        <div className="worker-actions">
          <button
            className="subtle"
            disabled={busy}
            onClick={() => void send("background", { task: "recap" })}
          >
            Summarise our discoveries
          </button>
          <button
            className="subtle"
            disabled={busy}
            onClick={() => void send("background", { task: "language_coach" })}
          >
            English feedback
          </button>
        </div>
        {room.workers
          ?.filter(
            (j) =>
              j.status === "queued" ||
              j.status === "running" ||
              j.status === "error",
          )
          .slice(-4)
          .map((j) => (
            <p key={j.id} className="worker-job">
              {j.task.replaceAll("_", " ")}: {j.status}
              {j.status === "error"
                ? " — Your helper is unavailable. Try again later."
                : ""}
            </p>
          ))}
        {room.learningNotes
          ?.filter((n) => n.sceneId === room.scene.id)
          .map((n) => (
            <p key={n.id} className="learning-note">
              {n.text.replaceAll("**", "")}
            </p>
          ))}
      </details>
    </section>
  );
}
