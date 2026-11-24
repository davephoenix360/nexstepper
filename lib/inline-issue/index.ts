/**
 * Public surface for the inline-issue module.
 *
 * Everything the scorecard + the editor imports from `lib/inline-issue/`
 * comes through here. Keep the imports narrow — if a new component is
 * added, export it explicitly so the file's public contract stays
 * grep-able.
 *
 * The Pro-only rewrite popover and its action have been retired; AI
 * bullet edits now go through Scout (`components/chat/chat-bubble.tsx`)
 * and the normal `editResume` tool result path. What remains here is
 * the universal explanation surface: criterion → leaf mapping, the
 * dynamic tip renderer, the section pulse bridge, and the match
 * breakdown that keeps a dim-bar click pointed at the leaf its advice
 * actually names.
 *
 * ADR: docs/decisions/0006-inline-issue-surface.md.
 * Plan: docs/plans/inline-bullet-issues-to-scout.md.
 */

// Types
export type {
  SubCriterionKey,
  TipKind,
  InlineIssueTarget
} from './types';

// Section table + path mapper (pure functions + constants)
export {
  SECTION_TABLE,
  mapPathToSection,
  pathToSectionId,
  sectionSlugFor,
  sectionId
} from './map-path-to-section';
export type { SectionKey } from './map-path-to-section';

// Client components
export { DynamicTipInline } from './dynamic-tip-inline';
export type { DynamicTipInlineProps } from './dynamic-tip-inline';

export { InlineIssueTip } from './inline-issue-tip';
export type { InlineIssueTipProps } from './inline-issue-tip';

export { useInlineIssueController } from './use-inline-issue-controller';
export type {
  UseInlineIssueControllerOptions,
  TriggerInput
} from './use-inline-issue-controller';

export {
  defaultPathForCriterion,
  defaultPathForSkill
} from './criterion-to-path';

export {
  buildMatchBreakdown,
  maybeAppendSkillGapEntry
} from './build-match-breakdown';

// Tip-event bridge (scorecard → editor). The editor subscribes and
// renders the inline tip portal anchored to the section header; the
// scorecard fires this on every dim-bar click.
export {
  dispatchInlineIssueTip,
  subscribeToInlineIssueTip,
  INLINE_ISSUE_TIP_EVENT
} from './apply-bridge';
export type { InlineIssueTipEvent } from './apply-bridge';
