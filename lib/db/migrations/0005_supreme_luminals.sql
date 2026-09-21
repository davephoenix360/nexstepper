CREATE TABLE "score_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"resume_id" text NOT NULL,
	"match_score" integer NOT NULL,
	"match_breakdown" jsonb,
	"dynamic_tips" jsonb,
	"computed_in_ms" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "score_snapshots" ADD CONSTRAINT "score_snapshots_resume_id_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "score_snapshots_resume_created_idx" ON "score_snapshots" USING btree ("resume_id","created_at" DESC NULLS LAST);