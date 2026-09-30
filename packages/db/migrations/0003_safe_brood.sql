CREATE TABLE "field_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"object_id" uuid NOT NULL,
	"api_name" text NOT NULL,
	"label" text NOT NULL,
	"type" text NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"is_unique" boolean DEFAULT false NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_indexed" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "field_definitions_object_api_name_unique" UNIQUE("object_id","api_name"),
	CONSTRAINT "field_definitions_id_workspace_unique" UNIQUE("id","workspace_id")
);
--> statement-breakpoint
ALTER TABLE "field_definitions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "object_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"api_name" text NOT NULL,
	"label_singular" text NOT NULL,
	"label_plural" text NOT NULL,
	"icon" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "object_definitions_workspace_api_name_unique" UNIQUE("workspace_id","api_name"),
	CONSTRAINT "object_definitions_id_workspace_unique" UNIQUE("id","workspace_id")
);
--> statement-breakpoint
ALTER TABLE "object_definitions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "record_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"field_id" uuid NOT NULL,
	"from_record_id" uuid NOT NULL,
	"to_record_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "record_relations_field_from_to_unique" UNIQUE("field_id","from_record_id","to_record_id")
);
--> statement-breakpoint
ALTER TABLE "record_relations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"object_id" uuid NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"owner_id" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"search" "tsvector" DEFAULT ''::tsvector NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "records_id_workspace_unique" UNIQUE("id","workspace_id")
);
--> statement-breakpoint
ALTER TABLE "records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "metadata_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "field_definitions" ADD CONSTRAINT "field_definitions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_definitions" ADD CONSTRAINT "field_definitions_object_workspace_fk" FOREIGN KEY ("object_id","workspace_id") REFERENCES "public"."object_definitions"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "object_definitions" ADD CONSTRAINT "object_definitions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_relations" ADD CONSTRAINT "record_relations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_relations" ADD CONSTRAINT "record_relations_field_workspace_fk" FOREIGN KEY ("field_id","workspace_id") REFERENCES "public"."field_definitions"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_relations" ADD CONSTRAINT "record_relations_from_workspace_fk" FOREIGN KEY ("from_record_id","workspace_id") REFERENCES "public"."records"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_relations" ADD CONSTRAINT "record_relations_to_workspace_fk" FOREIGN KEY ("to_record_id","workspace_id") REFERENCES "public"."records"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_object_workspace_fk" FOREIGN KEY ("object_id","workspace_id") REFERENCES "public"."object_definitions"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "field_definitions_workspace_id_idx" ON "field_definitions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "field_definitions_object_id_idx" ON "field_definitions" USING btree ("object_id");--> statement-breakpoint
CREATE INDEX "object_definitions_workspace_id_idx" ON "object_definitions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "record_relations_from_idx" ON "record_relations" USING btree ("workspace_id","field_id","from_record_id");--> statement-breakpoint
CREATE INDEX "record_relations_to_idx" ON "record_relations" USING btree ("workspace_id","field_id","to_record_id");--> statement-breakpoint
CREATE INDEX "records_workspace_object_idx" ON "records" USING btree ("workspace_id","object_id") WHERE "records"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "records_owner_idx" ON "records" USING btree ("workspace_id","object_id","owner_id") WHERE "records"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "records_name_idx" ON "records" USING btree ("workspace_id","object_id","name") WHERE "records"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "records_created_at_idx" ON "records" USING btree ("workspace_id","object_id","created_at") WHERE "records"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "records_search_gin" ON "records" USING gin ("search");--> statement-breakpoint
DELETE FROM "role_object_permissions" rop
WHERE NOT EXISTS (
  SELECT 1 FROM "object_definitions" od
  WHERE od.id = rop.object_id AND od.workspace_id = rop.workspace_id
);--> statement-breakpoint
DELETE FROM "role_field_permissions" rfp
WHERE NOT EXISTS (
  SELECT 1 FROM "field_definitions" fd
  WHERE fd.id = rfp.field_id AND fd.workspace_id = rfp.workspace_id
);--> statement-breakpoint
ALTER TABLE "role_field_permissions" ADD CONSTRAINT "role_field_permissions_field_fk" FOREIGN KEY ("field_id","workspace_id") REFERENCES "public"."field_definitions"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_object_permissions" ADD CONSTRAINT "role_object_permissions_object_fk" FOREIGN KEY ("object_id","workspace_id") REFERENCES "public"."object_definitions"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "field_definitions_workspace_isolation" ON "field_definitions" AS PERMISSIVE FOR ALL TO "crm_app" USING ("field_definitions"."workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK ("field_definitions"."workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "object_definitions_workspace_isolation" ON "object_definitions" AS PERMISSIVE FOR ALL TO "crm_app" USING ("object_definitions"."workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK ("object_definitions"."workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "record_relations_workspace_isolation" ON "record_relations" AS PERMISSIVE FOR ALL TO "crm_app" USING ("record_relations"."workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK ("record_relations"."workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "records_workspace_isolation" ON "records" AS PERMISSIVE FOR ALL TO "crm_app" USING ("records"."workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK ("records"."workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::uuid);