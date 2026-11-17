# Drift — "Rewrite with AI" never opened: the editor's path spelling

Date: 2026-11-17
Branch: `main`

## What prompted this

The founder, on the scoring work: *"we don't have too good of a
communication of like, what a user can do to improve a particular
score. So like for example the rewrite with AI that we put beside the
score dimensions. Even clicking that doesn't actually rewrite with AI.
You can check the functionality we currently have."*

(The founder also confirmed the launch video is out of scope — it was a
test of the flag functionality.)

## The bug

**Every dimension bar's "Rewrite with AI" was dead.**

The editor binds every field with a **dotted** path — the Classic
template's `WorkPositionsNested` confirms it:

```
sections.work.${i}.positions.${j}.highlights.${k}
```

and renders `data-testid="editable-{path}"`.

The inline-issue surface handed it the **bracketed** JSON-Resume
spelling:

```
sections.work[0].positions[0].highlights[0]
```

which no template ever renders. So:

| step | what happened |
|---|---|
| `readLeafText(path)` | `[data-testid="editable-sections.work[0]…"]` → **no element** → `''` |
| `buildSuppressionNotice` | `hasTarget` true, `text` empty → **"The bullet here is empty — add some content to this section first, then we can rewrite it."** |
| `form.setValue(path, text)` | would not have matched the RHF field either — **the write went nowhere** |

The user was told their bullet was empty when it was full, and the
rewrite could not have landed even if the popover had opened. Three
breakages from one wrong spelling.

The `extractBulletIndex` regex had the same defect from the other
side — it matched only `.field[N]`, so every real path produced
`bulletIndex: null` and the popover could not highlight the line it
was about to replace.

## The second defect: the target was the wrong leaf

Underneath the spelling bug, the mapping itself was wrong. Almost every
criterion pointed at the first work bullet — including the criteria
that measure something else entirely:

| Criterion | What it measures | Was | Now |
|---|---|---|---|
| ATS Keyword Match | missing keywords | first work bullet | **the skills block** |
| Intent Coverage | missing must-have skills | first work bullet | **the skills block** |
| Role Fit | the JD title vs the candidate's titles | first work bullet | **the headline** |
| Tailoring | the JD title's vocabulary in the summary | first work bullet | **the summary** |
| Seniority Fit | years of experience | position title | **the summary** |
| Unique Value | distinctive content | first work bullet | **the first project** |
| ATS Coverage / Accomplishment Focus / Action Verb Usage / Soft Skills | bullet-level | first work bullet | unchanged (correct) |
| Section Completeness / Optimal Length | structural | position title | unchanged |

Rewriting a work bullet cannot move a dimension that reads the
headline. And since 2026-11-17 Role Fit reads `basics.label` at all —
so the dimension bar was rewriting a work bullet while the number next
to it was computed from the headline.

## The fix

- `defaultPathForCriterion` and `defaultPathForSkill` return **dotted**
  paths, and each criterion points at the leaf it reads.
- `extractBulletIndex` accepts both spellings (`.field.N` and
  `.field[N]`), so the popover highlights the right bullet.

## The anti-drift test

`tests/unit/inline-issue/criterion-paths.test.tsx` renders a REAL
template and asserts that every criterion's path exists as an
`editable-` testid in the DOM. That is the test that would have caught
this — it fails on the old spelling.

It also pins the target: Tailoring and Seniority Fit → the summary,
Role Fit → the headline, the skill criteria → the skills block.

## Why it matters beyond the popover

The path is used in three places, and all three were broken by the
same spelling:

1. `readLeafText` — the text the popover shows.
2. `mapPathToSection` — which section to scroll to, and which bullet
   to highlight.
3. `dispatchInlineIssueApply` — `form.setValue(path, text)`, the write
   that puts the rewrite back into the resume.

So the surface was not "the rewrite is slow" or "the rewrite is
imprecise". It never opened.

## Also fixed in this pass

The **soft-skills tip** used a literal `haystack.includes(phrase)`
check while the score used the variant-aware matcher. So a resume that
wrote "collaboration" was told it was missing "collaborated" — advice
the candidate should not act on, contradicting the number next to it.
The tip now reads the score's answer.

## The lesson

**A path is only useful if the editor renders exactly that testid.**
Two lists — the paths the surface emits and the paths the editor
binds — and they were not equal. The same shape as the scoring audit:
*the schema and the scorer carry separate field lists*.

The generalisation: **when two surfaces must agree (a score and its
tip, a path and its editor, a note and its vocabulary), assert the
agreement in a test that renders the real thing.** A test on the
function's return value only pins the function.
