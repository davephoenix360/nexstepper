'use client';

/**
 * AI agent brand lab — /dev/design-lab/agent-brand
 *
 * The owner's review surface for the agent's mark: what it looks like
 * at every size it has to survive, what each of its seven states
 * MEANS, where it sits in the real UI, and how the states feel while
 * the agent works through a task.
 *
 * Unauthenticated, no PII, no editor state. The route layout
 * publishes `robots: noindex,nofollow` (see ../layout.tsx).
 *
 * Everything here is driven by the SAME component the product uses —
 * `components/brand/agent-mark.tsx` — so what is reviewed here is
 * what ships. A mockup that only exists in this file would be a
 * lie.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import { AgentMark } from '@/components/brand/agent-mark';
import {
  AGENT_DISPLAY_NAME,
  AGENT_MARK_MOTION,
  AGENT_MARK_STATE_SPECS,
  AGENT_MARK_STATES,
  type AgentMarkState
} from '@/lib/brand/agent-mark';

/* ------------------------------------------------------------------ */
/* Shared chrome                                                       */
/* ------------------------------------------------------------------ */

function Section({
  index,
  title,
  blurb,
  children
}: {
  index: string;
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-zinc-200 px-6 py-16 sm:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 max-w-2xl">
          <div className="mb-3 font-mono text-[11px] tracking-[0.2em] text-indigo-600 uppercase">
            {index}
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
            {title}
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-zinc-600">
            {blurb}
          </p>
        </div>
        {children}
      </div>
    </section>
  );
}

function Card({
  children,
  className = '',
  tone = 'light'
}: {
  children: React.ReactNode;
  className?: string;
  tone?: 'light' | 'dark' | 'indigo';
}) {
  const tones = {
    light: 'border-zinc-200 bg-white',
    dark: 'border-zinc-800 bg-zinc-950',
    indigo: 'border-indigo-600 bg-indigo-600'
  } as const;
  return (
    <div
      className={`rounded-2xl border p-6 shadow-sm ${tones[tone]} ${className}`}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 1. The mark                                                         */
/* ------------------------------------------------------------------ */

function HeroMark() {
  const [state, setState] = useState<AgentMarkState>('idle');
  const [showGeometry, setShowGeometry] = useState(false);
  const [cycling, setCycling] = useState(true);

  // A slow cycle through the states so the page is alive on arrival.
  useEffect(() => {
    if (!cycling) return;
    const order: AgentMarkState[] = [
      'idle',
      'reading',
      'verdict',
      'working',
      'applied',
      'needs-you',
      'blocked'
    ];
    let i = 0;
    const t = window.setInterval(() => {
      i = (i + 1) % order.length;
      setState(order[i]);
    }, 2600);
    return () => window.clearInterval(t);
  }, [cycling]);

  return (
    <div className="grid items-start gap-10 lg:grid-cols-[1fr_320px]">
      <Card className="relative overflow-hidden">
        <div className="flex min-h-[340px] items-center justify-center">
          <div className="relative">
            <AgentMark
              state={state}
              size={240}
              className="text-zinc-900"
              label={`Nexstepper AI agent mark — ${state}`}
            />
            {showGeometry && (
              <svg
                viewBox="0 0 1024 1024"
                className="pointer-events-none absolute inset-0 h-full w-full text-indigo-500"
                fill="none"
              >
                <rect
                  x="244"
                  y="244"
                  width="536"
                  height="536"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeDasharray="12 10"
                  opacity="0.5"
                />
                <circle
                  cx="512"
                  cy="512"
                  r="440"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeDasharray="18 14"
                  opacity="0.35"
                />
                <path
                  d="M 512 0 L 512 1024 M 0 512 L 1024 512"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeDasharray="8 8"
                  opacity="0.25"
                />
              </svg>
            )}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-5">
          <div className="font-mono text-[11px] text-zinc-500">
            <span className="text-zinc-900">{state}</span>
            <span className="mx-2 text-zinc-300">|</span>
            {AGENT_MARK_STATE_SPECS[state].meaning}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowGeometry((v) => !v)}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 font-mono text-[11px] text-zinc-600 transition-colors hover:bg-zinc-50"
            >
              {showGeometry ? 'hide geometry' : 'show geometry'}
            </button>
            <button
              type="button"
              onClick={() => setCycling((v) => !v)}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 font-mono text-[11px] text-zinc-600 transition-colors hover:bg-zinc-50"
            >
              {cycling ? 'pause' : 'play'}
            </button>
          </div>
        </div>
      </Card>

      <div className="space-y-4">
        <Card>
          <h3 className="text-sm font-semibold text-zinc-900">The mark</h3>
          <dl className="mt-4 space-y-3 text-[13px]">
            {[
              ['Concept', 'Two opposing corner brackets closing in on one solid dot.'],
              ['Reads as', 'A precise editorial annotation — and a point of view inside it.'],
              ['Construction', '2 monoline strokes, 72 units wide, 40-unit rounded corner.'],
              ['Accent', 'One solid circle, Ø 108 units, in the app’s indigo.'],
              ['Safe area', '24% margin; survives a 32px circular crop.'],
              ['Geometry', 'Generated from the brief’s Direction A, “The Bracket”.']
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[92px_1fr] gap-3">
                <dt className="font-mono text-[11px] text-zinc-400">{k}</dt>
                <dd className="text-zinc-700">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card tone="dark">
          <div className="flex items-center gap-3">
            <AgentMark state="idle" size={40} className="text-white" />
            <div>
              <div className="text-sm font-semibold text-white">
                {AGENT_DISPLAY_NAME}
              </div>
              <div className="font-mono text-[11px] text-zinc-500">
                name is a placeholder
              </div>
            </div>
          </div>
          <p className="mt-4 text-[13px] leading-relaxed text-zinc-400">
            The name is still the shortlist’s recommendation. The mark is
            already final — it does not depend on the name.
          </p>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Survival suite                                                   */
/* ------------------------------------------------------------------ */

const SURVIVAL_SIZES = [16, 20, 24, 32, 40, 56, 96];

/**
 * A row of marks at increasing sizes, on a grid rather than a wrap so
 * the largest one never drops onto its own line and leaves a hole.
 */
function SizeRow({
  sizes,
  tone = 'default',
  labelClass = 'text-zinc-400',
  markClass = 'text-zinc-900',
  shelfClass = 'h-24'
}: {
  sizes: readonly number[];
  tone?: 'default' | 'on-accent';
  labelClass?: string;
  markClass?: string;
  shelfClass?: string;
}) {
  return (
    <div
      className="grid gap-4 sm:grid-cols-7"
      style={{ gridTemplateColumns: `repeat(${sizes.length}, minmax(0, 1fr))` }}
    >
      {sizes.map((s) => (
        <div key={s} className="flex flex-col items-center gap-3">
          {/* A fixed-height shelf, so the marks sit on a common
              baseline and the row reads as a size ramp rather than
              a set of unrelated icons. */}
          <div className={`flex items-end justify-center ${shelfClass}`}>
            <AgentMark
              state="idle"
              size={s}
              tone={tone}
              className={markClass}
              label={`Agent mark at ${s} pixels`}
            />
          </div>
          <span className={`font-mono text-[11px] ${labelClass}`}>{s}px</span>
        </div>
      ))}
    </div>
  );
}

function SurvivalSuite() {
  return (
    <div className="space-y-6">
      <Card>
        <div className="mb-6 font-mono text-[11px] tracking-[0.15em] text-zinc-400 uppercase">
          On light
        </div>
        <SizeRow sizes={SURVIVAL_SIZES} />
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card tone="dark">
          <div className="mb-6 font-mono text-[11px] tracking-[0.15em] text-zinc-500 uppercase">
            On dark
          </div>
          <SizeRow
            sizes={SURVIVAL_SIZES}
            markClass="text-white"
            labelClass="text-zinc-600"
          />
        </Card>

        <Card tone="indigo">
          <div className="mb-6 font-mono text-[11px] tracking-[0.15em] text-indigo-200 uppercase">
            On accent
          </div>
          <SizeRow
            sizes={[16, 20, 24, 32, 40, 56]}
            tone="on-accent"
            labelClass="text-indigo-200"
            shelfClass="h-16"
          />
        </Card>
      </div>

      <Card>
        <div className="mb-6 font-mono text-[11px] tracking-[0.15em] text-zinc-400 uppercase">
          Circular crop — 32px
        </div>
        <div className="flex flex-wrap items-center gap-8">
          {[16, 20, 24, 32, 40].map((s) => (
            <div
              key={s}
              className="flex items-center justify-center rounded-full border border-zinc-200 bg-zinc-50"
              style={{ width: s + 16, height: s + 16 }}
            >
              <AgentMark state="idle" size={s} className="text-zinc-900" />
            </div>
          ))}
          <p className="max-w-sm text-[13px] leading-relaxed text-zinc-600">
            The mark is drawn inside a 24% margin, so a circular crop
            never clips a bracket. The dot is the only thing that
            touches the optical centre.
          </p>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 3. State gallery                                                    */
/* ------------------------------------------------------------------ */

function StateGallery() {
  const [state, setState] = useState<AgentMarkState>('idle');

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {AGENT_MARK_STATES.map((s) => {
          const spec = AGENT_MARK_STATE_SPECS[s];
          const active = state === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setState(s)}
              className={`group rounded-2xl border p-5 text-left transition-all duration-200 ${
                active
                  ? 'border-indigo-500 bg-indigo-50/60 shadow-sm'
                  : 'border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm'
              }`}
            >
              <div className="mb-4 flex h-16 items-center justify-center">
                <AgentMark
                  state={s}
                  size={56}
                  className={active ? 'text-zinc-900' : 'text-zinc-400'}
                />
              </div>
              <div className="flex items-center justify-between">
                <span
                  className={`font-mono text-[12px] tracking-wide ${
                    active ? 'text-indigo-700' : 'text-zinc-900'
                  }`}
                >
                  {spec.label}
                </span>
                {spec.transient && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 font-mono text-[10px] text-amber-700">
                    moment
                  </span>
                )}
              </div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-zinc-600">
                {spec.meaning}
              </p>
            </button>
          );
        })}
      </div>

      <Card>
        <div className="grid gap-8 md:grid-cols-[auto_1fr]">
          <div className="flex h-28 w-28 items-center justify-center rounded-2xl bg-zinc-50">
            <AgentMark state={state} size={72} className="text-zinc-900" />
          </div>
          <dl className="space-y-4 text-[13px]">
            {[
              ['State', AGENT_MARK_STATE_SPECS[state].label],
              ['Means', AGENT_MARK_STATE_SPECS[state].meaning],
              ['Triggered by', AGENT_MARK_STATE_SPECS[state].cause],
              [
                'Persistence',
                AGENT_MARK_STATE_SPECS[state].transient
                  ? 'A moment — it fires and returns to idle on its own.'
                  : 'A mode — it holds until the agent moves on.'
              ]
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[120px_1fr] gap-4">
                <dt className="font-mono text-[11px] text-zinc-400">{k}</dt>
                <dd className="text-zinc-700">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 4. Placements                                                       */
/* ------------------------------------------------------------------ */

function Placements() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* The floating trigger */}
      <Card>
        <div className="mb-5 font-mono text-[11px] tracking-[0.15em] text-zinc-400 uppercase">
          Floating trigger — 56px
        </div>
        <div className="relative flex h-52 items-end justify-end rounded-xl bg-zinc-50 p-6">
          <div className="flex items-end gap-3">
            <div className="rounded-full border border-zinc-200 bg-white/95 px-4 py-2.5 text-sm font-medium text-zinc-700 shadow-lg backdrop-blur">
              Feedback
            </div>
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg">
              <AgentMark state="idle" size={30} tone="on-accent" />
            </div>
          </div>
        </div>
        <p className="mt-4 text-[13px] leading-relaxed text-zinc-600">
          The trigger is the one place the mark sits on colour, so it
          takes the white <span className="font-mono">on-accent</span>{' '}
          tone — brackets and dot both white, because an indigo dot on
          an indigo button would simply vanish. The geometry is
          identical; only the colour changes.
        </p>
      </Card>

      {/* Chat header + message avatar */}
      <Card>
        <div className="mb-5 font-mono text-[11px] tracking-[0.15em] text-zinc-400 uppercase">
          In the conversation
        </div>
        <div className="overflow-hidden rounded-xl border border-zinc-200">
          <div className="flex items-center gap-2.5 border-b border-zinc-100 bg-zinc-50 px-4 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-sm">
              <AgentMark state="idle" size={20} className="text-zinc-900" />
            </div>
            <div>
              <div className="text-sm font-semibold text-zinc-900">
                {AGENT_DISPLAY_NAME}
              </div>
              <div className="text-[11px] text-zinc-500">
                reading your resume
              </div>
            </div>
            <div className="ml-auto">
              <AgentMark state="reading" size={18} className="text-zinc-400" />
            </div>
          </div>
          <div className="space-y-4 p-4">
            <div className="flex gap-3">
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-100">
                <AgentMark state="idle" size={16} className="text-zinc-700" />
              </div>
              <div className="rounded-2xl rounded-tl-sm bg-zinc-100 px-4 py-2.5 text-[13px] leading-relaxed text-zinc-800">
                Your Dayforce role is doing all the work. The posting
                asks for Node; your stack is Python.
              </div>
            </div>
            <div className="flex gap-3">
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-100">
                <AgentMark state="working" size={16} className="text-zinc-700" />
              </div>
              <div className="rounded-2xl rounded-tl-sm bg-zinc-100 px-4 py-2.5 text-[13px] leading-relaxed text-zinc-800">
                Moving Dayforce to the top and cutting the summary to
                two lines.
              </div>
            </div>
          </div>
        </div>
        <p className="mt-4 text-[13px] leading-relaxed text-zinc-600">
          The message avatar is the smallest place the mark appears
          (16px). At that size the brackets carry the identity and the
          dot carries the state — which is exactly the right division
          of labour. The header name is a placeholder; the shortlist
          is in the brand brief.
        </p>
      </Card>

      {/* Empty state */}
      <Card>
        <div className="mb-5 font-mono text-[11px] tracking-[0.15em] text-zinc-400 uppercase">
          Empty state
        </div>
        <div className="flex h-52 flex-col items-center justify-center gap-4 rounded-xl bg-zinc-50">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50">
            <AgentMark state="idle" size={44} className="text-gray-900" />
          </div>
          <div className="text-center">
            <div className="text-sm font-medium text-zinc-900">
              Ask about your resume
            </div>
            <div className="mt-1 text-[13px] text-zinc-500">
              It has already read this resume and the job description.
            </div>
          </div>
        </div>
        <p className="mt-4 text-[13px] leading-relaxed text-zinc-600">
          The empty state is the one place a mark can be large enough
          to feel like a character. At 64px the brackets read as a
          frame, and the dot as an eye.
        </p>
      </Card>

      {/* Typing indicator */}
      <Card>
        <div className="mb-5 font-mono text-[11px] tracking-[0.15em] text-zinc-400 uppercase">
          Working indicator
        </div>
        <div className="space-y-3 rounded-xl bg-zinc-50 p-6">
          {(['reading', 'working', 'verdict'] as AgentMarkState[]).map((s) => (
            <div key={s} className="flex items-center gap-3">
              <AgentMark state={s} size={22} className="text-zinc-800" />
              <div className="h-2 w-40 rounded-full bg-zinc-200" />
            </div>
          ))}
        </div>
        <p className="mt-4 text-[13px] leading-relaxed text-zinc-600">
          One mark, three meanings, no text. The radar ring during{' '}
          <span className="font-mono">working</span> is the tell that
          something is actually being measured.
        </p>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 5. The task script — personality in motion                          */
/* ------------------------------------------------------------------ */

interface ScriptStep {
  state: AgentMarkState;
  from: 'agent' | 'user';
  text: string;
  /** What the mark is doing, in the designer's words. */
  cue: string;
  /** ms this step holds before the next one. */
  hold: number;
}

const SCRIPT: ScriptStep[] = [
  {
    state: 'reading',
    from: 'agent',
    text: 'Reading the CleerDental posting against your Dayforce role.',
    cue: 'Reading — the brackets scan across the page.',
    hold: 2600
  },
  {
    state: 'verdict',
    from: 'agent',
    text: 'Three things worth fixing before you send this.',
    cue: 'Verdict — the brackets close in and the dot goes amber. A moment, not a mode.',
    hold: 2200
  },
  {
    state: 'working',
    from: 'agent',
    text: 'Moving Dayforce to the top, cutting the summary to two lines.',
    cue: 'Working — a radar ring pulses out of the dot while the edit is in flight.',
    hold: 2800
  },
  {
    state: 'applied',
    from: 'agent',
    text: 'Done. ATS score moved 51 → 57.',
    cue: 'Applied — the dot becomes a check.',
    hold: 2400
  },
  {
    state: 'needs-you',
    from: 'agent',
    text: 'Your Dayforce role has no start date. What was it?',
    cue: 'Needs you — the dot slides out toward the bracket that marks the question.',
    hold: 3000
  },
  {
    state: 'blocked',
    from: 'agent',
    text: 'Two roles are called Platform Engineer. I did not want to guess which one you meant.',
    cue: 'Blocked — the brackets pull apart and the dot goes grey. It will not guess.',
    hold: 3000
  },
  {
    state: 'idle',
    from: 'user',
    text: 'April 2024.',
    cue: 'Idle — the dot breathes. Waiting.',
    hold: 2800
  }
];

function TaskScript() {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) return;
    timer.current = window.setTimeout(() => {
      setI((v) => (v + 1) % SCRIPT.length);
    }, SCRIPT[i].hold);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [i, playing]);

  const step = SCRIPT[i];
  const isAgent = step.from === 'agent';

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_300px]">
      <Card>
        <div className="mb-5 flex items-center justify-between">
          <div className="font-mono text-[11px] tracking-[0.15em] text-zinc-400 uppercase">
            A run
          </div>
          <button
            type="button"
            onClick={() => setPlaying((v) => !v)}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 font-mono text-[11px] text-zinc-600 transition-colors hover:bg-zinc-50"
          >
            {playing ? 'pause' : 'play'}
          </button>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white">
          <div className="flex items-center gap-2.5 border-b border-zinc-100 bg-zinc-50 px-4 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-sm">
              <AgentMark
                state={step.state}
                size={20}
                className="text-zinc-900"
              />
            </div>
            <div>
              <div className="text-sm font-semibold text-zinc-900">
                {AGENT_DISPLAY_NAME}
              </div>
              <div className="font-mono text-[11px] text-zinc-500">
                {step.state}
              </div>
            </div>
          </div>

          <div className="min-h-[180px] space-y-4 p-5">
            <div className="flex gap-3">
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-100">
                <AgentMark
                  state={step.state}
                  size={16}
                  className="text-zinc-700"
                />
              </div>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed ${
                  isAgent
                    ? 'rounded-tl-sm bg-zinc-100 text-zinc-800'
                    : 'ml-auto rounded-tr-sm bg-indigo-600 text-white'
                }`}
              >
                {step.text}
              </div>
            </div>
          </div>
        </div>

        <p className="mt-4 text-[13px] leading-relaxed text-zinc-600">
          {step.cue}
        </p>
      </Card>

      <div className="space-y-2">
        {SCRIPT.map((s, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => setI(idx)}
            className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all duration-200 ${
              idx === i
                ? 'border-indigo-500 bg-indigo-50/60'
                : 'border-zinc-200 bg-white hover:border-zinc-300'
            }`}
          >
            <AgentMark
              state={s.state}
              size={20}
              className={idx === i ? 'text-zinc-900' : 'text-zinc-400'}
            />
            <div className="min-w-0 flex-1">
              <div
                className={`truncate text-[12.5px] ${
                  idx === i ? 'text-zinc-900' : 'text-zinc-600'
                }`}
              >
                {s.text}
              </div>
              <div className="font-mono text-[10px] text-zinc-400">
                {s.state}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 5. The filmstrip — one cycle, sampled                                */
/* ------------------------------------------------------------------ */

/**
 * Six copies of the same mark, each a fraction of a cycle apart.
 *
 * The mark's animations are infinite, so a negative animation-delay
 * freezes one at a chosen point in its cycle. Six of them side by
 * side is a filmstrip: the motion, in a still image.
 */
function Filmstrip({
  state,
  cycleMs,
  frames = 6,
  size = 64
}: {
  state: AgentMarkState;
  cycleMs: number;
  frames?: number;
  size?: number;
}) {
  return (
    <div className="flex items-end gap-4">
      {Array.from({ length: frames }, (_, i) => (
        <div key={i} className="flex flex-col items-center gap-2">
          <AgentMark
            state={state}
            size={size}
            delayMs={-Math.round((cycleMs / frames) * i)}
            className="text-zinc-900"
          />
          <span className="font-mono text-[10px] text-zinc-400">
            {String(Math.round((cycleMs / frames) * i)).padStart(4, '0')}ms
          </span>
        </div>
      ))}
    </div>
  );
}

function Filmstrips() {
  return (
    <div className="space-y-6">
      <Card>
        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
          <div className="font-mono text-[11px] tracking-[0.15em] text-zinc-400 uppercase">
            Working — radar ring, 1700ms
          </div>
          <div className="text-[13px] text-zinc-500">
            The agent is measuring, so the mark measures.
          </div>
        </div>
        <Filmstrip state="working" cycleMs={1700} />
      </Card>

      <Card>
        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
          <div className="font-mono text-[11px] tracking-[0.15em] text-zinc-400 uppercase">
            Reading — the scan, 2600ms
          </div>
          <div className="text-[13px] text-zinc-500">
            Both brackets move together, so it reads as one gaze moving
            across a line.
          </div>
        </div>
        <Filmstrip state="reading" cycleMs={2600} />
      </Card>

      <Card>
        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
          <div className="font-mono text-[11px] tracking-[0.15em] text-zinc-400 uppercase">
            Idle — the breath, 4200ms
          </div>
          <div className="text-[13px] text-zinc-500">
            Barely perceptible. That is the point — it is the difference
            between alive and frozen.
          </div>
        </div>
        <Filmstrip state="idle" cycleMs={4200} />
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 6. Motion spec                                                      */
/* ------------------------------------------------------------------ */

function MotionSpec() {
  const rows = useMemo(
    () => [
      ['State transition', `${AGENT_MARK_MOTION.transitionMs}ms`, 'cubic-bezier(0.32, 0.72, 0, 1)', 'Transform + fill. Interrupted changes retarget instead of snapping.'],
      ['One-shot flourish', `${AGENT_MARK_MOTION.flourishMs}ms`, 'cubic-bezier(0.32, 0.72, 0, 1)', 'The check draw and the verdict ping.'],
      ['Idle breath', `${AGENT_MARK_MOTION.idlePulseMs}ms`, 'cubic-bezier(0.45, 0, 0.55, 1)', 'A halo behind the dot, 10% → 26% opacity.'],
      ['Reading scan', `${AGENT_MARK_MOTION.scanMs}ms`, 'cubic-bezier(0.45, 0, 0.55, 1)', 'Both brackets together, so it reads as one gaze moving.'],
      ['Working radar', `${AGENT_MARK_MOTION.radarMs}ms`, 'cubic-bezier(0.2, 0.6, 0.35, 1)', 'A ring pulses out of the dot. The agent is measuring, so the mark measures.'],
      ['Reduced motion', 'instant', '—', 'Every state stays legible from colour and position; only movement goes.']
    ],
    []
  );

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr className="border-b border-zinc-200">
              {['Motion', 'Duration', 'Easing', 'What it does'].map((h) => (
                <th
                  key={h}
                  className="pb-3 font-mono text-[11px] tracking-[0.12em] text-zinc-400 uppercase"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r[0]} className="border-b border-zinc-100 last:border-0">
                <td className="py-3 pr-6 text-[13px] font-medium text-zinc-900">
                  {r[0]}
                </td>
                <td className="py-3 pr-6 font-mono text-[12px] text-zinc-600">
                  {r[1]}
                </td>
                <td className="py-3 pr-6 font-mono text-[11px] text-zinc-500">
                  {r[2]}
                </td>
                <td className="py-3 text-[13px] text-zinc-600">{r[3]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-6 text-[13px] leading-relaxed text-zinc-600">
        Only <span className="font-mono">transform</span> and{' '}
        <span className="font-mono">opacity</span> animate, on elements
        with <span className="font-mono">will-change: transform</span>.
        Nothing in the motion layer triggers layout or paint.
      </p>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function AgentBrandClient() {
  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <header className="px-6 py-16 sm:px-10">
        <div className="mx-auto max-w-6xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
            <span className="font-mono text-[11px] tracking-[0.15em] text-zinc-500 uppercase">
              Agent brand lab
            </span>
          </div>
          <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
            The mark, the states, and the moment it has to feel alive.
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-zinc-600">
            The Nexstepper agent mark: two opposing corner brackets
            closing in on one solid dot. An editorial annotation with a
            point of view inside it. Everything on this page is
            rendered by the same component the product uses, so what is
            reviewed here is what ships.
          </p>
        </div>
      </header>

      <Section
        index="01 — The mark"
        title="One symbol, one idea"
        blurb="The brackets say ‘precisely here’. The dot says ‘and here is what I think’. It has to survive a 16px favicon, a 32px circle, and a white-on-indigo button — with the same file."
      >
        <HeroMark />
      </Section>

      <Section
        index="02 — Survival"
        title="Every size it has to survive"
        blurb="The mark is used at five sizes and on three backgrounds, so it is tested at all of them. Monoline strokes and a single flat colour are what make that possible."
      >
        <SurvivalSuite />
      </Section>

      <Section
        index="03 — States"
        title="Seven states, seven real moments"
        blurb="A static avatar next to a ‘Thinking…’ line is the opposite of premium, and it is also useless — you cannot tell ‘reading your resume’ from ‘about to ask you a question’. So the mark has a vocabulary, and the chat UI drives it."
      >
        <StateGallery />
      </Section>

      <Section
        index="04 — Placements"
        title="Where it lives"
        blurb="The same asset, four contexts. The tone changes; the geometry never does."
      >
        <Placements />
      </Section>

      <Section
        index="05 — In motion"
        title="What it feels like while the agent works"
        blurb="The states are not decoration — they are the agent telling you what it is doing before it says anything. Play the run, or step through it."
      >
        <TaskScript />
      </Section>

      <Section
        index="06 — The motion, sampled"
        title="One cycle, six frames"
        blurb="The animations are infinite, so a negative delay freezes each copy at a chosen point. Six copies side by side is a filmstrip — the motion, in a still image."
      >
        <Filmstrips />
      </Section>

      <Section
        index="07 — Motion spec"
        title="The numbers"
        blurb="Two curves, one duration for state changes, one for flourishes. Small glyphs need slow transitions — a fast one reads as a glitch."
      >
        <MotionSpec />
      </Section>

      <footer className="border-t border-zinc-200 px-6 py-10 sm:px-10">
        <div className="mx-auto max-w-6xl">
          <p className="font-mono text-[11px] text-zinc-400">
            Source SVGs in public/brand/agent/ · motion layer in
            app/agent-mark.css · component in components/brand/agent-mark.tsx
            · states in lib/brand/agent-mark.ts
          </p>
        </div>
      </footer>
    </div>
  );
}
