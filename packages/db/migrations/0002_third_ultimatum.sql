CREATE POLICY "memberships_self_select" ON "memberships" AS PERMISSIVE FOR SELECT TO "crm_app" USING ("memberships"."user_id" = NULLIF(current_setting('app.user_id', true), ''));
--> statement-breakpoint
CREATE POLICY "roles_member_select" ON "roles" AS PERMISSIVE FOR SELECT TO "crm_app" USING (exists (
        select 1
        from memberships m
        where m.workspace_id = "roles"."workspace_id"
          and m.user_id = nullif(current_setting('app.user_id', true), '')
      ));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_get_invitation_by_token_hash(p_hash text)
RETURNS SETOF invitations
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM invitations WHERE token_hash = p_hash LIMIT 1;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_get_invitation_by_token_hash(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_get_invitation_by_token_hash(text) TO crm_app;
