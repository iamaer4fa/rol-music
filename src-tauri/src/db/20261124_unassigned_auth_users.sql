BEGIN;

CREATE OR REPLACE FUNCTION public.list_unassigned_auth_users(p_team_id uuid)
RETURNS TABLE (
    user_id uuid,
    email text,
    display_name text,
    created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        au.id,
        au.email::text,
        COALESCE(
            au.raw_user_meta_data ->> 'full_name',
            au.raw_user_meta_data ->> 'name',
            au.email
        )::text,
        au.created_at
    FROM auth.users AS au
    WHERE public.has_team_role(
        p_team_id,
        ARRAY['worship_leader']::text[]
    )
      AND NOT EXISTS (
          SELECT 1
          FROM public.team_members AS tm
          WHERE tm.user_id = au.id
      )
    ORDER BY au.created_at DESC
    LIMIT 1000;
$$;

REVOKE ALL ON FUNCTION public.list_unassigned_auth_users(uuid)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_unassigned_auth_users(uuid)
    TO authenticated;

COMMIT;
