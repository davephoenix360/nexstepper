/**
 * Public surface for the inline-issue module.
 *
 * Everything the scorecard + the popover + the editor imports
 * from `lib/inline-issue/` comes through here. Keep the imports
 * narrow — if a new component is added, export it explicitly so
 * the file's public contract stays grep-able.
 *
 * ADR: docs/decisions/0006-inline-issue-surface.md.
 * Plan: docs/plans/inline-issue-surface.md.
 */

// Types
export type {
  SubCriterionKey,
  TipKind,
  InlineIssueTarget,
  InlineIssueContext,
  EnrichBulletInput,
  EnrichBulletResult
} from './types';

// Section table + path mapper (pure functions + constants)
export {
  SECTION_TABLE,
  mapPathToSection,
  sectionSlugFor,
  sectionId
} from './map-path-to-section';
export type { SectionKey } from './map-path-to-section';

// Prompt template
export {
  buildRewritePrompt,
  extractVocabulary
} from './prompts';
export type { RewritePromptInput } from './prompts';

// Client components
export { DynamicTipInline } from './dynamic-tip-inline';
export type { DynamicTipInlineProps } from './dynamic-tip-inline';

export { InlineIssuePopover } from './inline-issue-popover';
export type { InlineIssuePopoverProps } from './inline-issue-popover';

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

// Apply-event bridge (scorecard → editor).
export {
  dispatchInlineIssueApply,
  subscribeToInlineIssueApply,
  INLINE_ISSUE_APPLY_EVENT
} from './apply-bridge';
export type { InlineIssueApplyEvent } from './apply-bridge';

// Tip-event bridge (scorecard → editor). The editor subscribes
// and renders the inline tip portal anchored to the section
// header; the scorecard fires this on every dim-bar click.
export {
  dispatchInlineIssueTip,
  subscribeToInlineIssueTip,
  INLINE_ISSUE_TIP_EVENT
} from './apply-bridge';
export type { InlineIssueTipEvent } from './apply-bridge';