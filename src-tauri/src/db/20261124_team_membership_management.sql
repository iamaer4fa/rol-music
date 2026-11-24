BEGIN;

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

GRANT INSERT (
    team_id,
    user_id,
    access_role,
    musical_roles,
    membership_status,
    practice_sharing_enabled
) ON public.team_members TO authenticated;

COMMIT;
