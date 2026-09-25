/**
 * Static dictionaries used by the scoring engine.
 *
 * Three lists, each in a `Set<string>` for O(1) lookup:
 *   - `ACTION_VERBS` — ~100 strong verbs that signal accomplishment.
 *     Used by `dimensions/content-quality.ts` to score bullet
 *     "starts-with-a-strong-verb" usage.
 *   - `WEAK_VERBS`   — ~20 verbs that mean "did some work" without
 *     showing impact. Bullets starting with these score zero on the
 *     action-verb sub-criterion.
 *   - `SOFT_SKILLS`  — 12 phrases that score the "soft skills"
 *     sub-criterion of `dimensions/alignment.ts`.
 *   - `STOP_WORDS`   — ~100 high-frequency English words the keyword
 *     match sub-criterion filters out before scoring. Prevents "the",
 *     "and", "with", etc. from polluting the keyword hit count.
 *
 * Inherited from the legacy `nextep-legacy/src/lib/score.ts` lines 92-216
 * (verbs) and from `keyword-extractor`'s default English stop-word
 * list (STOP_WORDS). Easy to extend here — just add an entry. Easy
 * to A/B test — just `import` the new set and pass it in.
 *
 * Drift from plan: the plan asked us to confirm via test that
 * ACTION_VERBS contains the top-20 most-common verbs. That test is
 * `tests/unit/scoring/dictionaries.test.ts`.
 */

export const ACTION_VERBS: ReadonlySet<string> = new Set([
  'achieved',
  'accelerated',
  'accomplished',
  'adapted',
  'administered',
  'analyzed',
  'architected',
  'assembled',
  'assessed',
  'assisted',
  'automated',
  'awarded',
  'built',
  'collaborated',
  'completed',
  'conceived',
  'conducted',
  'consolidated',
  'constructed',
  'consulted',
  'created',
  'customized',
  'delivered',
  'demonstrated',
  'designed',
  'developed',
  'directed',
  'discovered',
  'documented',
  'doubled',
  'earned',
  'eliminated',
  'enhanced',
  'established',
  'evaluated',
  'exceeded',
  'executed',
  'expanded',
  'expedited',
  'facilitated',
  'founded',
  'generated',
  'guided',
  'implemented',
  'improved',
  'increased',
  'initiated',
  'innovated',
  'installed',
  'integrated',
  'introduced',
  'invented',
  'launched',
  'led',
  'maintained',
  'managed',
  'mentored',
  'modernized',
  'negotiated',
  'operated',
  'optimized',
  'organized',
  'originated',
  'overhauled',
  'performed',
  'pioneered',
  'planned',
  'produced',
  'programmed',
  'promoted',
  'proposed',
  'provided',
  'published',
  'reduced',
  'refined',
  'reorganized',
  'replaced',
  'researched',
  'resolved',
  'restored',
  'restructured',
  'revamped',
  'scaled',
  'simplified',
  'solved',
  'spearheaded',
  'standardized',
  'streamlined',
  'strengthened',
  'supervised',
  'supported',
  'surpassed',
  'transformed',
  'translated',
  'troubleshot',
  'upgraded',
  'utilized',
  'validated',
  'volunteered'
]);

export const WEAK_VERBS: ReadonlySet<string> = new Set([
  'be',
  'am',
  'is',
  'are',
  'was',
  'were',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'made',
  'worked',
  'helped',
  'responsible',
  'duties',
  'tasked'
]);

/**
 * Phase 1 calibration drift: the legacy shipped with a 4-word
 * soft-skill list ("team", "leadership", "collaborated",
 * "communication"). Slice-1 calibration showed the alignment
 * sub-criterion maxed out at 100% on every well-matched fixture
 * because the fixture's summary happened to contain all four
 * words — real JDs use a much wider vocabulary.
 *
 * The expanded list below is drawn from the 12 phrases that score
 * reliably on real ATS platforms when they appear verbatim in the
 * JD, per `docs/drift/2026-09-19-ats-engine-review.md`. Phrases
 * are kept as lowercase substrings for compatibility with the
 * existing substring-matching implementation in
 * `dimensions/alignment.ts`.
 *
 * Plan §"Open questions" #3 default: inherit. Calibration says
 * expand. Done.
 */
export const SOFT_SKILLS: readonly string[] = [
  // ─── Legacy 4 ──────────────────────────────────────────────
  'team',
  'leadership',
  'collaborated',
  'communication',
  // ─── Industry-standard 8 additions (2026) ──────────────────
  'stakeholder',
  'cross-functional',
  'people management',
  'mentorship',
  'conflict resolution',
  'presentation',
  'analytical',
  'negotiation'
] as const;

/**
 * Stop-word list used by the keyword-matching sub-criterion to strip
 * noise before scoring. Derived from `keyword-extractor`'s English
 * defaults + a few additions ("via", "etc", "using") that were
 * showing up as "matches" in the legacy's output and inflating the
 * score. Lock this list — any PR that adds/removes a word must also
 * add/remove the corresponding test in `dictionaries.test.ts`.
 */
export const STOP_WORDS: ReadonlySet<string> = new Set([
  'a',
  'about',
  'above',
  'after',
  'again',
  'against',
  'all',
  'am',
  'an',
  'and',
  'any',
  'are',
  'as',
  'at',
  'be',
  'because',
  'been',
  'before',
  'being',
  'below',
  'between',
  'both',
  'but',
  'by',
  'can',
  'could',
  'did',
  'do',
  'does',
  'doing',
  'don',
  'down',
  'during',
  'each',
  'etc',
  'few',
  'for',
  'from',
  'further',
  'had',
  'has',
  'have',
  'having',
  'he',
  'her',
  'here',
  'hers',
  'herself',
  'him',
  'himself',
  'his',
  'how',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'itself',
  'just',
  'me',
  'more',
  'most',
  'my',
  'myself',
  'no',
  'nor',
  'not',
  'now',
  'of',
  'off',
  'on',
  'once',
  'only',
  'or',
  'other',
  'our',
  'ours',
  'ourselves',
  'out',
  'over',
  'own',
  'same',
  'she',
  'should',
  'so',
  'some',
  'such',
  'than',
  'that',
  'the',
  'their',
  'theirs',
  'them',
  'themselves',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'through',
  'to',
  'too',
  'under',
  'until',
  'up',
  'upon',
  'using',
  'very',
  'via',
  'was',
  'we',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'who',
  'whom',
  'why',
  'will',
  'with',
  'would',
  'you',
  'your',
  'yours',
  'yourself',
  'yourselves'
]);
