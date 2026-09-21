CREATE TABLE "stripe_events_processed" (
	"event_id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"processed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "stripe_events_processed_type_idx" ON "stripe_events_processed" USING btree ("event_type");