-- Apply after 20241111_initial_schema.sql. This preserves team-scoped reads
-- while allowing active members to contribute arrangements and song media.

BEGIN;

DROP POLICY IF EXISTS song_arrangements_insert_leader
ON public.song_arrangements;

CREATE POLICY song_arrangements_insert_team_member
ON public.song_arrangements FOR INSERT TO authenticated
WITH CHECK (
    public.is_active_team_member(team_id)
    AND created_by = auth.uid()
);

DROP POLICY IF EXISTS song_media_insert_leader
ON public.song_media;

CREATE POLICY song_media_insert_team_member
ON public.song_media FOR INSERT TO authenticated
WITH CHECK (public.is_active_team_member(team_id));

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('team-audio', 'team-audio', false, 104857600)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = false,
    file_size_limit = EXCLUDED.file_size_limit;

CREATE POLICY team_audio_select_member
ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'team-audio'
    AND EXISTS (
        SELECT 1
        FROM public.songs s
        WHERE s.team_id::text = (storage.foldername(name))[1]
          AND s.id::text = (storage.foldername(name))[2]
          AND public.is_active_team_member(s.team_id)
    )
);

CREATE POLICY team_audio_insert_member
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'team-audio'
    AND COALESCE(metadata->>'mimetype', '') LIKE 'audio/%'
    AND EXISTS (
        SELECT 1
        FROM public.songs s
        WHERE s.team_id::text = (storage.foldername(name))[1]
          AND s.id::text = (storage.foldername(name))[2]
          AND public.is_active_team_member(s.team_id)
    )
);

CREATE POLICY team_audio_delete_owner
ON storage.objects FOR DELETE TO authenticated
USING (
    bucket_id = 'team-audio'
    AND owner_id = auth.uid()::text
    AND EXISTS (
        SELECT 1
        FROM public.songs s
        WHERE s.team_id::text = (storage.foldername(name))[1]
          AND s.id::text = (storage.foldername(name))[2]
          AND public.is_active_team_member(s.team_id)
    )
);

COMMIT;
