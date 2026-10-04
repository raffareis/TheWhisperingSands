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
import { PuzzlePanel } from "./PuzzlePanel";
import { Inventory } from "./Inventory";
import { PartyPanel } from "./PartyPanel";
import { usePartyAudio } from "./usePartyAudio";
import { HostAccess } from "./HostAccess";
import { rememberSeat, savedSeats, type SavedSeat } from "./seats";
const emptyLive: LiveState = {
  dmStatus: "offline",
  speaker: null,
  imageEnabled: true,
  presence: [],
};
const statIcons = { STR: Shield, INT: Brain, SUR: Trees };
function stored(): Credentials | null {
  try {
    const c = JSON.parse(localStorage.getItem("whispering-seat") ?? "null");
    const target =
      new URLSearchParams(location.search).get("room") ??
      new URLSearchParams(location.search).get("id");
    const valid =
      c &&
      typeof c.roomId === "string" &&
      typeof c.playerId === "string" &&
      typeof c.token === "string";
    if (target)
      return valid && c.roomId === target
        ? c
        : (savedSeats().find((seat) => seat.credentials.roomId === target)
            ?.credentials ?? null);
    return valid ? c : null;
  } catch {
    return null;
  }
}
function playerMessage(message: string) {
  return /api[_ -]?key|openai|gpt-|authorization|bearer|stack trace|sk-[a-z0-9]/i.test(
    message,
  )
    ? "Storyteller is not available. Contact your host."
    : message;
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
  const [seats, setSeats] = useState<SavedSeat[]>(savedSeats);
  const [seatUnavailable, setSeatUnavailable] = useState(false);
  const [hostAccess, setHostAccess] = useState<{
    required: boolean;
    authenticated: boolean;
  } | null>(null);
  const [recoveryRequest, setRecoveryRequest] = useState(() => {
    const hash = new URLSearchParams(location.hash.slice(1));
    const code = hash.get("seat") ?? hash.get("recover");
    const room =
      new URLSearchParams(location.search).get("room") ??
      new URLSearchParams(location.search).get("id");
    return code && room
      ? { code, room, kind: hash.has("seat") ? "entry" : "recover" }
      : null;
  });
  const recoveryRun = useRef<{
    request: string;
    promise: Promise<{ credentials: Credentials; state: RoomState }>;
  } | null>(null);
  const hostRun = useRef<Promise<void> | null>(null);
  const [hostBusy, setHostBusy] = useState(false);
  const [recoveryLink, setRecoveryLink] = useState<{
    link: string;
    name: string;
    expiresAt: number;
  } | null>(null);
  const [recoveryCopied, setRecoveryCopied] = useState(false);
  const [readingMode, setReadingMode] = useState(
    () => localStorage.getItem("whispering-reading") === "true",
  );
  const [state, setState] = useState<RoomState | null>(null);
  const [live, setLive] = useState<LiveState>(emptyLive);
  const [config, setConfig] = useState<Configuration | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [operationBusy, setBusy] = useState(false);
  const lessonPaused = !!state?.lessonStatus && state.lessonStatus !== "active";
  const busy = operationBusy || lessonPaused;
  const [name, setName] = useState("");
  const [characterChoice, setCharacterChoice] = useState<"sam" | "liz">("sam");
  const [invite, setInvite] = useState("");
  const [inviteModal, setInviteModal] = useState(false);
  const [tab, setTab] = useState<"story" | "clues" | "journal" | "evidence">(
    "evidence",
  );
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
  const [talkLoading, setTalkLoading] = useState(false);
  const socket = useRef<WebSocket | null>(null);
  const partyVoice = usePartyAudio(
    socket,
    live,
    listening || voiceLoading || talkLoading,
    setError,
  );
  const audioSession = useRef(0);
  const dmFloorPending = useRef(false);
  const audio = useRef(new TableAudio());
  const muteRef = useRef(false);
  const voiceRef = useRef(false);
  const transcript = useRef<HTMLDivElement>(null);
  const reconnect = useRef<ReturnType<typeof setTimeout> | null>(null);
  const params = new URLSearchParams(location.search);
  const invitation = params.get("invite");
  const invitationRoom = params.get("room") ?? params.get("id");
  const joining =
    !!invitation && !!invitationRoom && credentials?.roomId !== invitationRoom;
  const player = state?.players.find((p) => p.id === credentials?.playerId);
  const character = state?.characters.find((c) => c.id === selectedCharacter);
  const companion = state?.players.find((p) => p.id !== credentials?.playerId);
  const dmBusy =
    lessonPaused ||
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
    if (!response.ok) {
      if (response.status === 403 && route === "/api/rooms")
        setHostAccess({ required: true, authenticated: false });
      throw new Error(
        playerMessage(result.error ?? "This action could not be completed."),
      );
    }
    return result;
  }
  function adopt(value: {
    credentials: Credentials;
    state: RoomState;
    invite?: string;
  }) {
    if (credentials) rememberSeat(credentials, state);
    rememberSeat(value.credentials, value.state);
    setSeats(savedSeats());
    setSeatUnavailable(false);
    setError("");
    localStorage.setItem("whispering-seat", JSON.stringify(value.credentials));
    setCredentials(value.credentials);
    setState(value.state);
    setSelectedCharacter(
      value.state.players.find((p) => p.id === value.credentials.playerId)!
        .characterId,
    );
    if (value.invite) setInvite(value.invite);
    history.replaceState(
      null,
      "",
      `/whispering-sands?room=${value.credentials.roomId}`,
    );
  }
  useEffect(() => {
    localStorage.setItem("whispering-reading", String(readingMode));
  }, [readingMode]);
  useEffect(() => {
    if (!recoveryLink) return;
    const timer = setTimeout(
      () => setRecoveryLink(null),
      Math.max(0, recoveryLink.expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [recoveryLink]);
  useEffect(() => {
    let disposed = false;
    void fetch("/api/host-access")
      .then(async (r) => {
        if (r.ok) {
          const access = await r.json();
          if (!disposed)
            setHostAccess((previous) =>
              previous?.authenticated ? previous : access,
            );
        }
      })
      .catch(() => {});
    const code = new URLSearchParams(location.hash.slice(1)).get("host");
    if (code) {
      setHostBusy(true);
      if (!hostRun.current)
        hostRun.current = fetch("/api/host-access", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: code }),
        }).then(async (response) => {
          if (!response.ok)
            throw new Error(
              "That host code could not be accepted. Check the code and try again.",
            );
          const hash = new URLSearchParams(location.hash.slice(1));
          hash.delete("host");
          history.replaceState(
            null,
            "",
            `/whispering-sands${location.search}${hash.size ? `#${hash}` : ""}`,
          );
        });
      void hostRun.current
        .then(() => {
          if (!disposed) setHostAccess({ required: true, authenticated: true });
        })
        .catch((e) => {
          if (!disposed) {
            setError(e.message);
            setHostAccess({ required: true, authenticated: false });
          }
        })
        .finally(() => {
          if (!disposed) setHostBusy(false);
        });
    }
    return () => {
      disposed = true;
    };
  }, []);
  useEffect(() => {
    if (!recoveryRequest) return;
    let disposed = false;
    setSeatUnavailable(false);
    setBusy(true);
    const request = `${recoveryRequest.kind}:${recoveryRequest.room}:${recoveryRequest.code}`;
    if (recoveryRun.current?.request !== request) {
      recoveryRun.current = {
        request,
        promise: fetch(
          `/api/rooms/${encodeURIComponent(recoveryRequest.room)}/${recoveryRequest.kind}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              recoveryRequest.kind === "entry"
                ? { seatCode: recoveryRequest.code }
                : { recoveryCode: recoveryRequest.code },
            ),
          },
        ).then(async (response) => {
          const value = await response.json();
          if (!response.ok)
            throw new Error(
              value.error ??
                "This return link is no longer valid. Ask your companion for a new one.",
            );
          return value;
        }),
      };
    }
    void recoveryRun.current.promise
      .then((value) => {
        if (!disposed) {
          adopt(value);
          setRecoveryRequest(null);
        }
      })
      .catch((e) => {
        if (!disposed) {
          setError(playerMessage(e.message));
          setSeatUnavailable(true);
        }
      })
      .finally(() => {
        if (!disposed) setBusy(false);
      });
    return () => {
      disposed = true;
    };
  }, [recoveryRequest]);
  useEffect(() => {
    void fetch("/api/config")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setError("The adventure server is not available."));
  }, []);
  useEffect(() => {
    if (!credentials || joining || recoveryRequest) return;
    setSeatUnavailable(false);
    let disposed = false;
    let delay = 600;
    let receivedLiveState = false;
    void fetch(`/api/rooms/${credentials.roomId}`, {
      headers: { Authorization: `Bearer ${credentials.token}` },
    })
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok)
          throw new Error(
            playerMessage(v.error ?? "Your saved seat could not be opened."),
          );
        if (!disposed) {
          setState((previous) =>
            previous &&
            previous.id === v.state.id &&
            previous.revision > v.state.revision
              ? previous
              : v.state,
          );
          rememberSeat(credentials, v.state);
          setSeats(savedSeats());
          if (!receivedLiveState) setLive(v.live);
          setConfig(v.config);
          setSelectedCharacter(
            v.state.players.find(
              (p: { id: string }) => p.id === credentials.playerId,
            ).characterId,
          );
        }
      })
      .catch((e) => {
        if (!disposed && !receivedLiveState) {
          setError(e.message);
          setSeatUnavailable(true);
        }
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
        if (disposed) return;
        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }
        partyVoice.receive(message, credentials!.playerId);
        if (message.type === "state") {
          receivedLiveState = true;
          setSeatUnavailable(false);
          setState((previous) =>
            previous &&
            previous.id === message.state.id &&
            previous.revision > message.state.revision
              ? previous
              : message.state,
          );
          rememberSeat(credentials!, message.state);
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
          dmFloorPending.current = false;
          setTalkLoading(false);
          audio.current.close();
        }
        if (message.type === "floor_granted") {
          dmFloorPending.current = false;
          setTalkLoading(false);
          if (voiceRef.current) {
            audio.current.setCapturing(true);
            setListening(true);
          } else if (ws.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify({ type: "floor_end" }));
        }
        if (message.type === "floor_released") {
          dmFloorPending.current = false;
          setTalkLoading(false);
          audio.current.setCapturing(false);
          setListening(false);
        }
        if (message.type === "error") {
          setError(playerMessage(message.message));
          dmFloorPending.current = false;
          setTalkLoading(false);
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
        audioSession.current++;
        partyVoice.close();
        dmFloorPending.current = false;
        setTalkLoading(false);
        if (event.code === 4001 || event.code === 4003) {
          setSeatUnavailable(event.code === 4003);
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
      setConnected(false);
      if (reconnect.current) clearTimeout(reconnect.current);
      socket.current?.close();
      audioSession.current++;
      audio.current.close();
      partyVoice.close();
      dmFloorPending.current = false;
      setTalkLoading(false);
      setVoiceEnabled(false);
      setVoiceLoading(false);
      voiceRef.current = false;
      setListening(false);
    };
  }, [credentials?.token, joining, recoveryRequest]);
  useEffect(() => {
    if (tab === "evidence") return;
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
    if (lessonPaused) {
      setError("Your lesson is paused. Ask your teacher to reopen it.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(
        playerMessage(e instanceof Error ? e.message : "This action failed."),
      );
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
      ? `${location.origin}/whispering-sands?room=${state.id}&invite=${invite}`
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
    const session = audioSession.current;
    try {
      if (voiceEnabled) {
        if (listening) await audio.current.finishCapture();
        if (session !== audioSession.current) return;
        if (listening || dmFloorPending.current) send({ type: "floor_end" });
        send({ type: "voice_stop" });
        audio.current.close();
        setVoiceEnabled(false);
        setListening(false);
        dmFloorPending.current = false;
        setTalkLoading(false);
        voiceRef.current = false;
        return;
      }
      partyVoice.cancel();
      setVoiceLoading(true);
      setError("");
      const ws = socket.current;
      await audio.current.enable((data) => {
        if (ws?.readyState === WebSocket.OPEN)
          ws.send(JSON.stringify({ type: "audio", data }));
      });
      if (session !== audioSession.current) return;
      await audio.current.unlock();
      send({ type: "voice_start" });
    } catch (e) {
      if (session !== audioSession.current) return;
      setVoiceLoading(false);
      audio.current.close();
      setError(
        playerMessage(
          e instanceof Error ? e.message : "Microphone could not be enabled.",
        ),
      );
    }
  }
  async function toggleTalk() {
    if (dmFloorPending.current) return;
    const session = audioSession.current;
    try {
      if (listening) {
        await audio.current.finishCapture();
        if (session !== audioSession.current) return;
        send({ type: "floor_end" });
        setListening(false);
      } else {
        partyVoice.cancel();
        audio.current.clear();
        dmFloorPending.current = true;
        setTalkLoading(true);
        send({ type: "floor_start" });
      }
    } catch (e) {
      dmFloorPending.current = false;
      setTalkLoading(false);
      setError((e as Error).message);
    }
  }
  async function makeRecovery(characterId: "sam" | "liz") {
    await perform(async () => {
      const result = await api<{ recoveryCode: string }>(
        `/api/rooms/${state!.id}/recovery`,
        { characterId },
      );
      const target = state!.players.find((p) => p.characterId === characterId);
      setRecoveryCopied(false);
      setRecoveryLink({
        link: `${location.origin}/whispering-sands?room=${state!.id}#recover=${encodeURIComponent(result.recoveryCode)}`,
        name: target?.name ?? "Your companion",
        expiresAt: Date.now() + 15 * 60 * 1000,
      });
    });
  }
  async function copyRecovery() {
    if (!recoveryLink || recoveryLink.expiresAt <= Date.now()) return;
    try {
      await navigator.clipboard.writeText(recoveryLink.link);
      setRecoveryCopied(true);
    } catch {
      setError(
        "This browser could not copy the return link. Allow clipboard access or use another browser.",
      );
    }
  }
  function returnToSeat(seat: SavedSeat) {
    localStorage.setItem("whispering-seat", JSON.stringify(seat.credentials));
    setState(null);
    setError("");
    setSeatUnavailable(false);
    setCredentials(seat.credentials);
    history.replaceState(
      null,
      "",
      `/whispering-sands?room=${seat.credentials.roomId}`,
    );
  }
  function leave() {
    if (credentials) rememberSeat(credentials, state);
    setSeats(savedSeats());
    socket.current?.close();
    audioSession.current++;
    audio.current.close();
    partyVoice.close();
    dmFloorPending.current = false;
    setTalkLoading(false);
    setListening(false);
    setVoiceEnabled(false);
    setVoiceLoading(false);
    voiceRef.current = false;
    localStorage.removeItem("whispering-seat");
    setCredentials(null);
    setConnected(false);
    setState(null);
    setLive(emptyLive);
    setCaption("");
    setText("");
    setSettings(false);
    setInviteModal(false);
    setInvite("");
    setRecoveryLink(null);
    setRecoveryRequest(null);
    setSeatUnavailable(false);
    setError("");
    history.replaceState(null, "", "/whispering-sands");
  }
  const lastDM = state?.journal.filter((e) => e.kind === "dm").at(-1);
  const latestScenes = state
    ? [
        ...state.sceneHistory.filter((s) => s.status === "ready"),
        state.scene,
      ].slice(-5)
    : [];
  if (!state || joining || recoveryRequest)
    return (
      <div className="welcome">
        <header className="welcome-header">
          <Brand />
          <a className="all-activities" href="/">
            All activities
          </a>
          <span className="small-caps">An island mystery · for two</span>
        </header>
        <main className="welcome-layout">
          <section className="welcome-copy">
            <div className="eyebrow">
              <span />A cooperative island adventure
            </div>
            <h1>
              Washed ashore.
              <br />
              <em>Not alone.</em>
            </h1>
            <p>
              A storm. An uncharted island.
              <br />
              Search together. Read the evidence. Find a way home.
            </p>
            <figure className="arrival-plate">
              <img
                src="/art/coastal-field-study-sunburst.webp"
                alt="A storm-torn boat on the shore of a misty island, with carved markings at the forest edge."
              />
              <figcaption>
                <span>PLATE 01</span> The shore after the storm{" "}
                <span>THE WHISPERING SANDS</span>
              </figcaption>
            </figure>
            <div className="chapter-hint">
              <span>01 / THE SHIPWRECK</span>
              <div />
              <Wind size={19} />
            </div>
          </section>
          <section className="entry-card">
            <Compass size={31} className="gold" />
            <span className="eyebrow">
              {joining ? "YOUR PLACE AT THE TABLE" : "EXPEDITION REGISTER"}
            </span>
            <h2>{joining ? "A companion is waiting." : "Who are you?"}</h2>
            <p>
              {joining
                ? "Join the same island, the same choices, the same storyteller."
                : "Choose a character, then invite your companion to take the other seat."}
            </p>
            {recoveryRequest ? (
              <div className="saved-adventures">
                <h3>
                  {seatUnavailable
                    ? "Your return link needs renewing."
                    : "Returning to your adventure…"}
                </h3>
                <p>
                  {seatUnavailable
                    ? "Ask your companion to open Table settings and choose Help partner return. Your name, discoveries and journal stay with the table."
                    : "Restoring your character and saved progress."}
                </p>
                <button className="subtle" disabled={busy} onClick={leave}>
                  Back to entrance
                </button>
              </div>
            ) : credentials && !joining ? (
              <div className="saved-adventures">
                <h3>
                  {seatUnavailable
                    ? "Your saved seat needs help."
                    : "Returning to your table…"}
                </h3>
                <p>
                  {seatUnavailable
                    ? "Ask your companion for a return link from Table settings. You can also return to the entrance and start another table."
                    : "Your adventure and journal are waiting."}
                </p>
                <button className="subtle" onClick={leave}>
                  Back to entrance · keep saved adventure
                </button>
              </div>
            ) : !joining &&
              ((config?.hostAccessRequired && !hostAccess?.authenticated) ||
                (hostAccess?.required && !hostAccess.authenticated) ||
                (!hostAccess?.authenticated &&
                  !!new URLSearchParams(location.hash.slice(1)).get(
                    "host",
                  ))) ? (
              <HostAccess
                busy={hostBusy}
                onReady={() => {
                  setHostAccess({ required: true, authenticated: true });
                  setError("");
                }}
              />
            ) : (
              <form onSubmit={enter}>
                <label htmlFor="player-name">Your name</label>
                <input
                  id="player-name"
                  placeholder="Your name"
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
                        aria-pressed={characterChoice === id}
                        onClick={() => setCharacterChoice(id)}
                      >
                        <span className={`character-seal ${id}`}>
                          <img src={`/art/${id}-sunburst.webp`} alt="" />
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
            )}
            {!credentials &&
              !joining &&
              !recoveryRequest &&
              seats.length > 0 && (
                <section
                  className="saved-adventures"
                  aria-label="Saved adventures"
                >
                  <h3>Return to a saved adventure</h3>
                  {seats.map((seat) => (
                    <button
                      className="saved-seat"
                      key={`${seat.credentials.roomId}-${seat.credentials.playerId}`}
                      onClick={() => returnToSeat(seat)}
                    >
                      <strong>
                        {seat.name}
                        {seat.character
                          ? ` · ${seat.character === "sam" ? "Sam" : "Liz"}`
                          : ""}
                      </strong>
                      <span>{seat.title}</span>
                      <ArrowRight size={16} />
                    </button>
                  ))}
                </section>
              )}
            <div className="entry-foot">
              <Heart size={14} />
              <span>Two players · shared clues · one persistent story</span>
            </div>
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
        <a className="all-activities" href="/">
          All activities
        </a>
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
      {lessonPaused && (
        <section className="lesson-pause-banner" role="status">
          <strong>
            {state.lessonStatus === "archived"
              ? "This adventure is archived."
              : "Your lesson is paused."}
          </strong>
          <p>
            Your discoveries, objects and journal are saved. You can review them
            now; your teacher will reopen the table when it is time to continue.
          </p>
        </section>
      )}
      <main className="table-grid">
        <aside className="character-panel">
          <div className="panel-title">
            <span>01 / EXPEDITION</span>
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
                  src={`/art/${character.id}-sunburst.webp`}
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
                    ? "STORY COMPANION"
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
                    You can still discuss and solve evidence. If everyone needs
                    help, rest together.
                  </p>
                )}
              </div>
              {state.phase === "playing" &&
                state.characters.every((c) => c.hp === 0) && (
                  <div className="rest-callout">
                    <button
                      className="subtle"
                      disabled={
                        busy ||
                        !connected ||
                        dmBusy ||
                        !!state.pendingCheck ||
                        !!state.rollDecision ||
                        state.characters.every((c) => c.hp >= c.maxHp)
                      }
                      onClick={() =>
                        void perform(() =>
                          api(`/api/rooms/${state.id}/rest`, {}),
                        )
                      }
                    >
                      <Heart size={15} />
                      Rest together · recover up to 3 HP
                    </button>
                    <p>Take a safe pause. Your evidence stays with you.</p>
                  </div>
                )}
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
              <Inventory
                items={character.inventory}
                owner={character.shortName}
              />
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
              CHAPTER {String(Math.min(state.chapter + 1, 5)).padStart(2, "0")}
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
                CURRENT OBSERVATION
              </span>
              {state.scene.status === "generating" && (
                <span className="painting">
                  <Sparkles size={13} />
                  Painting the next moment…
                </span>
              )}
            </div>
            <span className="expand-label">
              Explore scene
              <ArrowRight size={13} />
            </span>
          </button>
          <div className="scene-copy">
            <span className="plate-number">
              FIELD RECORD / {String(state.chapter).padStart(2, "0")}
            </span>
            <span className="small-caps">{state.scene.location}</span>
            <h1>{state.scene.title}</h1>
            <p>{state.scene.description}</p>
          </div>
          {state.scene.status === "error" && (
            <div className="scene-error">
              <Sparkles size={14} />
              <span>
                {
                  "This illustration is unavailable. Your adventure can continue."
                }
              </span>
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
                Collected views
                <br />
                of the island.
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
          {state.pendingCheck &&
            state.pendingCheck.characterId !== player?.characterId &&
            state.players.some(
              (p) =>
                p.characterId === state.pendingCheck!.characterId &&
                !live.presence.some(
                  (presence) => presence.playerId === p.id && presence.online,
                ),
            ) && (
              <div className="offline-check">
                <p>
                  The player needed for this check is away. Wait for them, help
                  them return in Table settings, or cancel this check to
                  continue.
                </p>
                <button
                  className="subtle"
                  disabled={busy || !connected}
                  onClick={() =>
                    void perform(() =>
                      api(`/api/rooms/${state.id}/check-cancel`, {
                        checkId: state.pendingCheck!.id,
                      }),
                    )
                  }
                >
                  Cancel absent companion’s check
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
                    ? "The storm has passed. Invite your companion, then begin at the wreck."
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
                      ? "Share your private invitation with your partner."
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
                  Storyteller is not available. Contact your host.
                </p>
              )}
            </div>
          ) : state.phase === "complete" ? (
            <div className="ending">
              <Sunrise size={22} />
              <strong>
                {state.ending?.rescued
                  ? "You found your way home."
                  : "Your story is written."}
              </strong>
              <span>
                {state.ending?.choice === "confront"
                  ? "You chose to confront the keeper."
                  : state.ending?.choice === "forgive"
                    ? "You chose to forgive the keeper."
                    : state.ending?.choice === "leave"
                      ? "You chose to leave without reconciliation."
                      : "Every choice brought you here."}{" "}
                {state.ending?.rescued ? "The party was rescued. " : ""}Your
                discoveries, choice and journal are saved.
              </span>
              <button className="subtle" onClick={leave}>
                Start another adventure · keep this journal
              </button>
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
                      ? "Your turn. Speak to the storyteller."
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
                    !listening &&
                    (!voiceEnabled ||
                      talkLoading ||
                      partyVoice.loading ||
                      partyVoice.talking ||
                      !!live.partySpeaker ||
                      !connected ||
                      !!state.pendingCheck ||
                      !!state.rollDecision ||
                      !!(live.speaker && live.speaker !== player?.id))
                  }
                  onClick={() => void toggleTalk()}
                  aria-pressed={listening}
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
                  aria-label={
                    muted
                      ? "Unmute storyteller audio"
                      : "Mute storyteller audio"
                  }
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
                  disabled={
                    voiceLoading ||
                    (!voiceEnabled && (!connected || !config?.aiAvailable))
                  }
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
              <label className="storyteller-label" htmlFor="storyteller-action">
                Ask the storyteller
              </label>
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
                  id="storyteller-action"
                  aria-label="Ask the storyteller"
                  placeholder={
                    state.pendingCheck || state.rollDecision
                      ? "Resolve the dice check to continue…"
                      : "Describe your action or ask about your discovery…"
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
                    !!live.partySpeaker ||
                    partyVoice.talking ||
                    partyVoice.loading ||
                    !connected
                  }
                />
                <button
                  aria-label="Ask the storyteller"
                  disabled={
                    busy ||
                    dmBusy ||
                    !!state.pendingCheck ||
                    !!state.rollDecision ||
                    !!live.speaker ||
                    !!live.partySpeaker ||
                    partyVoice.talking ||
                    partyVoice.loading ||
                    !text.trim() ||
                    !connected
                  }
                >
                  <Send size={19} />
                </button>
              </form>
              {live.dmStatus === "error" && (
                <div className="dm-error">
                  <span>
                    {playerMessage(
                      live.error ??
                        "Storyteller is not available. Contact your host.",
                    )}
                  </span>
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
          {credentials && (
            <PartyPanel
              room={state}
              credentials={credentials}
              connected={connected}
              voice={{
                enabled: partyVoice.enabled,
                loading: partyVoice.loading,
                talking: partyVoice.talking,
                speaker: live.partySpeaker ?? null,
                blocked:
                  state.phase === "complete" ||
                  dmBusy ||
                  listening ||
                  talkLoading ||
                  voiceLoading ||
                  !!live.speaker,
                enable: partyVoice.enable,
                talk: partyVoice.talk,
              }}
            />
          )}
        </section>
        <aside className="journal-panel">
          <div className="panel-title">
            <span>03 / FIELD NOTES</span>
            <BookOpen size={16} />
          </div>
          <div
            className="journal-tabs"
            role="tablist"
            aria-label="Adventure notebook"
          >
            {(["evidence", "story", "clues", "journal"] as const).map((t) => (
              <button
                role="tab"
                aria-selected={tab === t}
                className={tab === t ? "active" : ""}
                key={t}
                onClick={() => setTab(t)}
              >
                {t === "evidence"
                  ? "Evidence"
                  : t === "story"
                    ? "At the table"
                    : t === "clues"
                      ? `Clues${state.clues.length ? " · " + state.clues.length : ""}`
                      : "Journal"}
              </button>
            ))}
          </div>
          <div className="journal-scroll" ref={transcript}>
            {tab === "evidence" && state.phase === "lobby" ? (
              <div className="notebook-intro">
                <ScrollText size={30} />
                <h3>Two records. One discovery.</h3>
                <p>
                  Once your adventure begins, each player receives a different
                  piece of evidence here. Describe yours in English and work
                  together to open both locks.
                </p>
              </div>
            ) : tab === "evidence" && credentials ? (
              <PuzzlePanel
                key={state.puzzleView?.id}
                room={state}
                credentials={credentials}
                readingMode={readingMode}
                setReadingMode={setReadingMode}
              />
            ) : tab === "clues" ? (
              <>
                <div className="notebook-intro">
                  <ScrollText size={30} />
                  <h3>The evidence so far.</h3>
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
                    Explore the shore. Clues you discover together will be
                    recorded here.
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
        <span>THE WHISPERING SANDS / EXPEDITION RECORD</span>
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
        <Modal
          title="Your table, your pace."
          close={() => {
            setSettings(false);
            setRecoveryLink(null);
          }}
        >
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
          <div className="setting-row">
            <div>
              <strong>Reading mode</strong>
              <p>Larger type and clear lines for field evidence.</p>
            </div>
            <button
              role="switch"
              aria-checked={readingMode}
              aria-label="Reading mode"
              className={`toggle ${readingMode ? "on" : ""}`}
              onClick={() => setReadingMode(!readingMode)}
            >
              <span />
            </button>
          </div>
          <section className="recovery-settings">
            <h3>Return to this adventure</h3>
            <p>
              Your name, character and progress stay at this table. A return
              link moves a seat to another device.
            </p>
            {companion && (
              <button
                className="subtle"
                disabled={busy}
                onClick={() => void makeRecovery(companion.characterId)}
              >
                Help partner return
              </button>
            )}
            {player && (
              <button
                className="subtle"
                disabled={busy}
                onClick={() => void makeRecovery(player.characterId)}
              >
                Move my seat to another device
              </button>
            )}
            {recoveryLink && (
              <div className="return-link">
                <p>
                  Return link ready for {recoveryLink.name}. Expires at{" "}
                  {new Date(recoveryLink.expiresAt).toLocaleTimeString("en", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  (15 minutes). It can be used once. Share privately with that
                  player.
                </p>
                <button className="primary" onClick={() => void copyRecovery()}>
                  <Copy size={16} />
                  {recoveryCopied
                    ? "Return link copied"
                    : "Copy private return link"}
                </button>
              </div>
            )}
          </section>
          <button className="subtle" onClick={leave}>
            <LogOut size={16} />
            Back to entrance · keep saved adventure
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
    <a
      className="brand"
      href="/whispering-sands"
      aria-label="The Whispering Sands"
    >
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
