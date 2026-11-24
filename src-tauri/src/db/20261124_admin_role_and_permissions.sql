BEGIN;

ALTER TABLE public.team_members
    DROP CONSTRAINT IF EXISTS team_members_access_role_check;
ALTER TABLE public.team_members
    ADD CONSTRAINT team_members_access_role_check
    CHECK (access_role IN ('admin', 'worship_leader', 'worship_team_director', 'member'));

CREATE TABLE IF NOT EXISTS public.app_admins (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_admins ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.app_admins AS admins
        WHERE admins.user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.has_team_role(p_team_id uuid, p_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT public.is_app_admin() OR EXISTS (
        SELECT 1
        FROM public.team_members AS tm
        JOIN public.teams AS t ON t.id = tm.team_id
        WHERE tm.team_id = p_team_id
          AND tm.user_id = auth.uid()
          AND tm.membership_status = 'active'
          AND t.is_active
          AND tm.access_role = ANY (p_roles)
    );
$$;

DROP POLICY IF EXISTS team_members_insert_by_worship_leader
    ON public.team_members;
CREATE POLICY team_members_insert_by_worship_leader
ON public.team_members FOR INSERT TO authenticated
WITH CHECK (
    public.has_team_role(team_id, ARRAY['worship_leader']::text[])
    AND access_role IN ('member', 'worship_team_director')
    AND membership_status = 'active'
    AND practice_sharing_enabled = false
);

DROP TRIGGER IF EXISTS team_members_guard_admin_fields ON public.team_members;

DO $$
DECLARE
    table_name text;
BEGIN
    FOR table_name IN
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format(
            'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
            table_name
        );
        EXECUTE format(
            'DROP POLICY IF EXISTS app_admin_all ON public.%I',
            table_name
        );
        EXECUTE format(
            'CREATE POLICY app_admin_all ON public.%I
             FOR ALL TO authenticated
             USING (public.is_app_admin())
             WITH CHECK (public.is_app_admin())',
            table_name
        );
        EXECUTE format(
            'GRANT ALL PRIVILEGES ON TABLE public.%I TO authenticated',
            table_name
        );
    END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.is_app_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_app_admin() TO authenticated;
DO $$
DECLARE
    updated_rows integer;
    target_user_id constant uuid := 'e5d9fc56-5f78-4b18-a137-51891d420df6';
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM auth.users AS au
        WHERE au.id = target_user_id
          AND lower(au.email) = lower('allan.registos@gmail.com')
    ) THEN
        RAISE EXCEPTION
            'Admin bootstrap stopped: the specified Auth user ID and email do not match.';
    END IF;

    INSERT INTO public.app_admins (user_id)
    VALUES (target_user_id)
    ON CONFLICT (user_id) DO NOTHING;

    UPDATE public.team_members
    SET access_role = 'admin',
        updated_at = now()
    WHERE user_id = target_user_id
      AND membership_status = 'active';
    GET DIAGNOSTICS updated_rows = ROW_COUNT;

    IF updated_rows = 0 THEN
        RAISE EXCEPTION
            'Admin bootstrap stopped: the Auth user must first have an active team membership.';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_team_member_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF public.is_app_admin() THEN
        RETURN NEW;
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.team_id IS DISTINCT FROM OLD.team_id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.access_role IS DISTINCT FROM OLD.access_role
       OR NEW.musical_roles IS DISTINCT FROM OLD.musical_roles
       OR NEW.membership_status IS DISTINCT FROM OLD.membership_status
       OR NEW.date_joined IS DISTINCT FROM OLD.date_joined
       OR NEW.practice_sharing_consent_at IS DISTINCT FROM OLD.practice_sharing_consent_at
       OR NEW.practice_sharing_consent_version IS DISTINCT FROM OLD.practice_sharing_consent_version
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN
        RAISE EXCEPTION 'Only an application admin can change team membership or role fields.';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_team_member_updates()
    FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS team_members_guard_admin_fields ON public.team_members;
CREATE TRIGGER team_members_guard_admin_fields
BEFORE UPDATE ON public.team_members
FOR EACH ROW EXECUTE FUNCTION public.guard_team_member_updates();

CREATE OR REPLACE FUNCTION public.register_app_admin_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.access_role = 'admin' AND public.is_app_admin() THEN
        INSERT INTO public.app_admins (user_id)
        VALUES (NEW.user_id)
        ON CONFLICT (user_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.register_app_admin_membership()
    FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS team_members_register_app_admin ON public.team_members;
CREATE TRIGGER team_members_register_app_admin
AFTER INSERT OR UPDATE ON public.team_members
FOR EACH ROW EXECUTE FUNCTION public.register_app_admin_membership();

NOTIFY pgrst, 'reload schema';

COMMIT;
