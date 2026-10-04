import { useEffect, useRef, useState, type FormEvent } from "react";
import { Mic, Volume2, VolumeX, Send } from "lucide-react";
import type { Credentials, RoomState } from "../shared/types";

export interface PartyVoice {
  enabled: boolean;
  loading: boolean;
  talking: boolean;
  speaker: string | null;
  blocked: boolean;
  enable: () => void;
  talk: () => void;
}
export function PartyPanel({
  room,
  credentials,
  connected,
  voice,
}: {
  room: RoomState;
  credentials: Credentials;
  connected: boolean;
  voice: PartyVoice;
}) {
  const [text, setText] = useState("");
  const [requestBusy, setBusy] = useState(false);
  const lessonPaused = !!room.lessonStatus && room.lessonStatus !== "active";
  const busy = requestBusy || lessonPaused;
  const [error, setError] = useState("");
  const messages = useRef<HTMLDivElement>(null);
  useEffect(() => {
    messages.current?.scrollTo({ top: messages.current.scrollHeight });
  }, [room.partyChat?.length]);
  async function discuss(event: FormEvent) {
    event.preventDefault();
    if (busy || !text.trim()) return;
    setBusy(true);
    setError("");
    const draft = text.trim();
    try {
      const response = await fetch(`/api/rooms/${room.id}/party-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${credentials.token}`,
        },
        body: JSON.stringify({ text: draft }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error ?? "Your message could not be sent. Please try again.",
        );
      setText("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Your message could not be sent.",
      );
    } finally {
      setBusy(false);
    }
  }
  const speaker = room.players.find((p) => p.id === voice.speaker);
  const companion = room.players.find((p) => p.id !== credentials.playerId);
  return (
    <section
      className="party-discussion"
      id="discussion"
      aria-labelledby="discussion-title"
    >
      <div className="discussion-heading">
        <h2 id="discussion-title">
          {companion ? `Talk with ${companion.name}` : "Discuss together"}
        </h2>
        <p>
          Compare your evidence here. The storyteller waits while you discuss.
        </p>
      </div>
      <div
        className="party-messages"
        ref={messages}
        role="log"
        aria-label="Companion discussion"
        aria-live="polite"
        aria-relevant="additions"
      >
        {room.partyChat?.length ? (
          room.partyChat.map((entry) => (
            <article
              key={entry.id}
              className={entry.playerId === credentials.playerId ? "own" : ""}
            >
              <div>
                <strong>
                  {room.players.find((p) => p.id === entry.playerId)?.name ??
                    "Companion"}
                </strong>
                <time dateTime={entry.at}>
                  {new Date(entry.at).toLocaleTimeString("en", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </div>
              <p>{entry.text}</p>
            </article>
          ))
        ) : (
          <p className="discussion-empty">
            Your discussion is saved here. Share what you notice.
          </p>
        )}
      </div>
      <form onSubmit={(e) => void discuss(e)} className="discussion-form">
        <label htmlFor="party-message">Message your companion</label>
        <div className="discussion-compose">
          <textarea
            id="party-message"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1200}
            rows={2}
            placeholder="I noticed… What does your record say?"
            disabled={busy}
          />
          <button
            className="primary"
            disabled={busy || !connected || !text.trim()}
          >
            <Send size={16} />
            {requestBusy ? "Sending…" : "Send"}
          </button>
        </div>
      </form>
      {error && (
        <p role="alert" className="discussion-error">
          {error}
        </p>
      )}
      <details className="negotiation-phrases">
        <summary>Useful phrases, if you need them</summary>
        <ul>
          <li>“What does yours say about ___?”</li>
          <li>“Do you mean ___ or ___?”</li>
          <li>“I agree about ___. I’m not sure about ___ because…”</li>
          <li>“Let me check: first ___, then ___. Is that right?”</li>
        </ul>
      </details>
      <div className="party-voice">
        <button
          className={`subtle ${voice.enabled ? "on" : ""}`}
          onClick={voice.enable}
          disabled={
            !connected || voice.loading || (lessonPaused && !voice.enabled)
          }
          aria-pressed={voice.enabled}
        >
          {voice.enabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          {voice.loading
            ? "Opening audio…"
            : voice.enabled
              ? "Leave companion audio"
              : "Enable companion audio"}
        </button>
        {voice.enabled && (
          <button
            className={`subtle ${voice.talking ? "recording" : ""}`}
            onClick={voice.talk}
            disabled={
              !voice.talking &&
              (voice.blocked ||
                lessonPaused ||
                !!voice.speaker ||
                !connected ||
                voice.loading)
            }
            aria-pressed={voice.talking}
          >
            <Mic size={16} />
            {voice.talking
              ? "Finish speaking to companion"
              : "Talk to companion"}
          </button>
        )}
        <p role="status">
          {voice.talking
            ? "Your companion can hear you. Tap again to finish."
            : speaker
              ? `${speaker.name} is speaking to the companion.`
              : voice.enabled
                ? "You can hear your companion. Talking asks for microphone access."
                : "Optional audio between the two of you. The storyteller does not hear it."}
        </p>
      </div>
    </section>
  );
}
