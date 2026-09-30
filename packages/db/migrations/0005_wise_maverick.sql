CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"record_id" uuid NOT NULL,
	"object_id" uuid NOT NULL,
	"type" text NOT NULL,
	"subject" text NOT NULL,
	"body" text,
	"owner_id" text NOT NULL,
	"due_at" timestamp with time zone,
	"status" text DEFAULT 'open' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key_prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"scopes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "automation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"automation_id" uuid NOT NULL,
	"record_id" uuid,
	"trigger_event" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"action_results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "automation_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "automations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"object_id" uuid NOT NULL,
	"name" text NOT NULL,
	"trigger" jsonb NOT NULL,
	"conditions" jsonb,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automations_id_workspace_unique" UNIQUE("id","workspace_id")
);
--> statement-breakpoint
ALTER TABLE "automations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"event" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"response_status" integer,
	"response_body_preview" text,
	"next_attempt_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "webhook_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"url" text NOT NULL,
	"signing_secret" text NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"object_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_subscriptions_id_workspace_unique" UNIQUE("id","workspace_id")
);
--> statement-breakpoint
ALTER TABLE "webhook_subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_record_workspace_fk" FOREIGN KEY ("record_id","workspace_id") REFERENCES "public"."records"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_object_workspace_fk" FOREIGN KEY ("object_id","workspace_id") REFERENCES "public"."object_definitions"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_automation_workspace_fk" FOREIGN KEY ("automation_id","workspace_id") REFERENCES "public"."automations"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_record_workspace_fk" FOREIGN KEY ("record_id","workspace_id") REFERENCES "public"."records"("id","workspace_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_object_workspace_fk" FOREIGN KEY ("object_id","workspace_id") REFERENCES "public"."object_definitions"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_subscription_workspace_fk" FOREIGN KEY ("subscription_id","workspace_id") REFERENCES "public"."webhook_subscriptions"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_object_workspace_fk" FOREIGN KEY ("object_id","workspace_id") REFERENCES "public"."object_definitions"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_record_idx" ON "activities" USING btree ("workspace_id","record_id");--> statement-breakpoint
CREATE INDEX "activities_owner_idx" ON "activities" USING btree ("workspace_id","owner_id");--> statement-breakpoint
CREATE INDEX "api_keys_workspace_id_idx" ON "api_keys" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "api_keys_key_hash_idx" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "automation_runs_automation_idx" ON "automation_runs" USING btree ("workspace_id","automation_id");--> statement-breakpoint
CREATE INDEX "automation_runs_record_idx" ON "automation_runs" USING btree ("workspace_id","record_id");--> statement-breakpoint
CREATE INDEX "automations_workspace_object_idx" ON "automations" USING btree ("workspace_id","object_id");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_subscription_idx" ON "webhook_deliveries" USING btree ("workspace_id","subscription_id");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_status_idx" ON "webhook_deliveries" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "webhook_subscriptions_workspace_id_idx" ON "webhook_subscriptions" USING btree ("workspace_id");--> statement-breakpoint
CREATE POLICY "activities_workspace_isolation" ON "activities" AS PERMISSIVE FOR ALL TO "crm_app" USING ("activities"."workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK ("activities"."workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "api_keys_workspace_isolation" ON "api_keys" AS PERMISSIVE FOR ALL TO "crm_app" USING ("api_keys"."workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK ("api_keys"."workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "automation_runs_workspace_isolation" ON "automation_runs" AS PERMISSIVE FOR ALL TO "crm_app" USING ("automation_runs"."workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK ("automation_runs"."workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "automations_workspace_isolation" ON "automations" AS PERMISSIVE FOR ALL TO "crm_app" USING ("automations"."workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK ("automations"."workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "webhook_deliveries_workspace_isolation" ON "webhook_deliveries" AS PERMISSIVE FOR ALL TO "crm_app" USING ("webhook_deliveries"."workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK ("webhook_deliveries"."workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "webhook_subscriptions_workspace_isolation" ON "webhook_subscriptions" AS PERMISSIVE FOR ALL TO "crm_app" USING ("webhook_subscriptions"."workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK ("webhook_subscriptions"."workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid);