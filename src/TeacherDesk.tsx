import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  Clipboard,
  LockKeyhole,
  Plus,
  RefreshCw,
} from "lucide-react";
import { HostAccess } from "./HostAccess";
import type {
  LessonDetails,
  LessonStatus,
  TeachingTable,
} from "../shared/teaching";
import "./teacher-desk.css";
const empty: LessonDetails = {
  title: "",
  cohort: "",
  notes: "",
  nextLesson: "",
};
async function request<T>(path: string, value?: unknown): Promise<T> {
  const r = await fetch(path, {
    method: value === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    ...(value === undefined ? {} : { body: JSON.stringify(value) }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "This change could not be saved.");
  return data;
}
function when(value: string) {
  return value
    ? new Date(
        value.length === 10 ? value + "T12:00:00" : value,
      ).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Not scheduled";
}
export default function TeacherDesk() {
  const [access, setAccess] = useState<boolean | null>(null),
    [tables, setTables] = useState<TeachingTable[]>([]);
  const [selected, setSelected] = useState(""),
    [draft, setDraft] = useState<LessonDetails>(empty);
  const [creating, setCreating] = useState(false),
    [newDraft, setNewDraft] = useState({
      ...empty,
      sam: "",
      liz: "",
      existingRoomId: "",
    });
  const [cohort, setCohort] = useState(""),
    [search, setSearch] = useState(""),
    [scope, setScope] = useState("current");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const hostRun = useRef<Promise<unknown> | null>(null);
  const table = tables.find((t) => t.id === selected);
  async function refresh() {
    const data = await request<{ tables: TeachingTable[] }>("/api/teaching");
    setTables(data.tables);
    return data.tables;
  }
  useEffect(() => {
    document.title = "Teacher desk · Meg’s classroom";
    let disposed = false;
    const code = new URLSearchParams(location.hash.slice(1)).get("host");
    if (!hostRun.current)
      hostRun.current = (async () => {
        if (code) {
          await request("/api/host-access", { key: code });
          history.replaceState(null, "", "/teacher");
        }
        return request<{ required: boolean; authenticated: boolean }>(
          "/api/host-access",
        );
      })();
    void hostRun.current
      .then((value) => {
        const a = value as { authenticated: boolean; required: boolean };
        if (!disposed) setAccess(a.authenticated && a.required);
      })
      .catch((e) => {
        if (!disposed) {
          setAccess(false);
          setError(e.message);
        }
      });
    return () => {
      disposed = true;
    };
  }, []);
  useEffect(() => {
    if (!access) return;
    let stopped = false;
    const load = async () => {
      try {
        const data = await request<{ tables: TeachingTable[] }>(
          "/api/teaching",
        );
        if (!stopped) setTables(data.tables);
      } catch (e) {
        if (!stopped) setError((e as Error).message);
      }
    };
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [access]);
  function choose(t: TeachingTable) {
    setSelected(t.id);
    setDraft({
      title: t.title,
      cohort: t.cohort,
      notes: t.notes,
      nextLesson: t.nextLesson,
    });
    setCreating(false);
    setNotice("");
  }
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function replace(t: TeachingTable) {
    setTables((previous) => [t, ...previous.filter((p) => p.id !== t.id)]);
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    await perform(async () => {
      const { existingRoomId, ...fields } = newDraft;
      const { table: t } = await request<{ table: TeachingTable }>(
        "/api/teaching",
        {
          ...fields,
          ...(existingRoomId.trim()
            ? { existingRoomId: existingRoomId.trim() }
            : {}),
        },
      );
      replace(t);
      choose(t);
      setNewDraft({
        ...empty,
        cohort: t.cohort,
        sam: "",
        liz: "",
        existingRoomId: "",
      });
      setNotice("Table created. Send each student their own private link.");
    });
  }
  async function save(status?: LessonStatus) {
    if (!table) return;
    await perform(async () => {
      const { table: t } = await request<{ table: TeachingTable }>(
        `/api/teaching/${table.id}`,
        { ...draft, ...(status ? { status } : {}) },
      );
      replace(t);
      setNotice(
        status === "paused"
          ? "Lesson paused. Progress and student links are saved."
          : status === "active"
            ? "Lesson reopened. Students can continue from where they stopped."
            : status === "archived"
              ? "Adventure archived. Its progress is preserved."
              : "Teaching notes and next lesson saved.",
      );
    });
  }
  async function copy(path: string, name: string) {
    try {
      await navigator.clipboard.writeText(location.origin + path);
      setNotice(`${name}’s private link copied. It works again next week.`);
    } catch {
      setNotice(
        "Clipboard unavailable. Select the private link below and copy it.",
      );
    }
  }
  const visible = tables.filter(
    (t) =>
      (!cohort || t.cohort === cohort) &&
      (scope === "all" ||
        (scope === "archived"
          ? t.status === "archived"
          : t.status !== "archived")) &&
      `${t.title} ${t.cohort} ${t.students.map((s) => s.name).join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  function fields(
    value: LessonDetails,
    change: (patch: Partial<LessonDetails>) => void,
    prefix: string,
  ) {
    return (
      <>
        <label htmlFor={`${prefix}-title`}>Adventure name</label>
        <input
          id={`${prefix}-title`}
          required
          maxLength={100}
          value={value.title}
          onChange={(e) => change({ title: e.target.value })}
          placeholder="Ana & Bruno · Island mystery"
        />
        <div className="desk-field-pair">
          <div>
            <label htmlFor={`${prefix}-cohort`}>Class or group</label>
            <input
              id={`${prefix}-cohort`}
              maxLength={100}
              value={value.cohort}
              onChange={(e) => change({ cohort: e.target.value })}
              placeholder="Tuesday · B1"
            />
          </div>
          <div>
            <label htmlFor={`${prefix}-date`}>Next lesson</label>
            <input
              id={`${prefix}-date`}
              type="date"
              value={value.nextLesson}
              onChange={(e) => change({ nextLesson: e.target.value })}
            />
          </div>
        </div>
        <label htmlFor={`${prefix}-notes`}>Private teaching notes</label>
        <textarea
          id={`${prefix}-notes`}
          rows={4}
          maxLength={6000}
          value={value.notes}
          onChange={(e) => change({ notes: e.target.value })}
          placeholder="Where we stopped, language to revisit, plans for next time…"
        />
        <small>Only the teacher desk can read these notes.</small>
      </>
    );
  }
  return (
    <div className="teacher-desk">
      <header className="desk-header">
        <a className="desk-brand" href="/">
          m. <span>Meg’s classroom</span>
        </a>
        <nav>
          <a href="/">
            All activities <ArrowUpRight size={15} />
          </a>
          {access && (
            <button
              className="subtle"
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  await request("/api/host-access/logout", {});
                  setAccess(false);
                  setTables([]);
                  setSelected("");
                })
              }
            >
              <LockKeyhole size={15} />
              Lock desk
            </button>
          )}
        </nav>
      </header>
      <main>
        <div className="desk-intro">
          <div>
            <span className="small-caps">FOR THE TEACHER</span>
            <h1>
              Your classes,
              <br />
              <em>one lesson at a time.</em>
            </h1>
            <p>
              Keep each pair’s adventure across lessons. Pause today; pick up
              here next week.
            </p>
          </div>
          {access && (
            <button
              className="primary"
              onClick={() => {
                setCreating(true);
                setSelected("");
                setNotice("");
              }}
            >
              <Plus size={17} />
              New pair
            </button>
          )}
        </div>
        {error && (
          <p className="desk-alert" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="desk-notice" role="status">
            {notice}
          </p>
        )}
        {access === null ? (
          <p>Opening teacher access…</p>
        ) : !access ? (
          <HostAccess
            onReady={() => {
              setAccess(true);
              setError("");
            }}
          />
        ) : (
          <>
            <section className="desk-filters" aria-label="Find teaching tables">
              <label>
                Class
                <select
                  value={cohort}
                  onChange={(e) => setCohort(e.target.value)}
                >
                  <option value="">All classes</option>
                  {[...new Set(tables.map((t) => t.cohort).filter(Boolean))]
                    .sort()
                    .map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                </select>
              </label>
              <label>
                Adventures
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                >
                  <option value="current">Current</option>
                  <option value="archived">Archived</option>
                  <option value="all">All</option>
                </select>
              </label>
              <label className="desk-search">
                Find a pair
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Student or adventure name"
                />
              </label>
              <button
                className="subtle"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    await refresh();
                    setNotice("Progress refreshed.");
                  })
                }
              >
                <RefreshCw size={16} />
                Refresh
              </button>
            </section>
            <div className="desk-layout">
              <section className="desk-list" aria-label="Teaching adventures">
                <div className="desk-list-heading">
                  <span>ADVENTURES</span>
                  <span>{visible.length}</span>
                </div>
                {visible.length ? (
                  visible.map((t) => (
                    <button
                      key={t.id}
                      className={`desk-table ${selected === t.id ? "selected" : ""}`}
                      onClick={() => choose(t)}
                    >
                      <span className={`desk-status ${t.status}`}>
                        {t.phase === "complete" && t.status === "active"
                          ? "Completed"
                          : t.status}
                      </span>
                      <h2>{t.title}</h2>
                      <p>
                        {t.cohort || "No class assigned"} ·{" "}
                        {t.students.map((s) => s.name).join(" & ")}
                      </p>
                      <div className="desk-progress">
                        <span
                          style={{ width: `${(t.solved / t.total) * 100}%` }}
                        />
                      </div>
                      <small>
                        {t.solved}/{t.total} puzzles · {t.chapterTitle}
                      </small>
                      <strong>Next: {when(t.nextLesson)}</strong>
                    </button>
                  ))
                ) : (
                  <div className="desk-empty">
                    <h2>A home for every pair.</h2>
                    <p>
                      Create a table, name the two students and send their
                      private links. Their progress stays here between lessons.
                    </p>
                  </div>
                )}
              </section>
              <section
                className="desk-detail"
                aria-label={
                  creating ? "Create teaching table" : "Selected adventure"
                }
              >
                {creating ? (
                  <form onSubmit={(e) => void create(e)}>
                    <span className="small-caps">A NEW ADVENTURE</span>
                    <h2>Reserve both seats.</h2>
                    <p>
                      You manage the lesson without taking a player’s character.
                    </p>
                    <fieldset disabled={busy}>
                      {fields(
                        newDraft,
                        (p) => setNewDraft((d) => ({ ...d, ...p })),
                        "new",
                      )}
                      <div className="desk-field-pair">
                        <div>
                          <label htmlFor="new-sam">Student playing Sam</label>
                          <input
                            id="new-sam"
                            required={!newDraft.existingRoomId}
                            maxLength={40}
                            value={newDraft.sam}
                            onChange={(e) =>
                              setNewDraft((d) => ({
                                ...d,
                                sam: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div>
                          <label htmlFor="new-liz">Student playing Liz</label>
                          <input
                            id="new-liz"
                            required={!newDraft.existingRoomId}
                            maxLength={40}
                            value={newDraft.liz}
                            onChange={(e) =>
                              setNewDraft((d) => ({
                                ...d,
                                liz: e.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>
                      <details className="desk-import">
                        <summary>Bring an existing adventure</summary>
                        <label htmlFor="existing-room">
                          Table code from its address
                        </label>
                        <input
                          id="existing-room"
                          value={newDraft.existingRoomId}
                          onChange={(e) =>
                            setNewDraft((d) => ({
                              ...d,
                              existingRoomId: e.target.value,
                            }))
                          }
                          placeholder="The room= value in the game link"
                        />
                        <small>
                          Both seats must already be occupied. Existing student
                          names and all progress are preserved; the names above
                          are used only for a new adventure.
                        </small>
                      </details>
                      <button className="primary" type="submit">
                        {busy ? "Saving…" : "Create teaching table"}
                      </button>
                    </fieldset>
                  </form>
                ) : table ? (
                  <>
                    <span className="small-caps">
                      {table.cohort || "YOUR CLASSROOM"}
                    </span>
                    <h2>{table.title}</h2>
                    <div className="desk-metrics">
                      <div>
                        <strong>
                          {table.solved}/{table.total}
                        </strong>
                        <span>Puzzles solved</span>
                      </div>
                      <div>
                        <strong>{table.hints}</strong>
                        <span>Hints requested</span>
                      </div>
                      <div>
                        <strong>{table.attempts}</strong>
                        <span>Answer attempts</span>
                      </div>
                    </div>
                    <div className="desk-lesson-actions">
                      {table.status === "active" ? (
                        <button
                          className="primary"
                          disabled={busy}
                          onClick={() => void save("paused")}
                        >
                          End this lesson · pause
                        </button>
                      ) : (
                        <button
                          className="primary"
                          disabled={busy}
                          onClick={() => void save("active")}
                        >
                          Reopen for next lesson
                        </button>
                      )}
                      {table.status !== "archived" && (
                        <button
                          className="subtle"
                          disabled={busy}
                          onClick={() => void save("archived")}
                        >
                          Archive adventure
                        </button>
                      )}
                    </div>
                    <section
                      className="desk-links"
                      aria-label="Private student links"
                    >
                      <h3>Each student keeps their own link.</h3>
                      <p>
                        Links continue to work next week and on another device.
                        Opening one replaces that student’s previous connection.
                      </p>
                      {table.students.map((student) => (
                        <div className="desk-student" key={student.character}>
                          <div>
                            <strong>{student.name}</strong>
                            <small>
                              Playing{" "}
                              {student.character === "sam" ? "Sam" : "Liz"}
                            </small>
                          </div>
                          <button
                            className="subtle"
                            disabled={busy}
                            onClick={() =>
                              void copy(student.entryPath, student.name)
                            }
                          >
                            <Clipboard size={15} />
                            Copy link
                          </button>
                          <input
                            aria-label={`${student.name} private return link`}
                            type="password"
                            autoComplete="off"
                            readOnly
                            value={location.origin + student.entryPath}
                            onFocus={(e) => e.target.select()}
                          />
                          <details>
                            <summary>Replace a lost or shared link</summary>
                            <p>
                              This disables the previous link and saved seat for{" "}
                              {student.name}. Send the replacement to that
                              student.
                            </p>
                            <button
                              className="subtle"
                              disabled={busy}
                              onClick={() =>
                                void perform(async () => {
                                  const { table: t } = await request<{
                                    table: TeachingTable;
                                  }>(`/api/teaching/${table.id}/links`, {
                                    character: student.character,
                                  });
                                  replace(t);
                                  setNotice(
                                    `${student.name}’s previous access is revoked. Copy the replacement link.`,
                                  );
                                })
                              }
                            >
                              Replace {student.name}’s link
                            </button>
                          </details>
                        </div>
                      ))}
                    </section>
                    <details className="desk-recap">
                      <summary>Where the story stopped</summary>
                      <p>{table.recap}</p>
                      <small>
                        Last table activity: {when(table.lastPlayedAt)}
                      </small>
                    </details>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void save();
                      }}
                    >
                      <fieldset disabled={busy}>
                        {fields(
                          draft,
                          (p) => setDraft((d) => ({ ...d, ...p })),
                          "edit",
                        )}
                        <button className="primary" type="submit">
                          Save teaching notes
                        </button>
                      </fieldset>
                    </form>
                  </>
                ) : (
                  <div className="desk-empty">
                    <h2>Plan the next lesson.</h2>
                    <p>
                      Select a pair to see their progress, save your notes and
                      find their return links.
                    </p>
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </main>
      <footer className="desk-footer">
        Progress is saved as students play. Pausing and archiving preserve the
        adventure.
      </footer>
    </div>
  );
}
