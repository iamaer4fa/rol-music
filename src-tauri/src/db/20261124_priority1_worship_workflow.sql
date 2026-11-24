BEGIN;

CREATE TABLE IF NOT EXISTS public.lineup_assignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    lineup_id uuid NOT NULL,
    lineup_item_id uuid NOT NULL,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role_name varchar(100) NOT NULL,
    preparation_status varchar(20) NOT NULL DEFAULT 'pending'
        CHECK (preparation_status IN ('pending', 'ready', 'needs_help')),
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (lineup_item_id, user_id, role_name),
    FOREIGN KEY (lineup_id, team_id)
        REFERENCES public.lineups(id, team_id) ON DELETE CASCADE,
    FOREIGN KEY (lineup_item_id, team_id)
        REFERENCES public.lineup_items(id, team_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS lineup_assignments_team_lineup_idx
    ON public.lineup_assignments(team_id, lineup_id);

CREATE TABLE IF NOT EXISTS public.lineup_change_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    lineup_id uuid NOT NULL,
    changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    action varchar(50) NOT NULL,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (lineup_id, team_id)
        REFERENCES public.lineups(id, team_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS lineup_change_history_team_lineup_idx
    ON public.lineup_change_history(team_id, lineup_id, created_at DESC);

ALTER TABLE public.lineup_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lineup_change_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lineup_assignments_team_access ON public.lineup_assignments;
CREATE POLICY lineup_assignments_team_access ON public.lineup_assignments
    FOR ALL TO authenticated
    USING (public.is_active_team_member(team_id))
    WITH CHECK (
        public.is_active_team_member(team_id)
        AND (public.has_team_role(team_id, ARRAY['worship_leader', 'worship_team_director'])
             OR auth.uid() = user_id)
    );

DROP POLICY IF EXISTS lineup_change_history_team_access ON public.lineup_change_history;
CREATE POLICY lineup_change_history_team_access ON public.lineup_change_history
    FOR SELECT TO authenticated
    USING (public.is_active_team_member(team_id));

DROP POLICY IF EXISTS lineup_change_history_leader_insert ON public.lineup_change_history;
CREATE POLICY lineup_change_history_leader_insert ON public.lineup_change_history
    FOR INSERT TO authenticated
    WITH CHECK (
        public.is_active_team_member(team_id)
        AND public.has_team_role(team_id, ARRAY['worship_leader', 'worship_team_director'])
    );

COMMIT;
