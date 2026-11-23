# Drift — the page estimate gave back a section's height twice

Date: 2026-11-23
Branch: `main`

## What prompted this

The founder, on the chat agent's page-count tool:

> *"does estimate resume page count tool take into account hidden sections
> in the resume? Or does it even need to?"*

## The answer

**Yes — and yes it needs to.** The tool's entire job is "how many pages
will this print on", and the printed PDF omits hidden sections: the
templates apply `print:hidden`, so under print media a hidden section
collapses to zero height. An estimate that ignored the hidden list
would be measuring the editor, not the PDF.

The mechanics, in `lib/chat/page-fit.ts`:

| Section | Where its height lives | What "hidden" does |
|---|---|---|
| experience | `perRole × roles` term | the whole term is removed; its breakdown line is zeroed |
| skills, education | inside the measured `fixed` skeleton | the measured height is given back |
| projects, volunteer, awards, certificates, publications, languages, interests, references | their own measured height | never added at all |

The tool reads the envelope's list —
`data.print?.hiddenSections ?? []` in
`lib/chat/tools/estimate-page-count.ts` — and passes it to
`estimateResumeLength(data, settings, hidden)`. Sections already hidden
are also absent from the "hiding this would save" list, because you
cannot hide the same thing twice.

## The defect found while answering

**A section that was both EMPTY and HIDDEN had its height given back
twice.**

The two rules lived in two places in the same function, thirty lines
apart:

```ts
// line ~259 — the section is EMPTY
if (!sectionHasContent(data, 'skills')) total -= skillsInches;
...
// line ~292 — the section is HIDDEN
if (hidden.has('skills')) total -= skillsInches;
```

Both are correct on their own. Together, a resume with **no** skills
whose Skills section was also hidden from print lost `skillsInches`
**twice** — 1.87in on the classic template, about 20% of a page.

### Why it matters

The estimate UNDER-reports, which is the one direction this tool must
never fail in: its whole reason to exist is that people used to print,
find three pages, and come back annoyed.

Measured on the classic template with the gallery sample:

| Case | Estimate | Printed document |
|---|---|---|
| skills empty, nothing hidden | 18.75in → 2 pages | — |
| skills empty, skills hidden | **16.88in** → 2 pages | **identical to the row above** |
| education empty, nothing hidden | 19.45in → **3 pages** | — |
| education empty, education hidden | **18.28in** → **2 pages** | **identical to the row above** |

The education case is a **whole page** off: the tool said "about two
pages" for a resume that prints on three.

### How the agent reaches it

`updatePrintHiddenSections` accepts any slug from
`PRINTABLE_SECTION_SLUGS`, whether or not the section has content —
the chat agent can call `hide: ['skills']` on a resume with no skills
section and nothing will object. So the agent could put the resume into
this state itself, then measure it and tell the user the wrong number.

## The fix

One expression per section, so the two conditions cannot overlap:

```ts
const skillsPrint = sectionHasContent(data, 'skills') && !hidden.has('skills');
if (!skillsPrint) total -= skillsInches;
```

After the fix, the empty-and-hidden case gives back the height **once**
(0.00in difference, because the printed document really is identical),
and the populated-and-hidden case still gives it back (1.87in,
because the section really does stop printing).

## The trap

**A rule applied in two places in a function double-counts.** "The
section is empty" and "the section is hidden" are two ways of saying
the same thing to the printed page — *it does not print* — and the
code treated them as two independent facts. Thirty lines of separation
is enough to hide the overlap from a reader and from a reviewer.

The generalisation: when a rule can be triggered by more than one
condition, decide **once** whether the thing happens and branch on
that decision, rather than applying the correction in each place.

## Tests

`tests/unit/chat/page-fit.test.ts` gains three cases: the empty-and-
hidden pair for skills and for education (the estimate must not move),
and the populated-and-hidden case (it must still move). Verified to
**fail on the old code and pass on the new** — not a tautological
assertion.

## Files

- `lib/chat/page-fit.ts` — the fix.
- `tests/unit/chat/page-fit.test.ts` — the regression tests.
