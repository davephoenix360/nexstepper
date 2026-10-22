-- Phase C — first-session analysis.
--
-- One deep "review my resume against this job description" pass, run
-- ONCE per (resume, job description) pair and cached.
--
-- Why a table rather than a column on `resumes`:
--
--   The analysis is expensive relative to the other derived artifacts
--   (one model call, ~7.5K input tokens, ~3.5K output -- about $0.003),
--   and it must not re-run on every chat turn. It is also not resume
--   content: putting it in `resume_revisions.data` would mean every
--   content save carried the assistant's commentary along with the
--   user's writing.
--
-- Keyed on (resume_id, jd_hash):
--
--   - jd_hash is a digest of the job description TEXT. Editing the JD
--     changes the hash, which invalidates the cached analysis with no
--     explicit invalidation logic to get wrong.
--   - The resume is not hashed. The critique is about the resume-vs-JD
--     GAP, which stays valid across resume edits; the ATS score is
--     recomputed per turn separately, so it never goes stale.
--
-- `analysis` is JSONB. The shape is pinned by the Zod schema in
-- lib/chat/first-session-analysis.ts, which is the only writer and the
-- only reader -- so the SQL type stays `jsonb` and the shape stays in
-- one place.
--
-- NOTE ON `resumes_share_token_idx`
--
-- The generated migration also wanted to DROP and recreate that index.
-- That is schema drift being reconciled: the DATABASE and the snapshot
-- both had it as UNIQUE + partial (`WHERE share_token IS NOT NULL`),
-- while schema.ts declared a plain `index(...).on(...)` -- on the
-- mistaken belief that drizzle's index builder "doesn't expose
-- `.where()`". It does.
--
-- Left unfixed, this migration would have silently DOWNGRADED the
-- uniqueness guarantee on the public share token. schema.ts now
-- declares the index the way it actually exists, which makes the diff
-- empty -- so this migration leaves it alone entirely.
--> statement-breakpoint
CREATE TABLE "resume_analyses" (
	"id" text PRIMARY KEY NOT NULL,
	"resume_id" text NOT NULL,
	"user_id" text NOT NULL,
	"jd_hash" text NOT NULL,
	"analysis" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "resume_analyses" ADD CONSTRAINT "resume_analyses_resume_id_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_analyses" ADD CONSTRAINT "resume_analyses_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- The only read pattern: "latest analysis for this resume + JD".
-- DESC created_at supports ORDER BY created_at DESC LIMIT 1 without a
-- sort step.
CREATE INDEX "resume_analyses_resume_jd_created_idx" ON "resume_analyses" USING btree ("resume_id","jd_hash","created_at" DESC NULLS LAST);--> statement-breakpoint
-- One analysis per (resume, JD) at a time. `recordResumeAnalysis` upserts
-- on this pair, so the constraint is what makes the upsert work -- without
-- it, a second write for the same JD would insert a duplicate row instead
-- of replacing the stale critique.
CREATE UNIQUE INDEX "resume_analyses_resume_jd_uniq" ON "resume_analyses" USING btree ("resume_id","jd_hash");
