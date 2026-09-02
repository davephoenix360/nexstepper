ALTER TABLE "resumes" ADD COLUMN "share_token_hash" text;--> statement-breakpoint
ALTER TABLE "resumes" ADD COLUMN "share_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "resumes" ADD COLUMN "share_view_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "resumes" ADD COLUMN "share_last_viewed_at" timestamp;--> statement-breakpoint
ALTER TABLE "resumes" ADD COLUMN "share_created_at" timestamp;--> statement-breakpoint
CREATE INDEX "resumes_share_token_idx" ON "resumes" USING btree ("share_token_hash");