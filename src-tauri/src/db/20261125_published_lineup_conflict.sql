BEGIN;

DO $$
DECLARE
    conflict_row record;
BEGIN
    SELECT
        team_id,
        service_date,
        array_agg(id ORDER BY created_at) AS lineup_ids
    INTO conflict_row
    FROM public.lineups
    WHERE status = 'published'
    GROUP BY team_id, service_date
    HAVING count(*) > 1
    LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION
            'Cannot enforce one published lineup per service date: team %, date %, published lineup IDs %. Archive all but the lineup to keep, then rerun this migration.',
            conflict_row.team_id,
            conflict_row.service_date,
            conflict_row.lineup_ids;
    END IF;
END;
$$;

ALTER TABLE public.lineups
    ADD COLUMN IF NOT EXISTS replaces_lineup_id uuid
    REFERENCES public.lineups(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS lineups_one_published_per_team_date_idx
    ON public.lineups (team_id, service_date)
    WHERE status = 'published';

DROP POLICY IF EXISTS lineups_delete_leader ON public.lineups;
CREATE POLICY lineups_delete_leader
ON public.lineups FOR DELETE TO authenticated
USING (
    public.has_team_role(team_id, ARRAY['worship_leader']::text[])
    AND status IN ('draft', 'published')
);

CREATE OR REPLACE FUNCTION public.publish_lineup(p_lineup_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    candidate public.lineups%ROWTYPE;
    current_published public.lineups%ROWTYPE;
BEGIN
    SELECT *
    INTO candidate
    FROM public.lineups
    WHERE id = p_lineup_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'The lineup was not found.';
    END IF;

    IF NOT public.has_team_role(candidate.team_id, ARRAY['worship_leader']::text[]) THEN
        RAISE EXCEPTION 'Only a Worship Leader can publish a lineup.'
            USING ERRCODE = '42501';
    END IF;

    IF candidate.status <> 'draft' THEN
        RAISE EXCEPTION 'Only a draft lineup can be published.';
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtext(candidate.team_id::text),
        hashtext(candidate.service_date::text)
    );

    SELECT *
    INTO candidate
    FROM public.lineups
    WHERE id = p_lineup_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'The lineup was not found.';
    END IF;

    IF NOT public.has_team_role(candidate.team_id, ARRAY['worship_leader']::text[]) THEN
        RAISE EXCEPTION 'Only a Worship Leader can publish a lineup.'
            USING ERRCODE = '42501';
    END IF;

    IF candidate.status <> 'draft' THEN
        RAISE EXCEPTION 'Only a draft lineup can be published.';
    END IF;

    SELECT *
    INTO current_published
    FROM public.lineups
    WHERE team_id = candidate.team_id
      AND service_date = candidate.service_date
      AND status = 'published'
    FOR UPDATE;

    IF FOUND THEN
        IF candidate.replaces_lineup_id IS DISTINCT FROM current_published.id THEN
            RAISE EXCEPTION
                'A published lineup already exists for this service date. Create a replacement draft from the published lineup instead of publishing a new lineup.';
        END IF;

        UPDATE public.lineups
        SET status = 'archived',
            updated_at = now()
        WHERE id = current_published.id;

        INSERT INTO public.lineup_change_history (
            team_id,
            lineup_id,
            changed_by,
            action,
            details
        )
        VALUES (
            candidate.team_id,
            current_published.id,
            auth.uid(),
            'archived',
            jsonb_build_object('replaced_by', candidate.id)
        );
    ELSIF candidate.replaces_lineup_id IS NOT NULL THEN
        RAISE EXCEPTION
            'This replacement draft is stale because its original published lineup is no longer current. Create a replacement draft from the currently published lineup.';
    END IF;

    UPDATE public.lineups
    SET status = 'published',
        published_at = now(),
        updated_at = now()
    WHERE id = candidate.id;

    INSERT INTO public.lineup_change_history (
        team_id,
        lineup_id,
        changed_by,
        action,
        details
    )
    VALUES (
        candidate.team_id,
        candidate.id,
        auth.uid(),
        'published',
        jsonb_build_object(
            'service_date', candidate.service_date,
            'version', candidate.version
        )
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_lineup(p_lineup_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    target public.lineups%ROWTYPE;
BEGIN
    SELECT *
    INTO target
    FROM public.lineups
    WHERE id = p_lineup_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'The lineup was not found.';
    END IF;

    IF NOT public.has_team_role(target.team_id, ARRAY['worship_leader']::text[]) THEN
        RAISE EXCEPTION 'Only a Worship Leader can delete a lineup.'
            USING ERRCODE = '42501';
    END IF;

    IF target.status NOT IN ('draft', 'published') THEN
        RAISE EXCEPTION 'Only draft or published lineups can be deleted.';
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtext(target.team_id::text),
        hashtext(target.service_date::text)
    );

    SELECT *
    INTO target
    FROM public.lineups
    WHERE id = p_lineup_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'The lineup was not found.';
    END IF;

    IF NOT public.has_team_role(target.team_id, ARRAY['worship_leader']::text[]) THEN
        RAISE EXCEPTION 'Only a Worship Leader can delete a lineup.'
            USING ERRCODE = '42501';
    END IF;

    IF target.status NOT IN ('draft', 'published') THEN
        RAISE EXCEPTION 'Only draft or published lineups can be deleted.';
    END IF;

    DELETE FROM public.lineups
    WHERE id = target.id;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_lineup(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_lineup(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.delete_lineup(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_lineup(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
