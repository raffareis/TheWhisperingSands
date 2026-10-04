import { useRef, useState, type RefObject } from "react";
import type { LiveState } from "../shared/types";
import { TableAudio } from "./audio";

export function usePartyAudio(
  socket: RefObject<WebSocket | null>,
  live: LiveState,
  dmSpeaking: boolean,
  report: (message: string) => void,
) {
  const audio = useRef(new TableAudio());
  const enabledRef = useRef(false);
  const talkingRef = useRef(false);
  const pendingRef = useRef(false);
  const generation = useRef(0);
  const blockedRef = useRef(false);
  blockedRef.current =
    dmSpeaking ||
    !!live.speaker ||
    ["speaking", "thinking", "connecting"].includes(live.dmStatus);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [talking, setTalking] = useState(false);
  function send(type: string) {
    if (socket.current?.readyState !== WebSocket.OPEN)
      throw new Error("Your table is reconnecting. Please wait.");
    socket.current.send(JSON.stringify({ type }));
  }
  function cancel() {
    const active = talkingRef.current || pendingRef.current;
    audio.current.setCapturing(false);
    talkingRef.current = false;
    pendingRef.current = false;
    setTalking(false);
    setLoading(false);
    audio.current.clear();
    if (active && socket.current?.readyState === WebSocket.OPEN)
      send("party_end");
  }
  function close() {
    generation.current++;
    cancel();
    enabledRef.current = false;
    setEnabled(false);
    audio.current.close();
  }
  async function enable() {
    const run = generation.current;
    if (enabledRef.current) {
      if (talkingRef.current) await audio.current.finishCapture();
      if (run !== generation.current) return;
      close();
      return;
    }
    setLoading(true);
    try {
      await audio.current.enableListening();
      if (run !== generation.current) return;
      enabledRef.current = true;
      setEnabled(true);
    } catch (e) {
      if (run === generation.current) report((e as Error).message);
    } finally {
      if (run === generation.current) setLoading(false);
    }
  }
  async function talk() {
    if (pendingRef.current) return;
    const run = generation.current;
    try {
      if (talkingRef.current) {
        await audio.current.finishCapture();
        if (run !== generation.current) return;
        send("party_end");
        talkingRef.current = false;
        setTalking(false);
      } else {
        if (!enabledRef.current || blockedRef.current || live.partySpeaker)
          return;
        pendingRef.current = true;
        setLoading(true);
        const ws = socket.current;
        await audio.current.enable((data) => {
          if (talkingRef.current && ws?.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify({ type: "party_audio", data }));
        });
        if (
          run !== generation.current ||
          !enabledRef.current ||
          !pendingRef.current
        )
          return;
        if (blockedRef.current) {
          cancel();
          return;
        }
        send("party_start");
      }
    } catch (e) {
      if (run !== generation.current) return;
      cancel();
      report((e as Error).message);
    }
  }
  function receive(
    message: {
      type: string;
      status?: string;
      delta?: string;
      playerId?: string;
      action?: string;
    },
    playerId: string,
  ) {
    if (
      message.type === "party_audio" &&
      enabledRef.current &&
      !blockedRef.current &&
      message.playerId !== playerId &&
      message.delta
    )
      audio.current.play(message.delta);
    if (message.type === "party_floor_granted") {
      if (!enabledRef.current || blockedRef.current || !pendingRef.current) {
        cancel();
        send("party_end");
        return;
      }
      pendingRef.current = false;
      talkingRef.current = true;
      audio.current.setCapturing(true);
      setTalking(true);
      setLoading(false);
    }
    if (message.type === "party_floor_released") {
      audio.current.setCapturing(false);
      talkingRef.current = false;
      pendingRef.current = false;
      setTalking(false);
      setLoading(false);
    }
    if (message.type === "floor_granted") blockedRef.current = true;
    if (message.type === "dm_status")
      blockedRef.current = ["speaking", "thinking", "connecting"].includes(
        message.status ?? "",
      );
    if (
      message.type === "floor_granted" ||
      (message.type === "dm_status" &&
        ["speaking", "thinking", "connecting"].includes(message.status ?? ""))
    )
      cancel();
    if (message.type === "error" && message.action?.startsWith("party"))
      cancel();
  }
  return {
    enabled,
    loading,
    talking,
    blocked: blockedRef.current,
    enable: () => void enable(),
    talk: () => void talk(),
    cancel,
    close,
    receive,
  };
}
