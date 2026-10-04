import {
  useState,
  useEffect,
  useRef,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Compass,
  ArrowRight,
  Wind,
  BookOpen,
  Heart,
  Backpack,
  Shield,
  Brain,
  Trees,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Link,
  Check,
  Copy,
  Send,
  Dices,
  Sparkles,
  MapPin,
  ChevronDown,
  ChevronRight,
  ScrollText,
  Users,
  Settings2,
  X,
  RotateCcw,
  Anchor,
  Feather,
  Sunrise,
  LoaderCircle,
  LogOut,
} from "lucide-react";
import type {
  RoomState,
  Credentials,
  LiveState,
  Configuration,
  CharacterId,
  Scene,
  Stat,
} from "../shared/types";
import { TableAudio } from "./audio";
const emptyLive: LiveState = {
  dmStatus: "offline",
  speaker: null,
  imageEnabled: true,
  presence: [],
};
const statIcons = { STR: Shield, INT: Brain, SUR: Trees };
function stored(): Credentials | null {
  try {
    return JSON.parse(localStorage.getItem("whispering-seat") ?? "null");
  } catch {
    return null;
  }
}
const statusText = {
  offline: "Voice is resting",
  connecting: "Waking the storyteller…",
  ready: "The storyteller is listening",
  thinking: "The storyteller is thinking…",
  speaking: "The storyteller is speaking",
  error: "The storyteller needs a moment",
};
export default function App() {
  const [credentials, setCredentials] = useState<Credentials | null>(stored);
  const [state, setState] = useState<RoomState | null>(null);
  const [live, setLive] = useState<LiveState>(emptyLive);
  const [config, setConfig] = useState<Configuration | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [characterChoice, setCharacterChoice] = useState<"sam" | "liz">("sam");
  const [invite, setInvite] = useState("");
  const [inviteModal, setInviteModal] = useState(false);
  const [tab, setTab] = useState<"story" | "clues" | "journal">("story");
  const [selectedCharacter, setSelectedCharacter] =
    useState<CharacterId>("sam");
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [muted, setMuted] = useState(false);
  const [viewedScene, setArchivedScene] = useState<Scene | null>(null);
  const [caption, setCaption] = useState("");
  const [text, setText] = useState("");
  const [settings, setSettings] = useState(false);
  const [sceneOpen, setSceneOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const socket = useRef<WebSocket | null>(null);
  const audio = useRef(new TableAudio());
  const muteRef = useRef(false);
  const voiceRef = useRef(false);
  const transcript = useRef<HTMLDivElement>(null);
  const reconnect = useRef<ReturnType<typeof setTimeout> | null>(null);
  const params = new URLSearchParams(location.search);
  const invitation = params.get("invite");
  const invitationRoom = params.get("room");
  const joining =
    !!invitation && !!invitationRoom && credentials?.roomId !== invitationRoom;
  const player = state?.players.find((p) => p.id === credentials?.playerId);
  const character = state?.characters.find((c) => c.id === selectedCharacter);
  const companion = state?.players.find((p) => p.id !== credentials?.playerId);
  const dmBusy =
    live.dmStatus === "thinking" ||
    live.dmStatus === "speaking" ||
    live.dmStatus === "connecting";
  async function api<T>(route: string, payload?: unknown): Promise<T> {
    const response = await fetch(route, {
      method: payload === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        ...(credentials
          ? { Authorization: `Bearer ${credentials.token}` }
          : {}),
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error ?? "This action could not be completed.");
    return result;
  }
  function adopt(value: {
    credentials: Credentials;
    state: RoomState;
    invite?: string;
  }) {
    localStorage.setItem("whispering-seat", JSON.stringify(value.credentials));
    setCredentials(value.credentials);
    setState(value.state);
    setSelectedCharacter(
      value.state.players.find((p) => p.id === value.credentials.playerId)!
        .characterId,
    );
    if (value.invite) setInvite(value.invite);
    history.replaceState(null, "", `/?room=${value.credentials.roomId}`);
  }
  useEffect(() => {
    void fetch("/api/config")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setError("The adventure server is not available."));
  }, []);
  useEffect(() => {
    if (!credentials || joining) return;
    let disposed = false;
    let delay = 600;
    void fetch(`/api/rooms/${credentials.roomId}`, {
      headers: { Authorization: `Bearer ${credentials.token}` },
    })
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok) throw new Error(v.error);
        if (!disposed) {
          setState(v.state);
          setLive(v.live);
          setConfig(v.config);
          setSelectedCharacter(
            v.state.players.find(
              (p: { id: string }) => p.id === credentials.playerId,
            ).characterId,
          );
        }
      })
      .catch((e) => {
        if (!disposed) setError(e.message);
      });
    function connect() {
      if (disposed) return;
      const ws = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/live`,
      );
      socket.current = ws;
      ws.onopen = () =>
        ws.send(
          JSON.stringify({
            type: "authenticate",
            token: credentials!.token,
            roomId: credentials!.roomId,
          }),
        );
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === "state") {
          setState(message.state);
          setLive(message.live);
          setConnected(true);
          delay = 600;
        }
        if (message.type === "config") setConfig(message.config);
        if (message.type === "dm_status")
          setLive((v) => ({ ...v, dmStatus: message.status }));
        if (message.type === "audio" && !muteRef.current && voiceRef.current)
          audio.current.play(message.delta);
        if (message.type === "audio_clear") {
          audio.current.clear();
          setCaption("");
        }
        if (message.type === "caption") setCaption((v) => v + message.delta);
        if (message.type === "caption_done") setCaption("");
        if (message.type === "voice_ready") {
          setVoiceEnabled(true);
          voiceRef.current = true;
          setVoiceLoading(false);
        }
        if (message.type === "voice_closed") {
          setVoiceEnabled(false);
          voiceRef.current = false;
          setVoiceLoading(false);
          setListening(false);
          audio.current.close();
        }
        if (message.type === "floor_granted") {
          audio.current.setCapturing(true);
          setListening(true);
        }
        if (message.type === "floor_released") {
          audio.current.setCapturing(false);
          setListening(false);
        }
        if (message.type === "error") {
          setError(message.message);
          setVoiceLoading(false);
          if (message.action === "voice_start") {
            audio.current.close();
            setVoiceEnabled(false);
            voiceRef.current = false;
          }
        }
      };
      ws.onclose = (event) => {
        if (disposed) return;
        setConnected(false);
        setVoiceEnabled(false);
        voiceRef.current = false;
        setVoiceLoading(false);
        setListening(false);
        audio.current.close();
        if (event.code === 4001 || event.code === 4003) {
          setError(
            event.code === 4001
              ? "This seat is open in another tab. Use that tab or reload to return here."
              : "Your saved seat is no longer available. Start or join another table.",
          );
          return;
        }
        delay = Math.min(delay * 1.8, 10000);
        reconnect.current = setTimeout(connect, delay);
      };
      ws.onerror = () => ws.close();
    }
    connect();
    return () => {
      disposed = true;
      if (reconnect.current) clearTimeout(reconnect.current);
      socket.current?.close();
      audio.current.close();
    };
  }, [credentials?.token, joining]);
  useEffect(() => {
    transcript.current?.scrollTo({
      top: transcript.current.scrollHeight,
      behavior: "smooth",
    });
  }, [state?.journal.length, caption, tab]);
  function send(value: unknown) {
    if (socket.current?.readyState !== WebSocket.OPEN)
      throw new Error("Your table is reconnecting. Please wait.");
    socket.current.send(JSON.stringify(value));
  }
  async function perform(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "This action failed.");
    } finally {
      setBusy(false);
    }
  }
  async function enter(event: FormEvent) {
    event.preventDefault();
    await perform(async () => {
      const result = joining
        ? await api<{ credentials: Credentials; state: RoomState }>(
            `/api/rooms/${invitationRoom}/join`,
            { name, invite: invitation },
          )
        : await api<{
            credentials: Credentials;
            state: RoomState;
            invite: string;
          }>("/api/rooms", { name, characterId: characterChoice });
      adopt(result);
    });
  }
  async function inviteCompanion() {
    await perform(async () => {
      if (!invite) {
        const result = await api<{ invite: string }>(
          `/api/rooms/${state!.id}/invite`,
          {},
        );
        setInvite(result.invite);
      }
      setInviteModal(true);
    });
  }
  const inviteLink =
    state && invite
      ? `${location.origin}/?room=${state.id}&invite=${invite}`
      : "";
  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Copy the invitation link from the field below.");
    }
  }
  async function toggleVoice() {
    if (voiceEnabled) {
      send({ type: "voice_stop" });
      audio.current.close();
      setVoiceEnabled(false);
      voiceRef.current = false;
      return;
    }
    setVoiceLoading(true);
    setError("");
    try {
      await audio.current.enable((data) => {
        if (socket.current?.readyState === WebSocket.OPEN)
          send({ type: "audio", data });
      });
      await audio.current.unlock();
      send({ type: "voice_start" });
    } catch (e) {
      setVoiceLoading(false);
      audio.current.close();
      setError(
        e instanceof Error ? e.message : "Microphone could not be enabled.",
      );
    }
  }
  async function toggleTalk() {
    try {
      if (listening) {
        await audio.current.finishCapture();
        send({ type: "floor_end" });
        setListening(false);
      } else {
        audio.current.clear();
        send({ type: "floor_start" });
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function leave() {
    socket.current?.close();
    audio.current.close();
    localStorage.removeItem("whispering-seat");
    setCredentials(null);
    setState(null);
    setError("");
    history.replaceState(null, "", "/");
  }
  const lastDM = state?.journal.filter((e) => e.kind === "dm").at(-1);
  const latestScenes = state
    ? [
        ...state.sceneHistory.filter((s) => s.status === "ready"),
        state.scene,
      ].slice(-5)
    : [];
  if (!state || joining)
    return (
      <div className="welcome">
        <div className="welcome-art" />
        <div className="welcome-shade" />
        <header className="welcome-header">
          <Brand />
          <span className="small-caps">A story best told together</span>
        </header>
        <main className="welcome-layout">
          <section className="welcome-copy">
            <div className="eyebrow">
              <span />A cooperative island adventure
            </div>
            <h1>
              Every shore
              <br />
              has a <em>secret.</em>
            </h1>
            <p>
              A storm. An uncharted island.
              <br />
              Two adventurers, and a story that listens.
            </p>
            <div className="welcome-features">
              <span>
                <Mic size={17} />A living storyteller
              </span>
              <span>
                <Sparkles size={17} />
                Scenes that unfold
              </span>
              <span>
                <Users size={17} />
                Made for two
              </span>
            </div>
            <div className="chapter-hint">
              <span>01 / THE SHIPWRECK</span>
              <div />
              <Wind size={19} />
            </div>
          </section>
          <section className="entry-card">
            <Compass size={31} className="gold" />
            <span className="eyebrow">
              {joining
                ? "YOUR PLACE AT THE TABLE"
                : "YOUR ADVENTURE STARTS HERE"}
            </span>
            <h2>{joining ? "A companion is waiting." : "Take your place."}</h2>
            <p>
              {joining
                ? "Join the same island, the same choices, the same storyteller."
                : "Invite someone you trust. The island will test that."}
            </p>
            <form onSubmit={enter}>
              <label htmlFor="player-name">Your name</label>
              <input
                id="player-name"
                placeholder="Rafael or Meg"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={40}
                autoComplete="given-name"
              />
              <label>
                {joining
                  ? "Your character is assigned when you join"
                  : "Choose your character"}
              </label>
              {!joining && (
                <div className="character-choice">
                  {(["sam", "liz"] as const).map((id) => (
                    <button
                      type="button"
                      key={id}
                      className={characterChoice === id ? "chosen" : ""}
                      onClick={() => setCharacterChoice(id)}
                    >
                      <span className={`character-seal ${id}`}>
                        {id === "sam" ? <Shield /> : <Feather />}
                      </span>
                      <strong>{id === "sam" ? "Samuel" : "Elizabeth"}</strong>
                      <small>
                        {id === "sam" ? "The protector" : "The archaeologist"}
                      </small>
                      <span className="selection-dot">
                        {characterChoice === id && <Check size={12} />}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <button
                className="primary entry-submit"
                disabled={busy || !name.trim()}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={18} />
                ) : (
                  <>
                    {joining ? "Join the adventure" : "Create your table"}
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>
            <div className="entry-foot">
              <Heart size={14} />
              <span>No game experience needed. Just your imagination.</span>
            </div>
            {credentials && !joining && (
              <button className="link-button" onClick={leave}>
                Start another table
              </button>
            )}
          </section>
        </main>
        <footer className="welcome-footer">
          <span>THE WHISPERING SANDS</span>
          <span>Inspired by a story made for English class.</span>
        </footer>
        {error && <Toast text={error} close={() => setError("")} />}
      </div>
    );
  return (
    <div className="table-shell">
      <header className="table-header">
        <Brand />
        <div className="header-middle">
          <span className="connection-dot" data-online={connected} />
          <span>{connected ? "Your shared table" : "Reconnecting…"}</span>
          <span className="header-divider" />
          <span className="small-caps">{state.chapterTitle}</span>
        </div>
        <div className="header-actions">
          <button
            className="subtle"
            onClick={() => void inviteCompanion()}
            disabled={busy}
          >
            <Link size={15} />
            <span>Invite companion</span>
          </button>
          <button
            className="icon-button"
            aria-label="Table settings"
            onClick={() => setSettings(true)}
          >
            <Settings2 size={18} />
          </button>
        </div>
      </header>
      <main className="table-grid">
        <aside className="character-panel">
          <div className="panel-title">
            <span>YOUR PARTY</span>
            <Users size={15} />
          </div>
          <div
            className="party-tabs"
            role="tablist"
            aria-label="Party characters"
          >
            {state.characters.map((c) => (
              <button
                key={c.id}
                role="tab"
                aria-selected={selectedCharacter === c.id}
                className={selectedCharacter === c.id ? "active" : ""}
                onClick={() => setSelectedCharacter(c.id)}
              >
                {c.shortName}
                {c.id === player?.characterId && <span className="you-dot" />}
              </button>
            ))}
          </div>
          {character && (
            <>
              <div className={`character-hero ${character.id}`}>
                <img
                  className="character-portrait"
                  src={`/art/${character.id}.png`}
                  alt={`${character.name}, ${character.role.toLowerCase()}`}
                />
                <div className="portrait-shade" />
                <div className="portrait-grain" />
                <div className="character-emblem">
                  {character.id === "sam" ? (
                    <Shield size={65} strokeWidth={0.8} />
                  ) : character.id === "liz" ? (
                    <Feather size={65} strokeWidth={0.8} />
                  ) : (
                    <Trees size={65} strokeWidth={0.8} />
                  )}
                </div>
                <div className="character-badge">
                  {character.id === "emily"
                    ? "DM COMPANION"
                    : (state.players.find((p) => p.characterId === character.id)
                        ?.name ?? "AWAITING PLAYER")}
                </div>
                <h2>{character.name}</h2>
                <p>{character.role}</p>
              </div>
              <div className="health-block">
                <div>
                  <span>
                    <Heart size={14} />
                    Vitality
                  </span>
                  <strong>
                    {character.hp}
                    <small> / {character.maxHp}</small>
                  </strong>
                </div>
                <div className="health-track">
                  <div
                    style={{
                      width: `${(character.hp / character.maxHp) * 100}%`,
                    }}
                  />
                </div>
                {character.hp === 0 && (
                  <p className="incapacitated">
                    Incapacitated — needs the party’s help.
                  </p>
                )}
              </div>
              <div className="stats-grid">
                {(["STR", "INT", "SUR"] as Stat[]).map((stat) => {
                  const Icon = statIcons[stat];
                  return (
                    <div key={stat}>
                      <Icon size={18} />
                      <strong>{character.stats[stat]}</strong>
                      <span>{stat}</span>
                    </div>
                  );
                })}
              </div>
              <p className="character-bio">{character.bio}</p>
              <div className="inventory-title">
                <span>
                  <Backpack size={15} />
                  Inventory
                </span>
                <small>
                  {character.inventory.reduce((a, i) => a + i.quantity, 0)}{" "}
                  {character.inventory.reduce((a, i) => a + i.quantity, 0) === 1
                    ? "item"
                    : "items"}
                </small>
              </div>
              <div className="inventory-list">
                {character.inventory.length ? (
                  character.inventory.map((item) => (
                    <details key={item.id}>
                      <summary>
                        <span className="item-glyph">
                          <Backpack size={16} />
                        </span>
                        <span>{item.name}</span>
                        <small>×{item.quantity}</small>
                        <ChevronDown size={13} />
                      </summary>
                      <p>{item.description}</p>
                    </details>
                  ))
                ) : (
                  <p className="empty-copy">
                    Nothing carried yet. Discoveries will appear here.
                  </p>
                )}
              </div>
              <div className="party-presence">
                {state.players.map((p) => (
                  <div key={p.id}>
                    <span
                      className="connection-dot"
                      data-online={live.presence.some(
                        (x) => x.playerId === p.id && x.online,
                      )}
                    />
                    <span>{p.name}</span>
                    <small>
                      {p.id === player?.id
                        ? "you"
                        : live.presence.some(
                              (x) => x.playerId === p.id && x.online,
                            )
                          ? "at the table"
                          : "away"}
                    </small>
                  </div>
                ))}
              </div>
            </>
          )}
        </aside>
        <section className="adventure-panel">
          <div className="scene-toolbar">
            <span className="eyebrow">
              <span />
              CHAPTER {String(state.chapter).padStart(2, "0")}
            </span>
            <span>
              <MapPin size={13} />
              {state.scene.location}
            </span>
          </div>
          <button
            className="scene-canvas"
            onClick={() => setSceneOpen(true)}
            aria-label="View current scene illustration"
          >
            <img src={state.scene.imageUrl} alt={state.scene.description} />
            <div className="scene-vignette" />
            <div className="scene-tags">
              <span>
                <Compass size={13} />
                THE WHISPERING SANDS
              </span>
              {state.scene.status === "generating" && (
                <span className="painting">
                  <Sparkles size={13} />
                  Painting the next moment…
                </span>
              )}
            </div>
            <div className="scene-copy">
              <span className="small-caps">{state.scene.location}</span>
              <h1>{state.scene.title}</h1>
              <p>{state.scene.description}</p>
            </div>
            <span className="expand-label">
              Explore scene
              <ArrowRight size={13} />
            </span>
          </button>
          {state.scene.status === "error" && (
            <div className="scene-error">
              <Sparkles size={14} />
              <span>{state.scene.error}</span>
              <button
                onClick={() =>
                  void perform(() =>
                    api(`/api/rooms/${state.id}/image-retry`, {}),
                  )
                }
              >
                Try illustration again
              </button>
            </div>
          )}
          <div className="scene-filmstrip">
            {latestScenes.map((scene, index) => (
              <button
                key={scene.id}
                className={scene.id === state.scene.id ? "current" : ""}
                onClick={() => {
                  if (scene.id === state.scene.id) setSceneOpen(true);
                  else setViewedScene(scene);
                }}
              >
                <img src={scene.imageUrl} alt="" />
                <span>{String(index + 1).padStart(2, "0")}</span>
                <p>{scene.title}</p>
              </button>
            ))}
            <div className="filmstrip-note">
              <Sparkles size={14} />
              <span>
                Your choices
                <br />
                paint the world.
              </span>
            </div>
          </div>
          {state.pendingCheck && (
            <div className="dice-card">
              <div className="dice-icon">
                <Dices size={30} />
              </div>
              <div>
                <span className="eyebrow">A MOMENT OF CHANCE</span>
                <h3>
                  {
                    state.characters.find(
                      (c) => c.id === state.pendingCheck!.characterId,
                    )?.shortName
                  }{" "}
                  · {state.pendingCheck.stat} check
                </h3>
                <p>{state.pendingCheck.reason}</p>
                <small>
                  D6 +{" "}
                  {
                    state.characters.find(
                      (c) => c.id === state.pendingCheck!.characterId,
                    )?.stats[state.pendingCheck.stat]
                  }{" "}
                  · target {state.pendingCheck.target}
                  {state.pendingCheck.dangerous
                    ? " · a setback costs 1 HP"
                    : ""}
                </small>
              </div>
              <button
                className="primary"
                disabled={
                  busy ||
                  dmBusy ||
                  state.pendingCheck.characterId !== player?.characterId ||
                  !connected
                }
                onClick={() =>
                  void perform(() =>
                    api(`/api/rooms/${state.id}/roll`, {
                      checkId: state.pendingCheck!.id,
                    }),
                  )
                }
              >
                {state.pendingCheck.characterId === player?.characterId ? (
                  <>
                    <Dices size={16} />
                    Roll D6
                  </>
                ) : (
                  <>
                    Waiting for{" "}
                    {
                      state.characters.find(
                        (c) => c.id === state.pendingCheck!.characterId,
                      )?.shortName
                    }
                  </>
                )}
              </button>
            </div>
          )}
          {state.lastRoll && !state.pendingCheck && (
            <div className="last-roll">
              <Dices size={18} />
              <span>
                {
                  state.characters.find(
                    (c) => c.id === state.lastRoll!.characterId,
                  )?.shortName
                }
                :{" "}
                <strong>
                  {state.lastRoll.die} +{" "}
                  {
                    state.characters.find(
                      (c) => c.id === state.lastRoll!.characterId,
                    )?.stats[state.lastRoll.stat]
                  }{" "}
                  = {state.lastRoll.total}
                </strong>
              </span>
              <span className={state.lastRoll.success ? "success" : "setback"}>
                {state.lastRoll.success ? "Success" : "Setback"}
              </span>
              {state.rollDecision === state.lastRoll.id &&
                !state.lastRoll.success &&
                !state.lastRoll.rerolled &&
                state.lastRoll.characterId === player?.characterId &&
                state.characters.find((c) => c.id === player.characterId)!.hp >=
                  2 &&
                state.phase === "playing" && (
                  <>
                    <button
                      className="accept-roll"
                      disabled={busy || dmBusy}
                      onClick={() =>
                        void perform(() =>
                          api(`/api/rooms/${state.id}/roll-accept`, {
                            checkId: state.lastRoll!.id,
                          }),
                        )
                      }
                    >
                      Accept setback
                      <ChevronRight size={13} />
                    </button>
                    <button
                      disabled={busy || dmBusy}
                      onClick={() =>
                        void perform(() =>
                          api(`/api/rooms/${state.id}/reroll`, {
                            checkId: state.lastRoll!.id,
                          }),
                        )
                      }
                    >
                      <RotateCcw size={13} />
                      Push your luck · −1 HP
                    </button>
                  </>
                )}
            </div>
          )}
          <div className="narrator-card">
            <div className="narrator-mark">
              <Compass size={25} />
            </div>
            <div>
              <div className="narrator-label">
                <span>THE STORYTELLER</span>
                <div
                  className={`sound-wave ${live.dmStatus === "speaking" ? "moving" : ""}`}
                >
                  {Array.from({ length: 9 }, (_, i) => (
                    <i key={i} style={{ animationDelay: `${i * 0.12}s` }} />
                  ))}
                </div>
              </div>
              <p>
                {caption ||
                  lastDM?.text ||
                  (state.phase === "lobby"
                    ? "The island has been waiting. Bring your companion to the table, then let the story begin."
                    : "The storyteller is gathering the next thread of your adventure…")}
              </p>
            </div>
          </div>
          {state.phase === "lobby" ? (
            <div className="lobby-callout">
              <div>
                <Users size={20} />
                <div>
                  <strong>
                    {state.players.length < 2
                      ? "One more seat to fill."
                      : "Your party is ready."}
                  </strong>
                  <p>
                    {state.players.length < 2
                      ? "Share your invitation with Meg or Rafael."
                      : `${state.players.map((p) => p.name).join(" and ")} — the island is yours to explore.`}
                  </p>
                </div>
              </div>
              <button
                className="primary"
                disabled={
                  busy ||
                  state.players.length < 2 ||
                  !config?.aiAvailable ||
                  !connected
                }
                onClick={() =>
                  void perform(() => api(`/api/rooms/${state.id}/start`, {}))
                }
              >
                {busy ? (
                  <LoaderCircle size={17} className="spin" />
                ) : (
                  <>
                    Begin adventure
                    <ArrowRight size={17} />
                  </>
                )}
              </button>
              {!config?.aiAvailable && (
                <p className="config-note">
                  Set OPENAI_API_KEY on the server to enable the storyteller.
                </p>
              )}
            </div>
          ) : state.phase === "complete" ? (
            <div className="ending">
              <Sunrise size={22} />
              <strong>Your story is written.</strong>
              <span>Every choice brought you here. Your journal is saved.</span>
            </div>
          ) : (
            <>
              <div className="voice-bar">
                <div
                  className={`live-orb ${live.dmStatus === "speaking" ? "speaking" : ""}`}
                >
                  <Wind size={18} />
                </div>
                <div className="voice-status">
                  <strong>
                    {listening
                      ? "Your turn. The table is listening."
                      : live.speaker
                        ? `${state.players.find((p) => p.id === live.speaker)?.name} is speaking…`
                        : statusText[live.dmStatus]}
                  </strong>
                  <span>
                    {voiceEnabled
                      ? "Tap the microphone to speak. Tap again to finish."
                      : "Enable voice to hear and speak with your storyteller."}
                  </span>
                </div>
                <button
                  className={`talk-button ${listening ? "recording" : ""}`}
                  disabled={
                    !voiceEnabled ||
                    !connected ||
                    !!state.pendingCheck ||
                    !!state.rollDecision ||
                    !!(live.speaker && live.speaker !== player?.id)
                  }
                  onClick={toggleTalk}
                  aria-label={
                    listening ? "Finish speaking" : "Speak to the storyteller"
                  }
                >
                  {listening ? (
                    <span className="stop-square" />
                  ) : (
                    <Mic size={20} />
                  )}
                </button>
                <button
                  className="icon-button"
                  aria-label={muted ? "Unmute table audio" : "Mute table audio"}
                  onClick={() => {
                    setMuted(!muted);
                    muteRef.current = !muted;
                    audio.current.clear();
                  }}
                >
                  {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
                <button
                  className="voice-enable"
                  disabled={voiceLoading || !connected || !config?.aiAvailable}
                  onClick={() => void toggleVoice()}
                >
                  {voiceLoading ? (
                    <LoaderCircle className="spin" size={15} />
                  ) : voiceEnabled ? (
                    <MicOff size={15} />
                  ) : (
                    <Mic size={15} />
                  )}
                  <span>{voiceEnabled ? "Leave voice" : "Enable voice"}</span>
                </button>
              </div>
              <form
                className="action-box"
                onSubmit={(event) => {
                  event.preventDefault();
                  const action = text;
                  void perform(async () => {
                    await api(`/api/rooms/${state.id}/action`, {
                      text: action,
                    });
                    setText("");
                  });
                }}
              >
                <input
                  aria-label="Your action"
                  placeholder={
                    state.pendingCheck || state.rollDecision
                      ? "Resolve the dice check to continue…"
                      : "What do you do? Speak, or write your action…"
                  }
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={1200}
                  disabled={
                    busy ||
                    dmBusy ||
                    !!state.pendingCheck ||
                    !!state.rollDecision ||
                    !!live.speaker ||
                    !connected
                  }
                />
                <button
                  aria-label="Send action"
                  disabled={
                    busy ||
                    dmBusy ||
                    !!state.pendingCheck ||
                    !!state.rollDecision ||
                    !!live.speaker ||
                    !text.trim() ||
                    !connected
                  }
                >
                  <Send size={19} />
                </button>
              </form>
              {live.dmStatus === "error" && (
                <div className="dm-error">
                  <span>{live.error}</span>
                  <button
                    onClick={() =>
                      void perform(() =>
                        api(`/api/rooms/${state.id}/resume`, {}),
                      )
                    }
                  >
                    Resume storyteller
                  </button>
                </div>
              )}
            </>
          )}
        </section>
        <aside className="journal-panel">
          <div className="panel-title">
            <span>THE ADVENTURE</span>
            <BookOpen size={16} />
          </div>
          <div
            className="journal-tabs"
            role="tablist"
            aria-label="Adventure notebook"
          >
            {(["story", "clues", "journal"] as const).map((t) => (
              <button
                role="tab"
                aria-selected={tab === t}
                className={tab === t ? "active" : ""}
                key={t}
                onClick={() => setTab(t)}
              >
                {t === "story"
                  ? "At the table"
                  : t === "clues"
                    ? `Clues${state.clues.length ? " · " + state.clues.length : ""}`
                    : "Journal"}
              </button>
            ))}
          </div>
          <div className="journal-scroll" ref={transcript}>
            {tab === "clues" ? (
              <>
                <div className="notebook-intro">
                  <ScrollText size={30} />
                  <h3>Pieces of the mystery.</h3>
                  <p>Only what you discover belongs here.</p>
                </div>
                {state.clues.length ? (
                  state.clues.map((c) => (
                    <article className="clue" key={c.id}>
                      <span className="eyebrow">DISCOVERED</span>
                      <h3>{c.title}</h3>
                      <p>{c.text}</p>
                    </article>
                  ))
                ) : (
                  <p className="empty-copy">
                    The island is keeping its secrets. For now.
                  </p>
                )}
              </>
            ) : (
              <>
                {state.journal
                  .filter(
                    (e) =>
                      tab === "journal" ||
                      e.kind === "dm" ||
                      e.kind === "player" ||
                      e.kind === "roll",
                  )
                  .map((entry) => (
                    <article key={entry.id} className={`entry ${entry.kind}`}>
                      <div className="entry-meta">
                        {entry.kind === "dm" ? (
                          <>
                            <Compass size={13} />
                            STORYTELLER
                          </>
                        ) : entry.kind === "player" ? (
                          <>
                            <Feather size={13} />
                            {state.players.find((p) => p.id === entry.playerId)
                              ?.name ?? "PLAYER"}
                          </>
                        ) : entry.kind === "roll" ? (
                          <>
                            <Dices size={13} />
                            THE DICE
                          </>
                        ) : (
                          <>
                            <Anchor size={12} />
                            THE JOURNEY
                          </>
                        )}
                        <time>
                          {new Date(entry.at).toLocaleTimeString("en", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      </div>
                      <p>{entry.text}</p>
                    </article>
                  ))}
                {!state.journal.some(
                  (e) => tab === "journal" || e.kind !== "system",
                ) && (
                  <div className="notebook-intro">
                    <Feather size={30} />
                    <h3>An unwritten chapter.</h3>
                    <p>
                      Your conversation and discoveries will find a home here.
                    </p>
                  </div>
                )}
                {caption && (
                  <article className="entry dm live-caption">
                    <div className="entry-meta">
                      <Compass size={13} />
                      STORYTELLER · LIVE
                    </div>
                    <p>
                      {caption}
                      <span className="cursor" />
                    </p>
                  </article>
                )}
              </>
            )}
          </div>
          <div className="journal-foot">
            <span className="connection-dot" data-online={connected} />
            <span>
              {connected ? "Saved as you play" : "Reconnecting to your table"}
            </span>
            <Heart size={12} />
          </div>
        </aside>
      </main>
      <footer className="table-footer">
        <span>ONE ISLAND. TWO ADVENTURERS. YOUR STORY.</span>
        <span>
          D6 + attribute ≥ target · {companion?.name ?? "Your companion"}{" "}
          {live.presence.some((p) => p.playerId === companion?.id && p.online)
            ? "is here"
            : "will join you"}
        </span>
      </footer>
      {inviteModal && (
        <Modal
          title="Adventure is better together."
          close={() => setInviteModal(false)}
        >
          <p>
            Send this private invitation to your companion. It gives them the
            other character at your table.
          </p>
          <div className="invite-link">
            <input
              aria-label="Invitation link"
              value={inviteLink}
              readOnly
              onFocus={(e) => e.target.select()}
            />
            <button className="primary" onClick={() => void copyInvite()}>
              {copied ? <Check size={17} /> : <Copy size={17} />}
            </button>
          </div>
          <div className="modal-note">
            <Users size={17} />
            {state.players.length === 2
              ? "Both seats are filled. Your companion can return using their saved session."
              : "The second seat is waiting."}
          </div>
        </Modal>
      )}
      {settings && (
        <Modal title="Your table, your pace." close={() => setSettings(false)}>
          <div className="setting-row">
            <div>
              <strong>Illustrate the adventure</strong>
              <p>Paint important scenes as the story unfolds.</p>
            </div>
            <button
              role="switch"
              aria-checked={live.imageEnabled}
              aria-label="Scene illustrations"
              className={`toggle ${live.imageEnabled ? "on" : ""}`}
              onClick={() =>
                void perform(() =>
                  api(`/api/rooms/${state.id}/images`, {
                    enabled: !live.imageEnabled,
                  }),
                )
              }
            >
              <span />
            </button>
          </div>
          <div className="setting-row">
            <div>
              <strong>Your storyteller</strong>
              <p>English · AI-generated voice · real D6 rolls</p>
            </div>
            <Compass className="gold" size={22} />
          </div>
          <p className="modal-note">
            The adventure is saved on the server. This device remembers your
            seat. Keep your private invitation between you and your companion.
          </p>
          <button className="subtle" onClick={leave}>
            <LogOut size={16} />
            Leave this device’s seat
          </button>
        </Modal>
      )}
      {sceneOpen && (
        <Modal title={state.scene.title} close={() => setSceneOpen(false)} wide>
          <img
            className="full-scene"
            src={state.scene.imageUrl}
            alt={state.scene.description}
          />
          <p>{state.scene.description}</p>
        </Modal>
      )}
      {viewedScene && (
        <Modal
          title={viewedScene.title}
          close={() => setViewedScene(null)}
          wide
        >
          <img
            className="full-scene"
            src={viewedScene.imageUrl}
            alt={viewedScene.description}
          />
          <p>{viewedScene.description}</p>
        </Modal>
      )}
      {error && <Toast text={error} close={() => setError("")} />}
    </div>
  );
  // Keep archived scenes as a local viewing choice; it never changes the shared current scene.
  function setViewedScene(scene: Scene | null) {
    setArchivedScene(scene);
  }
}

function Brand() {
  return (
    <a className="brand" href="/" aria-label="The Whispering Sands">
      <span className="brand-compass">
        <Compass size={27} strokeWidth={1.2} />
      </span>
      <span>
        THE WHISPERING<span>SANDS</span>
      </span>
    </a>
  );
}
function Toast({ text, close }: { text: string; close: () => void }) {
  return (
    <div className="toast" role="alert">
      <span>{text}</span>
      <button aria-label="Dismiss message" onClick={close}>
        <X size={18} />
      </button>
    </div>
  );
}
function Modal({
  title,
  close,
  children,
  wide = false,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={close}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={close}
        >
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
