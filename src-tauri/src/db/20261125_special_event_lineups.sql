BEGIN;

ALTER TABLE public.lineups
    ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'worship_service';

UPDATE public.lineups
SET event_type = 'worship_service'
WHERE event_type IS NULL;

ALTER TABLE public.lineups
    ALTER COLUMN event_type SET DEFAULT 'worship_service',
    ALTER COLUMN event_type SET NOT NULL;

GRANT UPDATE (event_type, replaces_lineup_id) ON public.lineups TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_published_lineup_event_type_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF OLD.status <> 'draft' AND NEW.event_type IS DISTINCT FROM OLD.event_type THEN
        RAISE EXCEPTION 'Published lineup type cannot be changed. Create a replacement draft.';
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_published_lineup_event_type_change()
    FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS lineups_prevent_published_event_type_change ON public.lineups;
CREATE TRIGGER lineups_prevent_published_event_type_change
BEFORE UPDATE OF event_type ON public.lineups
FOR EACH ROW EXECUTE FUNCTION public.prevent_published_lineup_event_type_change();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.lineups'::regclass
          AND conname = 'lineups_event_type_check'
    ) THEN
        ALTER TABLE public.lineups
            ADD CONSTRAINT lineups_event_type_check
            CHECK (event_type IN ('worship_service', 'special_event'));
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.lineups'::regclass
          AND conname = 'lineups_special_event_title_check'
    ) THEN
        ALTER TABLE public.lineups
            ADD CONSTRAINT lineups_special_event_title_check
            CHECK (
                event_type <> 'special_event'
                OR NULLIF(btrim(service_title), '') IS NOT NULL
            );
    END IF;
END;
$$;

DO $$
DECLARE
    conflict_row record;
BEGIN
    SELECT
        team_id,
        service_date,
        event_type,
        array_agg(id ORDER BY created_at) AS lineup_ids
    INTO conflict_row
    FROM public.lineups
    WHERE status = 'published'
    GROUP BY team_id, service_date, event_type
    HAVING count(*) > 1
    LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION
            'Cannot enforce one published lineup per event type and date: team %, date %, type %, lineup IDs %.',
            conflict_row.team_id,
            conflict_row.service_date,
            conflict_row.event_type,
            conflict_row.lineup_ids;
    END IF;
END;
$$;

DROP INDEX IF EXISTS public.lineups_one_published_per_team_date_idx;
CREATE UNIQUE INDEX IF NOT EXISTS lineups_one_published_per_team_date_event_idx
    ON public.lineups (team_id, service_date, event_type)
    WHERE status = 'published';

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
      AND event_type = candidate.event_type
      AND status = 'published'
    FOR UPDATE;

    IF FOUND THEN
        IF candidate.replaces_lineup_id IS DISTINCT FROM current_published.id THEN
            RAISE EXCEPTION
                'A published lineup of this type already exists for this date. Create a replacement draft from it instead of publishing a new lineup.';
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
            'event_type', candidate.event_type,
            'version', candidate.version
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.publish_lineup(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_lineup(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
