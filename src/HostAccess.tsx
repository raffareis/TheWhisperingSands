import { useState, type FormEvent } from "react";

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
        `/whispering-sands${location.search}${hash.size ? `#${hash}` : ""}`,
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
    <section className="host-access" aria-labelledby="host-access-title">
      <h3 id="host-access-title">Host access</h3>
      <p>
        Enter your private host code to create a table. Players with an
        invitation or return link can join directly.
      </p>
      <form onSubmit={submit}>
        <label htmlFor="host-code">Host code</label>
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
          {busy || opening ? "Opening host access…" : "Open host access"}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
