CREATE TABLE "export_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"object_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"filter" jsonb,
	"sort" jsonb,
	"columns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"file_id" uuid,
	"download_path" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "export_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"record_id" uuid NOT NULL,
	"object_id" uuid NOT NULL,
	"name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"storage_key" text NOT NULL,
	"uploaded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "files_id_workspace_unique" UNIQUE("id","workspace_id")
);
--> statement-breakpoint
ALTER TABLE "files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"object_id" uuid NOT NULL,
	"name" text NOT NULL,
	"filters" jsonb,
	"sort" jsonb,
	"columns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_shared" boolean DEFAULT false NOT NULL,
	"owner_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "views_id_workspace_unique" UNIQUE("id","workspace_id")
);
--> statement-breakpoint
ALTER TABLE "views" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_object_workspace_fk" FOREIGN KEY ("object_id","workspace_id") REFERENCES "public"."object_definitions"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_record_workspace_fk" FOREIGN KEY ("record_id","workspace_id") REFERENCES "public"."records"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_object_workspace_fk" FOREIGN KEY ("object_id","workspace_id") REFERENCES "public"."object_definitions"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "views" ADD CONSTRAINT "views_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "views" ADD CONSTRAINT "views_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "views" ADD CONSTRAINT "views_object_workspace_fk" FOREIGN KEY ("object_id","workspace_id") REFERENCES "public"."object_definitions"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "export_jobs_workspace_object_idx" ON "export_jobs" USING btree ("workspace_id","object_id");--> statement-breakpoint
CREATE INDEX "export_jobs_owner_idx" ON "export_jobs" USING btree ("workspace_id","owner_id");--> statement-breakpoint
CREATE INDEX "files_record_idx" ON "files" USING btree ("workspace_id","record_id");--> statement-breakpoint
CREATE INDEX "files_workspace_id_idx" ON "files" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "views_workspace_object_idx" ON "views" USING btree ("workspace_id","object_id");--> statement-breakpoint
CREATE INDEX "views_owner_idx" ON "views" USING btree ("workspace_id","object_id","owner_id");--> statement-breakpoint
CREATE POLICY "export_jobs_workspace_isolation" ON "export_jobs" AS PERMISSIVE FOR ALL TO "crm_app" USING ("export_jobs"."workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK ("export_jobs"."workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "files_workspace_isolation" ON "files" AS PERMISSIVE FOR ALL TO "crm_app" USING ("files"."workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK ("files"."workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "views_workspace_isolation" ON "views" AS PERMISSIVE FOR ALL TO "crm_app" USING ("views"."workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK ("views"."workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid);