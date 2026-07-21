"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Send, Loader2, User, Mic, MicOff, Volume2, VolumeX, Square, Headphones } from "lucide-react";
import { useVoice } from "@/hooks/use-voice";
import { NeuralOrb, DEPT_HUE, type OrbState } from "@/components/agent/neural-orb";

interface Msg { role: "user" | "assistant"; content: string }

/** Cortex the Delivery Manager speaks with its own voice. */
const MANAGER_GENDER = "male" as const;

/**
 * Silent listening turns before the conversation ends itself. One isn't enough
 * — people pause to think mid-sentence and the recogniser returns empty.
 */
const SILENT_TURNS_BEFORE_EXIT = 2;

/** Below this, a "silent" turn is the recogniser failing, not a human pause. */
const MIN_REAL_TURN_MS = 900;
/** How many instant bails before we stop pretending to listen and say so. */
const MAX_FAST_BAILS = 3;
/** Never restart recognition faster than this — instant retries flicker the UI. */
const RETRY_BACKOFF_MS = 700;

/** Spoken the instant you finish talking, so you know you were heard. */
const ACKS = [
  "Got it. Let me check.",
  "On it.",
  "Sure — one moment.",
  "Right, checking that now.",
];

function getToken(): string {
  return typeof window !== "undefined" ? localStorage.getItem("token") || "" : "";
}

const SUGGESTIONS = [
  "How many leads do I have, and what's the breakdown?",
  "Task the growth team to find 8 new partner firms",
  "What has the team been working on?",
  "Have growth draft outreach for Carmatec",
];

export default function AssistantPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  // Voice needs to call send(), and send() needs to speak() the reply — a ref
  // breaks the cycle without re-creating the recognition instance every render.
  const sendRef = useRef<(text: string) => void>(() => {});
  const endConversationRef = useRef<() => void>(() => {});
  /** Consecutive listening turns where nothing was said. */
  const silentTurns = useRef(0);
  /** Consecutive turns that died too fast to be a real pause. */
  const fastBails = useRef(0);

  const voice = useVoice(
    (text) => { silentTurns.current = 0; fastBails.current = 0; sendRef.current(text); },
    (turnMs) => {
      if (!conversingRef.current) return;

      // A turn that dies in milliseconds is not a person being quiet — the
      // recogniser gave up (no audio reaching it, speech service unreachable).
      // Retrying instantly is what flickered the button. Back off, and after a
      // couple of bails say so instead of pretending to listen.
      if (turnMs < MIN_REAL_TURN_MS) {
        fastBails.current += 1;
        if (fastBails.current >= MAX_FAST_BAILS) {
          endConversationRef.current();
          setError("The microphone isn't returning any audio. Check that the right input device is selected and unmuted, then try again.");
          return;
        }
        window.setTimeout(() => { if (conversingRef.current) voiceRef.current?.startListening(); }, RETRY_BACKOFF_MS);
        return;
      }

      // A real pause: give one more chance, then bow out rather than leaving
      // the mic open forever waiting for a click.
      fastBails.current = 0;
      silentTurns.current += 1;
      if (silentTurns.current >= SILENT_TURNS_BEFORE_EXIT) endConversationRef.current();
      else voiceRef.current?.startListening();
    },
  );
  const voiceRef = useRef<typeof voice | null>(null);
  const voiceRepliesRef = useRef(false);

  // Hands-free mode: you speak, Cortex acknowledges, answers aloud, then hands
  // the turn straight back to the mic — a real conversation, not one-shot
  // dictation. Held in a ref so the async reply handler sees the live value.
  const [conversing, setConversing] = useState(false);
  const conversingRef = useRef(false);

  useEffect(() => {
    if (!getToken()) router.replace("/");
  }, [router]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);

  const send = useCallback(async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setError("");
    const next: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setInput("");
    setBusy(true);

    // Acknowledge out loud straight away, so a hands-free user knows they were
    // heard instead of sitting in silence while a delegation runs for 10s.
    if (conversingRef.current) voice.speak(ACKS[Math.floor(Math.random() * ACKS.length)], MANAGER_GENDER);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ messages: next }),
      });
      if (res.status === 401) { router.replace("/"); return; }
      const data = await res.json();
      if (res.ok && data.reply) {
        setMessages(m => [...m, { role: "assistant", content: data.reply }]);
        // Speak the answer; in hands-free mode, listen again the moment it ends.
        if (voiceRepliesRef.current || conversingRef.current) {
          voice.speak(data.reply, MANAGER_GENDER, () => {
            if (conversingRef.current) voice.startListening();
          });
        }
      } else {
        setError(data.error || "The assistant couldn't respond.");
        // Don't strand a hands-free user in silence after a failure.
        if (conversingRef.current) voice.startListening();
      }
    } catch {
      setError("Network error — is the app reachable?");
      if (conversingRef.current) voice.startListening();
    } finally {
      setBusy(false);
    }
  }, [messages, busy, router, voice]);

  /*
   * These refs are captured by the callbacks handed to useVoice, so the React
   * Compiler freezes them and flags every write — including the ones inside
   * useEffect, which React documents as legal. This is the standard
   * "latest value in a ref" escape hatch: speech callbacks fire long after
   * render, and must see the live conversation state rather than the value
   * closed over when recognition started. Writes are confined to an effect and
   * to event handlers; nothing is mutated during render.
   */
  /* eslint-disable react-hooks/immutability */
  const endConversation = useCallback(() => {
    setConversing(false);
    conversingRef.current = false;
    silentTurns.current = 0;
    voice.stopListening();
  }, [voice]);

  useEffect(() => {
    sendRef.current = send;
    voiceRef.current = voice;
    endConversationRef.current = endConversation;
    voiceRepliesRef.current = voice.voiceReplies;
    conversingRef.current = conversing;
  });

  // A mic that can't run must not leave the conversation "on" — that was the
  // flicker: it kept retrying a microphone the browser had already refused.
  useEffect(() => {
    if (voice.micError && conversingRef.current) endConversation();
  }, [voice.micError, endConversation]);

  function toggleConversation() {
    if (conversing) { endConversation(); voice.cancelSpeech(); return; }
    setConversing(true);
    // Set eagerly, not via the effect: stopListening()/onend can fire before
    // React re-renders, and the silence handler must already see the new value.
    conversingRef.current = true;
    silentTurns.current = 0;
    voice.setVoiceReplies(true); // A conversation that can't talk back isn't one.
    voice.startListening();
  }
  /* eslint-enable react-hooks/immutability */

  // What Cortex is doing right now, in its own words.
  const deskState: OrbState =
    voice.speaking ? "speaking" : busy ? "working" : voice.listening ? "working" : conversing ? "active" : "idle";
  const deskStatus =
    voice.listening ? "Listening…"
    : busy ? "Working on it…"
    : voice.speaking ? "Speaking"
    : conversing ? "Ready — just talk"
    : "Standing by";

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col">
      {/* The agent, not a chat header — Cortex is present and shows its state. */}
      <div className="mb-4 flex shrink-0 items-center gap-4 rounded-2xl border border-border bg-card p-4">
        <div className="relative shrink-0">
          <NeuralOrb hue={DEPT_HUE.manager} size={72} state={deskState} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground">Cortex</h2>
            <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-medium text-foreground">
              Delivery Manager
            </span>
            <span className={`flex items-center gap-1.5 text-[11px] font-medium ${
              deskState === "idle" ? "text-muted-foreground" : "text-emerald-500"
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${
                deskState === "idle" ? "bg-muted-foreground/50" : "animate-pulse bg-emerald-500"
              }`} />
              {deskStatus}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Runs 7 departments and 27 agents. Ask for anything — it tasks the right team and reports back.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {voice.micSupported && voice.ttsSupported && (
            <button
              onClick={toggleConversation}
              title={conversing ? "End the hands-free conversation" : "Talk to Cortex hands-free — it listens, answers aloud, then listens again"}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                conversing
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <Headphones className="h-4 w-4" />
              {conversing ? "End conversation" : "Talk to Cortex"}
            </button>
          )}

          {voice.ttsSupported && (
            <button
              onClick={() => {
                const next = !voice.voiceReplies;
                voice.setVoiceReplies(next);
                if (!next) voice.cancelSpeech();
              }}
              title={voice.voiceReplies ? "Cortex speaks its replies" : "Replies are silent"}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                voice.voiceReplies
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {voice.voiceReplies ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              Voice {voice.voiceReplies ? "on" : "off"}
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto rounded-xl border border-border bg-card p-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <NeuralOrb hue={DEPT_HUE.manager} size={132} state={deskState} />
            <p className="mt-4 text-sm font-medium text-foreground">
              {conversing ? "I'm listening — just talk." : "Cortex is at your desk"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {conversing ? "The conversation ends itself when you stop." : "Ask, or press Talk to Cortex and speak."}
            </p>
            <div className="mt-5 grid w-full max-w-md gap-2">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-lg border border-border px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-muted"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
              {m.role === "assistant" && (
                <div className="mt-0.5 shrink-0">
                  <NeuralOrb hue={DEPT_HUE.manager} size={28} state={i === messages.length - 1 && voice.speaking ? "speaking" : "active"} seed={i} />
                </div>
              )}
              <div className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${m.role === "user" ? "bg-foreground text-background" : "bg-muted text-foreground"}`}>
                {m.content}
              </div>
              {m.role === "user" && (
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
                  <User className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
            </div>
          ))
        )}
        {busy && (
          <div className="flex items-center gap-3">
            <div className="mt-0.5 shrink-0">
              <NeuralOrb hue={DEPT_HUE.manager} size={28} state="working" />
            </div>
            <div className="rounded-2xl bg-muted px-4 py-2.5 text-xs text-muted-foreground">
              Tasking the team…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {(error || voice.micError) && (
        <p className="mt-2 shrink-0 text-xs text-red-500">{error || voice.micError}</p>
      )}

      {/* Input */}
      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="mt-3 flex shrink-0 items-center gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={voice.listening ? "Listening…" : "Ask Cortex anything about your business…"}
          disabled={busy}
          className="flex-1 rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
        />

        {voice.speaking && (
          <button
            type="button"
            onClick={voice.cancelSpeech}
            title="Stop speaking"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:text-foreground"
          >
            <Square className="h-4 w-4 fill-current" />
          </button>
        )}

        {voice.micSupported && (
          <button
            type="button"
            onClick={() => (voice.listening ? voice.stopListening() : voice.startListening())}
            disabled={busy}
            title={voice.listening ? "Stop listening" : "Speak to Cortex"}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors disabled:opacity-40 ${
              voice.listening
                ? "animate-pulse border-red-500/40 bg-red-500/10 text-red-500"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {voice.listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>
        )}

        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="flex h-11 w-11 items-center justify-center rounded-xl bg-foreground text-background transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        </button>
      </form>
    </div>
  );
}
