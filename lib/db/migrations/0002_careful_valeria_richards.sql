CREATE TABLE "applications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"job_title" text NOT NULL,
	"company" text,
	"jd_text" text NOT NULL,
	"jd_parsed" jsonb,
	"source_url" text,
	"source_board" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"applied_at" timestamp,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resume_variants" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"resume_id" text NOT NULL,
	"match_score" integer NOT NULL,
	"match_breakdown" jsonb,
	"tailoring_notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_variants" ADD CONSTRAINT "resume_variants_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_variants" ADD CONSTRAINT "resume_variants_resume_id_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "applications_user_created_idx" ON "applications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "applications_user_status_idx" ON "applications" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "resume_variants_application_idx" ON "resume_variants" USING btree ("application_id","created_at");--> statement-breakpoint
CREATE INDEX "resume_variants_resume_idx" ON "resume_variants" USING btree ("resume_id");