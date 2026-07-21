"use client";

import { useCallback, useEffect, useRef, useState } from "react";
// Type-only — erased at compile time, so the org module (and Prisma) never
// reaches the browser bundle.
import type { Gender } from "@/cortex/org";

/**
 * Voice in/out for the Cortex Assistant, using the browser's Web Speech API.
 *
 * Runs entirely in the browser — no audio leaves the device, no server
 * round-trip, no per-minute cost. Recognition is Chrome/Edge/Safari only, so
 * callers must hide the mic when `micSupported` is false rather than render a
 * button that silently does nothing.
 */

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}
interface SpeechRecognitionErrorEventLike { error: string }

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null;
}

type RecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/**
 * Voice names that identify a speaker's gender, across Chrome/Edge/Safari on
 * Windows, macOS, and Android. Test female FIRST — "female" contains "male".
 */
const FEMALE_VOICE = /female|zira|heera|neerja|aria|jenny|michelle|samantha|victoria|karen|moira|tessa|fiona|susan|hazel|linda|catherine|serena|kate|amelie|google uk english female/i;
const MALE_VOICE = /\bmale\b|david|mark|george|daniel|alex|fred|thomas|ravi|prabhat|guy|eric|christopher|ryan|rishi|oliver|google uk english male/i;

/**
 * Best available voice for a gender: prefer Indian English (Ryvan's team),
 * then British, then anything English.
 */
function pickVoice(gender: Gender): SpeechSynthesisVoice | null {
  const all = window.speechSynthesis.getVoices();
  if (!all.length) return null;
  const english = all.filter((v) => /^en[-_]/i.test(v.lang));
  const pool = english.length ? english : all;

  const score = (v: SpeechSynthesisVoice) => {
    let s = 0;
    if (/^en[-_]IN/i.test(v.lang)) s += 4;
    else if (/^en[-_]GB/i.test(v.lang)) s += 2;
    const isFemale = FEMALE_VOICE.test(v.name);
    const isMale = !isFemale && MALE_VOICE.test(v.name);
    if (gender === "female" && isFemale) s += 8;
    if (gender === "male" && isMale) s += 8;
    return s;
  };
  return [...pool].sort((a, b) => score(b) - score(a))[0] || null;
}

/**
 * Work out why the microphone was refused, after SpeechRecognition has already
 * failed with its uninformative "not-allowed". getUserMedia distinguishes the
 * causes that Chrome flattens into one code. Best-effort: if it can't tell us
 * anything either, we leave the original message alone.
 */
async function diagnoseMic(report: (msg: string) => void): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // The mic opens fine — so the block is specific to speech recognition.
    stream.getTracks().forEach((t) => t.stop());
    report(
      "The microphone works, but Chrome refused speech recognition. Close other tabs using the mic, then reload. If it persists, the speech service may be blocked by a VPN, extension, or network policy. (not-allowed)",
    );
  } catch (e) {
    const name = e instanceof Error ? e.name : "unknown";
    report(
      name === "NotAllowedError"
        ? "The microphone is blocked outside Chrome. Chrome's own site permission is fine — check Windows: Settings → Privacy & security → Microphone → turn on both 'Microphone access' and 'Let desktop apps access your microphone', then restart Chrome. (NotAllowedError)"
        : name === "NotFoundError"
          ? "No microphone is connected to this device. (NotFoundError)"
          : name === "NotReadableError"
            ? "Another app is holding the microphone (Teams, Zoom, Meet…). Close it and try again. (NotReadableError)"
            : `Could not open the microphone (${name}).`,
    );
  }
}

/** Markdown reads terribly out loud ("asterisk asterisk Total Leads"). */
function toSpeakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " code block ")
    .replace(/[*_`#>]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*[-•]\s*/gm, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param onFinalTranscript called with what the user actually said
 * @param onSilence called when a listening turn ended with nothing said, with
 *        how long the turn lasted. The duration matters: a turn that ends after
 *        seconds is a person thinking, but one that ends in milliseconds is the
 *        recogniser bailing out, and retrying that just burns CPU and flickers
 *        the UI. The caller decides.
 */
export function useVoice(
  onFinalTranscript: (text: string) => void,
  onSilence?: (turnMs: number) => void,
) {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceReplies, setVoiceReplies] = useState(false);
  const [micSupported, setMicSupported] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);
  /** Human-readable reason the mic isn't working, for the UI to show. */
  const [micError, setMicError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Keep the latest callbacks without re-creating the recognition instance.
  const onFinalRef = useRef(onFinalTranscript);
  const onSilenceRef = useRef(onSilence);
  useEffect(() => { onFinalRef.current = onFinalTranscript; onSilenceRef.current = onSilence; });
  /** Did the turn that's ending actually contain speech? */
  const heardSomething = useRef(false);
  /** Set by onerror; onend fires straight after and must not retry. */
  const turnError = useRef<string | null>(null);
  /** When the current listening turn started, to measure its length. */
  const turnStartedAt = useRef(0);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- feature detection needs the browser */
    setMicSupported(!!getRecognitionCtor());
    setTtsSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    /* eslint-enable react-hooks/set-state-in-effect */

    // Chrome populates getVoices() asynchronously; touching it here (and
    // listening once) means the first utterance already has the right voice.
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
      const warm = () => window.speechSynthesis.getVoices();
      window.speechSynthesis.addEventListener("voiceschanged", warm);
      return () => window.speechSynthesis.removeEventListener("voiceschanged", warm);
    }
  }, []);

  useEffect(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "en-IN";
    rec.continuous = false;
    rec.interimResults = false;

    rec.onresult = (e) => {
      let finalText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
      }
      const text = finalText.trim();
      if (text) { heardSomething.current = true; onFinalRef.current(text); }
    };
    rec.onend = () => {
      setListening(false);
      // onerror is always followed by onend. Retrying on an error is what made
      // a blocked microphone flicker: start → error → end → "silence" → start…
      // Only genuine silence hands the turn back to the caller.
      if (turnError.current) return;
      if (!heardSomething.current) onSilenceRef.current?.(Date.now() - turnStartedAt.current);
    };
    rec.onerror = (e) => {
      setListening(false);
      turnError.current = e.error || "unknown";
      // "no-speech" is the recogniser timing out, not a fault — treat it as
      // silence so a thinking pause doesn't look like a broken mic.
      if (e.error === "no-speech" || e.error === "aborted") {
        turnError.current = null;
        return;
      }
      // Chrome reports a bare "not-allowed" whatever the real cause — the site
      // permission, the Windows privacy setting, or another app holding the
      // device. Ask the mic directly to find out which, but only now that
      // recognition has already failed: a probe in front of start() would gate
      // the working path, which is worse than a vague message.
      if (e.error === "not-allowed") void diagnoseMic(setMicError);

      // Always name the raw code. These failures look identical to a user but
      // have unrelated causes, and a wrong-but-confident message sends people
      // to fix the wrong thing (a mic permission that was never the problem).
      const reason =
        e.error === "not-allowed"
          ? "Chrome refused the microphone. Checking why…"
          : e.error === "service-not-allowed"
            ? "Chrome's speech service refused the request. This is NOT your mic permission — the browser could not reach Google's speech servers, or this browser build has no speech support. Check your connection/VPN, and note that Brave and most Chromium forks disable it."
            : e.error === "audio-capture"
              ? "No microphone found. Check the input device is plugged in and selected."
              : e.error === "network"
                ? "Speech recognition needs an internet connection — the audio is transcribed on Google's servers, not on this device."
                : "Speech recognition failed.";
      setMicError(`${reason} (${e.error})`);
    };

    recognitionRef.current = rec;
    return () => { try { rec.abort(); } catch { /* already stopped */ } };
  }, []);

  const stopListening = useCallback(() => {
    try { recognitionRef.current?.stop(); } catch { /* already stopped */ }
    setListening(false);
  }, []);

  const startListening = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    // Never listen to our own voice.
    try { window.speechSynthesis?.cancel(); } catch { /* unsupported */ }
    setSpeaking(false);
    heardSomething.current = false;
    turnError.current = null;
    turnStartedAt.current = Date.now();
    setMicError(null);
    try { rec.start(); setListening(true); } catch { /* already running */ }
  }, []);

  const cancelSpeech = useCallback(() => {
    try { window.speechSynthesis?.cancel(); } catch { /* unsupported */ }
    setSpeaking(false);
  }, []);

  /**
   * Speak as a specific employee, in their own voice.
   * `onDone` fires when the utterance finishes — that's what lets a hands-free
   * conversation hand the turn back to the microphone.
   */
  const speak = useCallback((text: string, gender: Gender = "male", onDone?: () => void) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) { onDone?.(); return; }
    const body = toSpeakable(text);
    if (!body) { onDone?.(); return; }
    window.speechSynthesis.cancel();

    const u = new SpeechSynthesisUtterance(body);
    const voice = pickVoice(gender);
    if (voice) { u.voice = voice; u.lang = voice.lang; }
    else u.lang = "en-IN";

    // If the platform only ships one voice, pitch still distinguishes speakers.
    const gendered = voice && (gender === "female" ? FEMALE_VOICE : MALE_VOICE).test(voice.name);
    u.pitch = gendered ? 1 : gender === "female" ? 1.35 : 0.75;
    u.rate = 1.05;
    const finish = () => { setSpeaking(false); onDone?.(); };
    u.onend = finish;
    u.onerror = finish; // A failed utterance must not strand the conversation.
    setSpeaking(true);
    window.speechSynthesis.speak(u);
  }, []);

  // Don't leave the browser talking after navigating away.
  useEffect(() => () => { try { window.speechSynthesis?.cancel(); } catch { /* unsupported */ } }, []);

  return {
    micSupported, ttsSupported, micError,
    listening, startListening, stopListening,
    speaking, speak, cancelSpeech,
    voiceReplies, setVoiceReplies,
  };
}
