DROP INDEX "chat_usage_user_date_idx";--> statement-breakpoint
ALTER TABLE "chat_usage" ADD CONSTRAINT "chat_usage_user_id_date_pk" PRIMARY KEY("user_id","date");