# The editor page crashed on every resume — a hook read a context it does not have

**Date:** 2026-11-02
**Severity:** production, total feature failure
**Surface:** `/dashboard/resumes/:id` — the resume editor
**Detected by:** the user, via Sentry

## What happened

The rich-text formatting feature shipped at 13:57. By 20:13 the editor
was dead on every resume:

```
TypeError: Cannot read properties of null (reading 'control')
  at components/rich-text/use-formatting.ts:49
  at components/editable/editable-resume.tsx:348
```

The user noticed before the next person did. The whole page failed to
mount — no editor, no preview, nothing.

## The cause

`useFormatting()` reads the form through `useFormContext()`:

```ts
const form = useFormContext();
const formatting = useWatch({ control: form.control, name: 'formatting' });
```

`EditableResume` **renders** the `<FormProvider>`:

```tsx
return (
  <FormProvider {...form}>
    ...
    <RichTextToolbar />
  </FormProvider>
);
```

So `EditableResume` is the component that PROVIDES the context — it is
not inside one. Calling `useFormContext()` in its own body returns
`null`, and reading `form.control` off that `null` throws.

The distinction is easy to miss because the component *looks* like it
has a form: it creates one, it passes one down, and every child of it
gets the context. The one place that does not have it is the component
itself.

## Why no test caught it

**No test rendered `EditableResume`.**

The formatting tests rendered the pieces — a field, the toolbar —
inside a `<FormProvider>` of their own. That is exactly the shape the
bug did **not** have. Every test was green; the suite was confident;
production was down.

The missing test was the cheapest possible one: *render the editor root
and assert it mounts.* It would have failed on the first run of the
feature.

## The fix

- `EditableResume` reads and writes the overlay through the **form
  instance it already has in scope**, not through the context it
  provides.
- `useFormatting()` now throws a **message that says what to do**,
  instead of a bare `TypeError` from a null dereference:

  > useFormatting() must be called inside a `<FormProvider>`. If you
  > are the component that RENDERS the provider, read the map through
  > your own form instance instead of the context.

- `tests/interaction/editable-resume-root.test.tsx` renders the editor
  root in its real shape — once with no formatting and once with
  formatting applied — and asserts it mounts.

**And the test was verified to bite.** With the bug reintroduced it
fails with the exact production error:

```
× the editor root > mounts without throwing
  → expected [Function] to not throw an error but
    'TypeError: Cannot read properties of null (reading 'control')'
    was thrown
```

## The lesson

**A component that provides a context cannot consume it.** `useFormContext`
returns `null` in the provider's own subtree, and the failure is a null
dereference three frames away from the mistake.

The repo already knew this — `components/resume-templates/field.tsx`
documents it at length ("Naively rendering those Editable* components
outside a FormProvider crashes"). The rule was written down; it was
just not applied to the new hook.

And the deeper lesson is about **what the suite was blind to**. It had
49 new tests, all of them about the *pieces* — re-anchoring, the span
algebra, the toolbar gesture, the score invariance — and not one about
the page. A green suite that never renders the page is not evidence
that the page works.

**Test the thing that broke, at the level it broke.** The editor root
now has a test that renders it, and it stays.

## Follow-ups

- The other new components that consume form context (`EditableText`,
  `RichTextToolbar`) are rendered *inside* the provider, so they are
  fine — but the same mistake is one refactor away. The explicit error
  message is the guard.
- Nothing else was affected: the read-only render path
  (`classic-readonly`, `Field*`) never touches the form context, so the
  share link and the preview were never affected.
