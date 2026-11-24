import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The Pro-only "Rewrite with AI" popover was replaced by per-bullet
 * attention icons that hand off to Scout. This is an anti-drift guard, not
 * a clean-up wish list: a future edit that reintroduces a second AI path
 * would give Free users two different paywalls and two ways to edit the
 * same bullet.
 */

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const SCORECARD_SOURCES = [
  'components/scorecard/dimension-bar.tsx',
  'components/scorecard/scorecard.tsx',
  'app/(dashboard)/dashboard/resumes/[id]/_components/scorecard-client.tsx'
];

const RETIRED_FILES = [
  'app/(dashboard)/dashboard/resumes/[id]/_components/enrich-bullet-action.ts',
  'lib/inline-issue/inline-issue-popover.tsx',
  'lib/inline-issue/prompts.ts',
  'lib/inline-issue/suppression-notice.ts',
  'scripts/probe-rewrite-target.ts',
  'tests/unit/inline-issue/enrich-bullet-action.test.ts',
  'tests/unit/inline-issue/prompts.test.ts',
  'tests/unit/inline-issue/popover-reason.test.tsx',
  'tests/unit/inline-issue/suppression-notice.test.ts'
];

describe('retired Pro rewrite surface', () => {
  it('no longer renders a rewrite CTA on any scorecard surface', () => {
    for (const path of SCORECARD_SOURCES) {
      const source = read(path);
      expect(source, path).not.toMatch(/Rewrite with AI/i);
      expect(source, path).not.toContain('showProRewriteCta');
      expect(source, path).not.toContain('enrichBulletAction');
    }
  });

  it('keeps only the Tip half of the inline-issue bridge', () => {
    const bridge = read('lib/inline-issue/apply-bridge.ts');
    expect(bridge).toContain('INLINE_ISSUE_TIP_EVENT');
    expect(bridge).toContain('dispatchInlineIssueTip');
    expect(bridge).toContain('subscribeToInlineIssueTip');
    expect(bridge).not.toContain('INLINE_ISSUE_APPLY_EVENT');
    expect(bridge).not.toContain('dispatchInlineIssueApply');
    expect(bridge).not.toContain('subscribeToInlineIssueApply');

    const barrel = read('lib/inline-issue/index.ts');
    expect(barrel).not.toContain('ApplyEvent');
    expect(barrel).not.toContain('dispatchInlineIssueApply');
  });

  it('removed the old action, popover, prompt and probe files', () => {
    for (const path of RETIRED_FILES) {
      expect(existsSync(resolve(process.cwd(), path)), path).toBe(false);
    }
  });

  it('does not advertise the retired rewrite analytics event or script', () => {
    expect(read('lib/posthog/events.ts')).not.toContain('BULLET_ENRICHED');
    expect(read('lib/posthog/events.ts')).not.toContain('bullet_enriched');
    expect(read('package.json')).not.toContain('probe:rewrite-target');
  });
});
