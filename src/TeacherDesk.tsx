import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  Clipboard,
  LockKeyhole,
  Plus,
  RefreshCw,
  X,
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
function day(value: string) {
  return new Date(value.length === 10 ? value + "T12:00:00" : value);
}
function when(value: string) {
  return value
    ? day(value).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Not scheduled";
}
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** Next-lesson date as the teacher reads it: relative when close, flagged when past. */
function upcoming(value: string) {
  if (!value) return { text: "No date yet", tone: "none" };
  const days = Math.round(
    (day(value).getTime() - day(today()).getTime()) / 86400000,
  );
  const date = day(value).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  if (days < 0) return { text: `${date} · date passed`, tone: "past" };
  if (days === 0) return { text: "Today", tone: "soon" };
  if (days === 1) return { text: "Tomorrow", tone: "soon" };
  if (days < 7) return { text: date, tone: "soon" };
  return { text: date, tone: "later" };
}
function stage(t: TeachingTable) {
  if (t.status === "archived") return "Archived";
  if (t.status === "paused") return "Paused";
  if (t.phase === "complete") return "Completed";
  if (t.phase === "lobby") return "Not started";
  return "Open";
}
function pair(t: TeachingTable) {
  return t.students.map((s) => s.name).join(" & ") || "No students yet";
}
function character(id: "sam" | "liz") {
  return id === "sam" ? "Sam" : "Liz";
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
  const detail = useRef<HTMLElement>(null);
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
  // On a narrow screen the detail sits below the list: bring it into view.
  function reveal() {
    requestAnimationFrame(() => {
      const el = detail.current;
      if (!el || !matchMedia("(max-width: 860px)").matches) return;
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: "start" });
    });
  }
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
    reveal();
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
  // The register: one group per class, soonest lesson first, undated last.
  const groups = [...new Set(visible.map((t) => t.cohort))]
    .sort((a, b) => (!a ? 1 : !b ? -1 : a.localeCompare(b)))
    .map((name) => ({
      name,
      rows: visible
        .filter((t) => t.cohort === name)
        .sort((a, b) =>
          (a.nextLesson || "9999").localeCompare(b.nextLesson || "9999"),
        ),
    }));
  const current = tables.filter((t) => t.status !== "archived");
  const next = current
    .filter((t) => t.nextLesson && t.nextLesson >= today())
    .sort((a, b) => a.nextLesson.localeCompare(b.nextLesson))[0];
  const open = current.filter((t) => t.status === "active").length;
  const paused = current.filter((t) => t.status === "paused").length;
  const classes = [
    ...new Set(tables.map((t) => t.cohort).filter(Boolean)),
  ].sort();
  function nameFields(
    value: LessonDetails,
    change: (patch: Partial<LessonDetails>) => void,
    prefix: string,
  ) {
    return (
      <div className="desk-field-pair">
        <div>
          <label htmlFor={`${prefix}-title`}>Adventure name</label>
          <input
            id={`${prefix}-title`}
            required
            maxLength={100}
            value={value.title}
            onChange={(e) => change({ title: e.target.value })}
            placeholder="Ana & Bruno · Island mystery"
          />
        </div>
        <div>
          <label htmlFor={`${prefix}-cohort`}>Class or group</label>
          <input
            id={`${prefix}-cohort`}
            maxLength={100}
            value={value.cohort}
            onChange={(e) => change({ cohort: e.target.value })}
            placeholder="Tuesday · B1"
            list="desk-classes"
          />
        </div>
      </div>
    );
  }
  function planFields(
    value: LessonDetails,
    change: (patch: Partial<LessonDetails>) => void,
    prefix: string,
  ) {
    return (
      <>
        <label htmlFor={`${prefix}-date`}>Next lesson date</label>
        <input
          id={`${prefix}-date`}
          className="desk-date"
          type="date"
          value={value.nextLesson}
          onChange={(e) => change({ nextLesson: e.target.value })}
        />
        <label htmlFor={`${prefix}-notes`}>Private teaching notes</label>
        <textarea
          id={`${prefix}-notes`}
          rows={5}
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
          Meg’s classroom
        </a>
        <nav aria-label="Teacher desk">
          <a href="/">
            Activities <ArrowUpRight size={15} aria-hidden="true" />
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
              <LockKeyhole size={15} aria-hidden="true" />
              Lock desk
            </button>
          )}
        </nav>
      </header>
      <main>
        <div className="desk-summary">
          <h1>Teacher desk</h1>
          {access && (
            <p>
              {current.length === 0
                ? "No pairs yet."
                : `${current.length} current ${current.length === 1 ? "pair" : "pairs"} · ${open} open · ${paused} paused`}
              {next && (
                <>
                  {" "}
                  <span className="desk-next-up">
                    Next lesson: {upcoming(next.nextLesson).text},{" "}
                    <button
                      className="desk-inline-link"
                      onClick={() => choose(next)}
                    >
                      {pair(next)}
                    </button>
                  </span>
                </>
              )}
            </p>
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
          <p className="desk-opening">Opening teacher access…</p>
        ) : !access ? (
          <div className="desk-locked">
            <HostAccess
              onReady={() => {
                setAccess(true);
                setError("");
              }}
            />
          </div>
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
                  {classes.map((c) => (
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
                <RefreshCw size={16} aria-hidden="true" />
                Refresh
              </button>
              <button
                className="primary desk-new"
                onClick={() => {
                  setCreating(true);
                  setSelected("");
                  setNotice("");
                  reveal();
                }}
              >
                <Plus size={17} aria-hidden="true" />
                New pair
              </button>
            </section>
            <datalist id="desk-classes">
              {classes.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <div className="desk-layout">
              <section className="desk-list" aria-label="Teaching adventures">
                <div className="desk-list-heading">
                  <span>Pairs</span>
                  <span>{visible.length}</span>
                </div>
                {visible.length ? (
                  groups.map((group) => (
                    <div className="desk-group" key={group.name || "none"}>
                      <h2>{group.name || "No class assigned"}</h2>
                      <ul>
                        {group.rows.map((t) => {
                          const date = upcoming(t.nextLesson);
                          return (
                            <li key={t.id}>
                              <button
                                className={`desk-table ${t.status} ${selected === t.id ? "selected" : ""}`}
                                aria-current={
                                  selected === t.id ? "true" : undefined
                                }
                                onClick={() => choose(t)}
                              >
                                <strong className="desk-pair">{pair(t)}</strong>
                                {t.title !== pair(t) && (
                                  <span className="desk-row-title">
                                    {t.title}
                                  </span>
                                )}
                                <span className="desk-row-meta">
                                  <span
                                    className={`desk-status ${t.status} ${t.phase}`}
                                  >
                                    {stage(t)}
                                  </span>
                                  <span
                                    className="desk-meter"
                                    aria-label={`${t.solved} of ${t.total} puzzles solved`}
                                  >
                                    {Array.from({ length: t.total }, (_, i) => (
                                      <i
                                        key={i}
                                        className={i < t.solved ? "done" : ""}
                                      />
                                    ))}
                                  </span>
                                  <span className={`desk-when ${date.tone}`}>
                                    {date.text}
                                  </span>
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))
                ) : (
                  <div className="desk-empty">
                    {tables.length ? (
                      <p>No pair matches these filters.</p>
                    ) : (
                      <p>
                        Create a pair with <strong>New pair</strong>: name the
                        two students, then send each one their private link.
                        Their progress stays here between lessons.
                      </p>
                    )}
                  </div>
                )}
              </section>
              <section
                ref={detail}
                tabIndex={-1}
                className={`desk-detail ${creating ? "creating" : ""}`}
                aria-label={
                  creating
                    ? "Create teaching table"
                    : table
                      ? `${table.title}, selected adventure`
                      : "Selected adventure"
                }
              >
                {creating ? (
                  <form onSubmit={(e) => void create(e)}>
                    <div className="desk-detail-head">
                      <div>
                        <span className="desk-kicker">New pair</span>
                        <h2>Reserve both seats</h2>
                      </div>
                      <button
                        type="button"
                        className="subtle desk-close"
                        onClick={() => setCreating(false)}
                      >
                        <X size={15} aria-hidden="true" />
                        Cancel
                      </button>
                    </div>
                    <p className="desk-lead">
                      You manage the lesson without taking a player’s character.
                    </p>
                    <fieldset disabled={busy}>
                      <div className="desk-field-pair desk-seats">
                        <div>
                          <label htmlFor="new-sam">
                            <img
                              src="/art/sam-sunburst.webp"
                              alt=""
                              loading="lazy"
                            />
                            Student playing Sam
                          </label>
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
                          <label htmlFor="new-liz">
                            <img
                              src="/art/liz-sunburst.webp"
                              alt=""
                              loading="lazy"
                            />
                            Student playing Liz
                          </label>
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
                      {nameFields(
                        newDraft,
                        (p) => setNewDraft((d) => ({ ...d, ...p })),
                        "new",
                      )}
                      {planFields(
                        newDraft,
                        (p) => setNewDraft((d) => ({ ...d, ...p })),
                        "new",
                      )}
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
                    <div className="desk-detail-head">
                      <div>
                        <span className="desk-kicker">
                          {table.cohort || "No class assigned"} ·{" "}
                          <span
                            className={`desk-status ${table.status} ${table.phase}`}
                          >
                            {stage(table)}
                          </span>
                        </span>
                        <h2>{table.title}</h2>
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
                    </div>
                    <div className="desk-continuity">
                      <section
                        className="desk-recap"
                        aria-labelledby="desk-recap-title"
                      >
                        <h3 id="desk-recap-title">Where the story stopped</h3>
                        <p className="desk-chapter">
                          {table.chapterTitle} · last activity{" "}
                          {when(table.lastPlayedAt)}
                        </p>
                        <blockquote tabIndex={0} aria-label="Story recap">
                          {table.recap}
                        </blockquote>
                        <dl className="desk-metrics">
                          <div>
                            <dt>Puzzles solved</dt>
                            <dd>
                              {table.solved}/{table.total}
                            </dd>
                          </div>
                          <div>
                            <dt>Hints requested</dt>
                            <dd>{table.hints}</dd>
                          </div>
                          <div>
                            <dt>Answer attempts</dt>
                            <dd>{table.attempts}</dd>
                          </div>
                        </dl>
                      </section>
                      <form
                        className="desk-plan"
                        aria-labelledby="desk-plan-title"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void save();
                        }}
                      >
                        <h3 id="desk-plan-title">Plan the next lesson</h3>
                        <fieldset disabled={busy}>
                          {planFields(
                            draft,
                            (p) => setDraft((d) => ({ ...d, ...p })),
                            "edit",
                          )}
                          {nameFields(
                            draft,
                            (p) => setDraft((d) => ({ ...d, ...p })),
                            "edit",
                          )}
                          <button className="primary" type="submit">
                            Save teaching notes
                          </button>
                        </fieldset>
                      </form>
                    </div>
                    <section
                      className="desk-links"
                      aria-labelledby="desk-links-title"
                    >
                      <h3 id="desk-links-title">Private student links</h3>
                      <p>
                        Each link keeps working next week and on another device.
                        Opening one replaces that student’s previous connection.
                      </p>
                      {table.students.map((student) => (
                        <div className="desk-student" key={student.character}>
                          <img
                            className="desk-portrait"
                            src={`/art/${student.character}-sunburst.webp`}
                            alt=""
                            loading="lazy"
                          />
                          <div className="desk-student-name">
                            <strong>{student.name}</strong>
                            <small>
                              Playing {character(student.character)}
                            </small>
                          </div>
                          <button
                            className="subtle"
                            disabled={busy}
                            onClick={() =>
                              void copy(student.entryPath, student.name)
                            }
                          >
                            <Clipboard size={15} aria-hidden="true" />
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
                  </>
                ) : (
                  <div className="desk-empty desk-placeholder">
                    <p>
                      Select a pair to see where their story stopped, plan the
                      next lesson and copy their return links.
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
