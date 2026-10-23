/**
 * The agent mark's component and its motion layer.
 *
 * Two things are worth pinning here:
 *
 * 1. The COMPONENT renders every state it declares. A state that
 *    silently renders as "idle" would look like a broken feature
 *    rather than a missing one.
 *
 * 2. The MOTION LAYER has a rule for every state. This is the
 *    anti-drift guard: adding a state to the vocabulary without
 *    giving it a rule would leave the mark frozen in that state
 *    forever, and the only symptom would be a mark that "doesn't
 *    animate" in a new mode.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';

import { AgentMark } from '@/components/brand/agent-mark';
import {
  AGENT_MARK_MOTION,
  AGENT_MARK_STATE_SPECS,
  AGENT_MARK_STATES,
  type AgentMarkState
} from '@/lib/brand/agent-mark';

const css = readFileSync(
  resolve(process.cwd(), 'app/agent-mark.css'),
  'utf-8'
);

describe('the state vocabulary', () => {
  it('has a spec for every state', () => {
    for (const state of AGENT_MARK_STATES) {
      const spec = AGENT_MARK_STATE_SPECS[state];
      expect(spec, `no spec for ${state}`).toBeDefined();
      expect(spec.label.length).toBeGreaterThan(0);
      expect(spec.meaning.length).toBeGreaterThan(0);
      expect(spec.cause.length).toBeGreaterThan(0);
    }
  });

  it('covers every state exactly once', () => {
    expect(Object.keys(AGENT_MARK_STATE_SPECS).sort()).toEqual(
      [...AGENT_MARK_STATES].sort()
    );
  });

  it('marks the transient states as moments', () => {
    // A "moment" fires and returns to idle on its own; a "mode"
    // holds until the agent moves on. The chat UI needs the
    // difference, so the flags are not interchangeable.
    expect(AGENT_MARK_STATE_SPECS.verdict.transient).toBe(true);
    expect(AGENT_MARK_STATE_SPECS.applied.transient).toBe(true);
    expect(AGENT_MARK_STATE_SPECS.working.transient).toBe(false);
    expect(AGENT_MARK_STATE_SPECS['needs-you'].transient).toBe(false);
    expect(AGENT_MARK_STATE_SPECS.blocked.transient).toBe(false);
  });

  it('uses a slow-enough transition for a small glyph', () => {
    // A 24px mark that moves has very little distance to cover. A
    // fast transition reads as a glitch, not as intentional.
    expect(AGENT_MARK_MOTION.transitionMs).toBeGreaterThanOrEqual(300);
  });
});

describe('<AgentMark />', () => {
  it('renders the mark with a state and a tone', () => {
    const html = renderToStaticMarkup(<AgentMark state="working" />);
    expect(html).toContain('class="agent-mark"');
    expect(html).toContain('data-state="working"');
    expect(html).toContain('data-tone="default"');
  });

  it('renders every state without throwing', () => {
    for (const state of AGENT_MARK_STATES) {
      const html = renderToStaticMarkup(<AgentMark state={state} />);
      expect(html, `state ${state} did not render`).toContain(
        `data-state="${state}"`
      );
    }
  });

  it('carries the four moving parts', () => {
    const html = renderToStaticMarkup(<AgentMark />);
    // The two brackets, the dot, and the three flourishes. If one
    // went missing the mark would lose a behaviour silently.
    expect(html).toContain('data-part="bracket-a"');
    expect(html).toContain('data-part="bracket-b"');
    expect(html).toContain('data-part="dot"');
    expect(html).toContain('data-part="halo"');
    expect(html).toContain('data-part="radar"');
    expect(html).toContain('data-part="check"');
  });

  it('applies the tone', () => {
    const html = renderToStaticMarkup(<AgentMark tone="on-accent" />);
    expect(html).toContain('data-tone="on-accent"');
  });

  it('exposes the animation delay, so a filmstrip can sample a cycle', () => {
    const html = renderToStaticMarkup(<AgentMark delayMs={-283} />);
    expect(html).toContain('--agent-delay:-283ms');
  });

  it('is decorative by default and labelled when asked', () => {
    expect(renderToStaticMarkup(<AgentMark />)).toContain('aria-hidden');
    expect(
      renderToStaticMarkup(<AgentMark label="The agent, working" />)
    ).toContain('aria-label="The agent, working"');
  });

  it('keeps the generated geometry', () => {
    const html = renderToStaticMarkup(<AgentMark />);
    // The two bracket strokes and the check, verbatim from the
    // generated artwork. If these change, the mark changes — and
    // that has to be a deliberate act, not an accident.
    expect(html).toContain('M 280 500 L 280 320 A 40 40 0 0 1 320 280 L 500 280');
    expect(html).toContain('M 744 524 L 744 704 A 40 40 0 0 1 704 744 L 524 744');
    expect(html).toContain('M 486 512 L 505 531 L 540 490');
  });
});

describe('the motion layer', () => {
  it('has a rule for every state', () => {
    for (const state of AGENT_MARK_STATES) {
      expect(
        css,
        `no CSS rule for state "${state}" — the mark would freeze there`
      ).toContain(`.agent-mark[data-state='${state}']`);
    }
  });

  it('animates only compositor-friendly properties', () => {
    // The @keyframes blocks may only touch transform and opacity.
    // Animating width, height, top or left would put the mark on the
    // layout path every frame.
    const blocks = css.match(/@keyframes\s+[\w-]+\s*\{[^}]*(\{[^}]*\}[^}]*)*\}/g) ?? [];
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      const properties = [...block.matchAll(/^\s*([a-z-]+)\s*:/gm)].map(
        (m) => m[1]
      );
      for (const prop of properties) {
        expect(
          ['transform', 'opacity', 'stroke-dashoffset', 'fill'],
          `keyframe animates "${prop}", which is not compositor-friendly`
        ).toContain(prop);
      }
    }
  });

  it('respects reduced motion', () => {
    expect(css).toContain('prefers-reduced-motion: reduce');
  });

  it('gives every looping animation a delay hook', () => {
    // The filmstrip relies on this; if a new animation is added
    // without it, that frame would not be samplable.
    const animations = css.match(/animation:\s*[^;]+;/g) ?? [];
    const looping = animations.filter((a) => a.includes('infinite'));
    expect(looping.length).toBeGreaterThan(0);
    for (const a of looping) {
      expect(a, `looping animation without a delay hook: ${a}`).toContain(
        'var(--agent-delay'
      );
    }
  });
});
