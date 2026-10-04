import { useState, type FormEvent } from "react";
import { HelpTip } from "./HelpTip";

export function HostAccess({
  onReady,
  busy: opening = false,
}: {
  onReady: () => void;
  busy?: boolean;
}) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function unlock(code: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/host-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: code }),
      });
      if (!response.ok)
        throw new Error(
          "That host code could not be accepted. Check the code and try again.",
        );
      setKey("");
      const hash = new URLSearchParams(location.hash.slice(1));
      hash.delete("host");
      history.replaceState(
        null,
        "",
        `${location.pathname.startsWith("/teacher") ? "/teacher" : "/whispering-sands"}${location.search}${hash.size ? `#${hash}` : ""}`,
      );
      onReady();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (key.trim() && !busy) void unlock(key.trim());
  }
  return (
    <section className="host-access" aria-label="Host access">
      <form onSubmit={submit}>
        <div className="host-access-label">
          <label htmlFor="host-code">Host code</label>
          <HelpTip
            label="Who needs a host code?"
            text={[
              "Only the teacher: it unlocks classes and new tables.",
              "Students open the private link from their teacher instead.",
            ]}
          />
        </div>
        <input
          id="host-code"
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          required
          disabled={busy || opening}
        />
        <button className="primary" disabled={busy || opening || !key.trim()}>
          {busy || opening ? "Unlocking…" : "Unlock"}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
