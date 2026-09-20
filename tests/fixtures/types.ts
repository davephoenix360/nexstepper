/**
 * Recursive `Partial<T>` — walks the object type and marks every
 * nested field as optional. TypeScript's built-in `Partial` is
 * shallow (only top-level keys are marked optional), so a test
 * fixture that wants to override just `sections.work` would have
 * to enumerate every other section to satisfy the parameter type.
 *
 * Used by `makeResume`-style helpers in `tests/unit/scoring/`
 * so test fixtures can pass partial section overrides without
 * re-declaring all 13 standard sections.
 *
 * Caveats:
 *  - Arrays become `DeepPartial<Array<T>>` which is `{ 0?: T, ... }`
 *    — TypeScript will accept this for indexed reads, but iteration
 *    is still over `T[]`. Practically fine because we never partially
 *    override array elements.
 *  - Functions and primitives are passed through unchanged.
 */
export type DeepPartial<T> = T extends object
  ? { [P in keyof T]?: DeepPartial<T[P]> }
  : T;
