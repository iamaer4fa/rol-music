BEGIN;

CREATE TABLE public.teams (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(255) NOT NULL,
    description text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name varchar(255),
    profile_image varchar(255),
    preferred_instrument varchar(255),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.team_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    access_role varchar(50) NOT NULL DEFAULT 'member'
        CHECK (access_role IN ('worship_leader', 'worship_team_director', 'member')),
    musical_roles jsonb NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(musical_roles) = 'array'),
    membership_status varchar(50) NOT NULL DEFAULT 'active'
        CHECK (membership_status IN ('active', 'inactive', 'invited')),
    date_joined timestamptz NOT NULL DEFAULT now(),
    practice_sharing_enabled boolean NOT NULL DEFAULT false,
    practice_sharing_consent_at timestamptz,
    practice_sharing_consent_version varchar(50),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (team_id, user_id)
);

CREATE TABLE public.team_settings (
    team_id uuid PRIMARY KEY REFERENCES public.teams(id) ON DELETE CASCADE,
    iana_timezone varchar(50) NOT NULL DEFAULT 'Asia/Manila',
    week_starts_on integer NOT NULL DEFAULT 1 CHECK (week_starts_on BETWEEN 1 AND 7),
    service_day_of_week integer NOT NULL DEFAULT 7 CHECK (service_day_of_week BETWEEN 1 AND 7),
    service_cutoff_time time NOT NULL DEFAULT '09:00:00',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.songs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    title varchar(255) NOT NULL,
    artist varchar(255),
    key_signature varchar(50) DEFAULT 'C',
    tempo_bpm integer CHECK (tempo_bpm IS NULL OR tempo_bpm > 0),
    time_signature varchar(20) DEFAULT '4/4',
    chordpro_lyrics text NOT NULL,
    song_notes text,
    created_by uuid DEFAULT auth.uid()
        REFERENCES public.profiles(id) ON DELETE SET NULL,
    revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, team_id)
);

CREATE TABLE public.song_arrangements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id uuid NOT NULL,
    song_id uuid NOT NULL,
    arrangement_name varchar(255) NOT NULL,
    key varchar(50) DEFAULT 'C',
    capo_position integer NOT NULL DEFAULT 0 CHECK (capo_position >= 0),
    tempo_override integer CHECK (tempo_override IS NULL OR tempo_override > 0),
    time_signature_override varchar(20),
    performance_notes text,
    created_by uuid DEFAULT auth.uid()
        REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, song_id, team_id),
    FOREIGN KEY (song_id, team_id)
        REFERENCES public.songs(id, team_id) ON DELETE CASCADE
);

CREATE TABLE public.song_media (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id uuid NOT NULL,
    song_id uuid NOT NULL,
    media_type varchar(50) NOT NULL,
    external_url varchar(500),
    local_file_reference varchar(500),
    attribution varchar(500),
    description varchar(255),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (song_id, team_id)
        REFERENCES public.songs(id, team_id) ON DELETE CASCADE
);

CREATE TABLE public.song_tags (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tag_name varchar(50) NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.songs_tags (
    team_id uuid NOT NULL,
    song_id uuid NOT NULL,
    tag_id uuid NOT NULL REFERENCES public.song_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (song_id, tag_id),
    FOREIGN KEY (song_id, team_id)
        REFERENCES public.songs(id, team_id) ON DELETE CASCADE
);

CREATE TABLE public.lineups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    service_date date NOT NULL,
    service_title varchar(255),
    status varchar(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'archived')),
    created_by uuid DEFAULT auth.uid()
        REFERENCES public.profiles(id) ON DELETE SET NULL,
    published_at timestamptz,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, team_id)
);

CREATE TABLE public.lineup_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id uuid NOT NULL,
    lineup_id uuid NOT NULL,
    song_id uuid NOT NULL,
    position integer NOT NULL CHECK (position > 0),
    selected_arrangement_id uuid REFERENCES public.song_arrangements(id) ON DELETE SET NULL,
    key_override varchar(50),
    tempo_override integer CHECK (tempo_override IS NULL OR tempo_override > 0),
    transition_notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (lineup_id, team_id)
        REFERENCES public.lineups(id, team_id) ON DELETE CASCADE,
    FOREIGN KEY (song_id, team_id)
        REFERENCES public.songs(id, team_id) ON DELETE CASCADE
);

CREATE TABLE public.team_posts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    author_id uuid DEFAULT auth.uid()
        REFERENCES public.profiles(id) ON DELETE SET NULL,
    post_type varchar(50) NOT NULL DEFAULT 'announcement'
        CHECK (post_type IN ('announcement', 'suggestion', 'comment')),
    message_body text NOT NULL,
    parent_post_id uuid,
    song_id uuid REFERENCES public.songs(id) ON DELETE SET NULL,
    lineup_item_id uuid REFERENCES public.lineup_items(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, team_id),
    FOREIGN KEY (parent_post_id, team_id)
        REFERENCES public.team_posts(id, team_id) ON DELETE CASCADE
);

CREATE TABLE public.song_comments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id uuid NOT NULL,
    song_id uuid NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
    song_section varchar(100),
    author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    comment_body text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (song_id, team_id)
        REFERENCES public.songs(id, team_id) ON DELETE CASCADE
);

CREATE TABLE public.practice_sessions (
    session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    song_id uuid NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
    arrangement_id uuid REFERENCES public.song_arrangements(id) ON DELETE SET NULL,
    lineup_item_id uuid REFERENCES public.lineup_items(id) ON DELETE SET NULL,
    device_id uuid NOT NULL DEFAULT gen_random_uuid(),
    started_at timestamptz NOT NULL,
    ended_at timestamptz,
    actual_practice_duration_seconds integer NOT NULL DEFAULT 0
        CHECK (actual_practice_duration_seconds >= 0),
    playback_speed numeric(3, 2) NOT NULL DEFAULT 1.0
        CHECK (playback_speed BETWEEN 0.5 AND 2.0),
    loop_start_ms integer CHECK (loop_start_ms IS NULL OR loop_start_ms >= 0),
    loop_end_ms integer CHECK (loop_end_ms IS NULL OR loop_end_ms >= 0),
    loop_repetitions integer NOT NULL DEFAULT 0 CHECK (loop_repetitions >= 0),
    schema_version varchar(20) NOT NULL DEFAULT '1.0',
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (ended_at IS NULL OR ended_at >= started_at),
    CHECK (
        loop_start_ms IS NULL OR loop_end_ms IS NULL OR loop_end_ms >= loop_start_ms
    )
);

INSERT INTO public.song_tags (tag_name)
VALUES
    ('Worship'),
    ('Praise'),
    ('Christmas'),
    ('Easter'),
    ('Communion'),
    ('Opening'),
    ('Closing'),
    ('Special Service')
ON CONFLICT (tag_name) DO NOTHING;

CREATE INDEX team_members_user_team_status_idx
    ON public.team_members (user_id, team_id, membership_status);
CREATE INDEX songs_team_active_title_idx
    ON public.songs (team_id, is_active, title);
CREATE INDEX song_arrangements_team_song_idx
    ON public.song_arrangements (team_id, song_id);
CREATE INDEX song_media_team_song_idx
    ON public.song_media (team_id, song_id);
CREATE INDEX songs_tags_team_song_idx
    ON public.songs_tags (team_id, song_id);
CREATE INDEX lineups_team_date_idx
    ON public.lineups (team_id, service_date DESC);
CREATE INDEX lineup_items_team_lineup_position_idx
    ON public.lineup_items (team_id, lineup_id, position);
CREATE INDEX team_posts_team_created_idx
    ON public.team_posts (team_id, created_at DESC);
CREATE INDEX song_comments_team_song_created_idx
    ON public.song_comments (team_id, song_id, created_at DESC);
CREATE INDEX practice_sessions_team_user_started_idx
    ON public.practice_sessions (team_id, user_id, started_at DESC);

CREATE FUNCTION public.is_active_team_member(p_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.team_members AS tm
        JOIN public.teams AS t ON t.id = tm.team_id
        WHERE tm.team_id = p_team_id
          AND tm.user_id = auth.uid()
          AND tm.membership_status = 'active'
          AND t.is_active
    );
$$;

CREATE FUNCTION public.has_team_role(p_team_id uuid, p_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
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

CREATE FUNCTION public.shares_active_team_with(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.team_members AS mine
        JOIN public.team_members AS theirs ON theirs.team_id = mine.team_id
        JOIN public.teams AS t ON t.id = mine.team_id
        WHERE mine.user_id = auth.uid()
          AND mine.membership_status = 'active'
          AND theirs.user_id = p_user_id
          AND theirs.membership_status = 'active'
          AND t.is_active
    );
$$;

CREATE FUNCTION public.can_read_practice_session(p_team_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        (
            p_user_id = auth.uid()
            AND public.is_active_team_member(p_team_id)
        )
        OR (
            public.has_team_role(
                p_team_id,
                ARRAY['worship_leader', 'worship_team_director']::text[]
            )
            AND EXISTS (
                SELECT 1
                FROM public.team_members AS tm
                WHERE tm.team_id = p_team_id
                  AND tm.user_id = p_user_id
                  AND tm.membership_status = 'active'
                  AND tm.practice_sharing_enabled
            )
        );
$$;

CREATE FUNCTION public.can_insert_practice_session(
    p_team_id uuid,
    p_user_id uuid,
    p_song_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT p_user_id = auth.uid()
       AND public.is_active_team_member(p_team_id)
       AND EXISTS (
           SELECT 1
           FROM public.team_members AS tm
           WHERE tm.team_id = p_team_id
             AND tm.user_id = auth.uid()
             AND tm.membership_status = 'active'
             AND tm.practice_sharing_enabled
       )
       AND EXISTS (
           SELECT 1
           FROM public.songs AS s
           WHERE s.id = p_song_id
             AND s.team_id = p_team_id
       );
$$;

CREATE FUNCTION public.set_practice_sharing_consent()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NEW.practice_sharing_enabled AND NOT OLD.practice_sharing_enabled THEN
        NEW.practice_sharing_consent_at := now();
        NEW.practice_sharing_consent_version := '1.0';
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.is_active_team_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_team_role(uuid, text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shares_active_team_with(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_read_practice_session(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_insert_practice_session(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_practice_sharing_consent() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.is_active_team_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_team_role(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shares_active_team_with(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_practice_session(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_insert_practice_session(uuid, uuid, uuid) TO authenticated;

CREATE TRIGGER team_members_set_practice_sharing_consent
BEFORE UPDATE OF practice_sharing_enabled ON public.team_members
FOR EACH ROW EXECUTE FUNCTION public.set_practice_sharing_consent();

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.song_arrangements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.song_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.song_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.songs_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lineups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lineup_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.song_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY teams_select_active_members
ON public.teams FOR SELECT TO authenticated
USING (public.is_active_team_member(id));

CREATE POLICY profiles_select_self_or_teammates
ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid() OR public.shares_active_team_with(id));

CREATE POLICY profiles_insert_self
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (id = auth.uid());

CREATE POLICY profiles_update_self
ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

CREATE POLICY team_members_select_self_or_leadership
ON public.team_members FOR SELECT TO authenticated
USING (
    user_id = auth.uid()
    OR public.has_team_role(
        team_id,
        ARRAY['worship_leader', 'worship_team_director']::text[]
    )
);

CREATE POLICY team_members_update_own_sharing
ON public.team_members FOR UPDATE TO authenticated
USING (user_id = auth.uid() AND membership_status = 'active')
WITH CHECK (user_id = auth.uid() AND membership_status = 'active');

CREATE POLICY team_settings_select_team
ON public.team_settings FOR SELECT TO authenticated
USING (public.is_active_team_member(team_id));

CREATE POLICY team_settings_update_leader
ON public.team_settings FOR UPDATE TO authenticated
USING (public.has_team_role(team_id, ARRAY['worship_leader']::text[]))
WITH CHECK (public.has_team_role(team_id, ARRAY['worship_leader']::text[]));

CREATE POLICY songs_select_team
ON public.songs FOR SELECT TO authenticated
USING (
    public.is_active_team_member(team_id)
    AND (
        is_active
        OR public.has_team_role(
            team_id,
            ARRAY['worship_leader', 'worship_team_director']::text[]
        )
    )
);

CREATE POLICY songs_insert_leader
ON public.songs FOR INSERT TO authenticated
WITH CHECK (
    public.has_team_role(team_id, ARRAY['worship_leader']::text[])
    AND created_by = auth.uid()
);

CREATE POLICY songs_update_leader
ON public.songs FOR UPDATE TO authenticated
USING (public.has_team_role(team_id, ARRAY['worship_leader']::text[]))
WITH CHECK (public.has_team_role(team_id, ARRAY['worship_leader']::text[]));

CREATE POLICY songs_delete_leader
ON public.songs FOR DELETE TO authenticated
USING (public.has_team_role(team_id, ARRAY['worship_leader']::text[]));

CREATE POLICY song_arrangements_select_team
ON public.song_arrangements FOR SELECT TO authenticated
USING (public.is_active_team_member(team_id));

CREATE POLICY song_arrangements_insert_leader
ON public.song_arrangements FOR INSERT TO authenticated
WITH CHECK (
    public.has_team_role(team_id, ARRAY['worship_leader']::text[])
    AND created_by = auth.uid()
);

CREATE POLICY song_arrangements_update_leader
ON public.song_arrangements FOR UPDATE TO authenticated
USING (public.has_team_role(team_id, ARRAY['worship_leader']::text[]))
WITH CHECK (public.has_team_role(team_id, ARRAY['worship_leader']::text[]));

CREATE POLICY song_arrangements_delete_leader
ON public.song_arrangements FOR DELETE TO authenticated
USING (public.has_team_role(team_id, ARRAY['worship_leader']::text[]));

CREATE POLICY song_media_select_team
ON public.song_media FOR SELECT TO authenticated
USING (public.is_active_team_member(team_id));

CREATE POLICY song_media_insert_leader
ON public.song_media FOR INSERT TO authenticated
WITH CHECK (public.has_team_role(team_id, ARRAY['worship_leader']::text[]));

CREATE POLICY song_media_update_leader
ON public.song_media FOR UPDATE TO authenticated
USING (public.has_team_role(team_id, ARRAY['worship_leader']::text[]))
WITH CHECK (public.has_team_role(team_id, ARRAY['worship_leader']::text[]));

CREATE POLICY song_media_delete_leader
ON public.song_media FOR DELETE TO authenticated
USING (public.has_team_role(team_id, ARRAY['worship_leader']::text[]));

CREATE POLICY song_tags_select_authenticated
ON public.song_tags FOR SELECT TO authenticated
USING (true);

CREATE POLICY songs_tags_select_team
ON public.songs_tags FOR SELECT TO authenticated
USING (public.is_active_team_member(team_id));

CREATE POLICY songs_tags_insert_leader
ON public.songs_tags FOR INSERT TO authenticated
WITH CHECK (public.has_team_role(team_id, ARRAY['worship_leader']::text[]));

CREATE POLICY songs_tags_delete_leader
ON public.songs_tags FOR DELETE TO authenticated
USING (public.has_team_role(team_id, ARRAY['worship_leader']::text[]));

CREATE POLICY lineups_select_team
ON public.lineups FOR SELECT TO authenticated
USING (
    public.is_active_team_member(team_id)
    AND (
        status = 'published'
        OR public.has_team_role(
            team_id,
            ARRAY['worship_leader', 'worship_team_director']::text[]
        )
    )
);

CREATE POLICY lineups_insert_leader
ON public.lineups FOR INSERT TO authenticated
WITH CHECK (
    public.has_team_role(team_id, ARRAY['worship_leader']::text[])
    AND created_by = auth.uid()
);

CREATE POLICY lineups_update_leader
ON public.lineups FOR UPDATE TO authenticated
USING (public.has_team_role(team_id, ARRAY['worship_leader']::text[]))
WITH CHECK (public.has_team_role(team_id, ARRAY['worship_leader']::text[]));

CREATE POLICY lineups_delete_leader
ON public.lineups FOR DELETE TO authenticated
USING (public.has_team_role(team_id, ARRAY['worship_leader']::text[]));

CREATE POLICY lineup_items_select_visible_lineup
ON public.lineup_items FOR SELECT TO authenticated
USING (
    public.is_active_team_member(team_id)
    AND EXISTS (
        SELECT 1
        FROM public.lineups AS l
        WHERE l.id = lineup_id
          AND l.team_id = lineup_items.team_id
          AND (
              l.status = 'published'
              OR public.has_team_role(
                  l.team_id,
                  ARRAY['worship_leader', 'worship_team_director']::text[]
              )
          )
    )
);

CREATE POLICY lineup_items_insert_leader
ON public.lineup_items FOR INSERT TO authenticated
WITH CHECK (
    public.has_team_role(team_id, ARRAY['worship_leader']::text[])
    AND (
        selected_arrangement_id IS NULL
        OR EXISTS (
            SELECT 1
            FROM public.song_arrangements AS sa
            WHERE sa.id = selected_arrangement_id
              AND sa.song_id = lineup_items.song_id
              AND sa.team_id = lineup_items.team_id
        )
    )
);

CREATE POLICY lineup_items_update_leader
ON public.lineup_items FOR UPDATE TO authenticated
USING (public.has_team_role(team_id, ARRAY['worship_leader']::text[]))
WITH CHECK (
    public.has_team_role(team_id, ARRAY['worship_leader']::text[])
    AND (
        selected_arrangement_id IS NULL
        OR EXISTS (
            SELECT 1
            FROM public.song_arrangements AS sa
            WHERE sa.id = selected_arrangement_id
              AND sa.song_id = lineup_items.song_id
              AND sa.team_id = lineup_items.team_id
        )
    )
);

CREATE POLICY lineup_items_delete_leader
ON public.lineup_items FOR DELETE TO authenticated
USING (public.has_team_role(team_id, ARRAY['worship_leader']::text[]));

CREATE POLICY team_posts_select_team
ON public.team_posts FOR SELECT TO authenticated
USING (public.is_active_team_member(team_id));

CREATE POLICY team_posts_insert_member_content
ON public.team_posts FOR INSERT TO authenticated
WITH CHECK (
    author_id = auth.uid()
    AND public.is_active_team_member(team_id)
    AND (
        (
            post_type = 'announcement'
            AND public.has_team_role(team_id, ARRAY['worship_leader']::text[])
        )
        OR post_type IN ('suggestion', 'comment')
    )
    AND (
        song_id IS NULL
        OR EXISTS (
            SELECT 1 FROM public.songs AS s
            WHERE s.id = team_posts.song_id AND s.team_id = team_posts.team_id
        )
    )
    AND (
        lineup_item_id IS NULL
        OR EXISTS (
            SELECT 1 FROM public.lineup_items AS li
            WHERE li.id = team_posts.lineup_item_id
              AND li.team_id = team_posts.team_id
        )
    )
    AND (
        parent_post_id IS NULL
        OR EXISTS (
            SELECT 1 FROM public.team_posts AS parent
            WHERE parent.id = team_posts.parent_post_id
              AND parent.team_id = team_posts.team_id
        )
    )
);

CREATE POLICY team_posts_update_author_or_leader
ON public.team_posts FOR UPDATE TO authenticated
USING (
    public.has_team_role(team_id, ARRAY['worship_leader']::text[])
    OR (author_id = auth.uid() AND post_type <> 'announcement')
)
WITH CHECK (
    public.is_active_team_member(team_id)
    AND (
        public.has_team_role(team_id, ARRAY['worship_leader']::text[])
        OR (author_id = auth.uid() AND post_type <> 'announcement')
    )
);

CREATE POLICY team_posts_delete_author_or_leader
ON public.team_posts FOR DELETE TO authenticated
USING (
    public.has_team_role(team_id, ARRAY['worship_leader']::text[])
    OR (author_id = auth.uid() AND post_type <> 'announcement')
);

CREATE POLICY song_comments_select_team
ON public.song_comments FOR SELECT TO authenticated
USING (public.is_active_team_member(team_id));

CREATE POLICY song_comments_insert_self
ON public.song_comments FOR INSERT TO authenticated
WITH CHECK (
    author_id = auth.uid()
    AND public.is_active_team_member(team_id)
    AND EXISTS (
        SELECT 1 FROM public.songs AS s
        WHERE s.id = song_comments.song_id AND s.team_id = song_comments.team_id
    )
);

CREATE POLICY song_comments_update_author
ON public.song_comments FOR UPDATE TO authenticated
USING (author_id = auth.uid() AND public.is_active_team_member(team_id))
WITH CHECK (author_id = auth.uid() AND public.is_active_team_member(team_id));

CREATE POLICY song_comments_delete_author_or_leader
ON public.song_comments FOR DELETE TO authenticated
USING (
    author_id = auth.uid()
    OR public.has_team_role(team_id, ARRAY['worship_leader']::text[])
);

CREATE POLICY practice_sessions_select_self_or_consented_leadership
ON public.practice_sessions FOR SELECT TO authenticated
USING (public.can_read_practice_session(team_id, user_id));

CREATE POLICY practice_sessions_insert_consented_self
ON public.practice_sessions FOR INSERT TO authenticated
WITH CHECK (
    public.can_insert_practice_session(team_id, user_id, song_id)
    AND (
        arrangement_id IS NULL
        OR EXISTS (
            SELECT 1 FROM public.song_arrangements AS sa
            WHERE sa.id = practice_sessions.arrangement_id
              AND sa.song_id = practice_sessions.song_id
              AND sa.team_id = practice_sessions.team_id
        )
    )
    AND (
        lineup_item_id IS NULL
        OR EXISTS (
            SELECT 1 FROM public.lineup_items AS li
            WHERE li.id = practice_sessions.lineup_item_id
              AND li.song_id = practice_sessions.song_id
              AND li.team_id = practice_sessions.team_id
        )
    )
);

REVOKE ALL ON TABLE
    public.teams,
    public.profiles,
    public.team_members,
    public.team_settings,
    public.songs,
    public.song_arrangements,
    public.song_media,
    public.song_tags,
    public.songs_tags,
    public.lineups,
    public.lineup_items,
    public.team_posts,
    public.song_comments,
    public.practice_sessions
FROM anon, authenticated;

GRANT SELECT ON public.teams TO authenticated;
GRANT SELECT, INSERT ON public.profiles TO authenticated;
GRANT UPDATE (display_name, profile_image, preferred_instrument)
    ON public.profiles TO authenticated;
GRANT SELECT ON public.team_members TO authenticated;
GRANT UPDATE (practice_sharing_enabled) ON public.team_members TO authenticated;
GRANT SELECT ON public.team_settings TO authenticated;
GRANT UPDATE (iana_timezone, week_starts_on, service_day_of_week, service_cutoff_time)
    ON public.team_settings TO authenticated;

GRANT SELECT, INSERT, DELETE ON public.songs TO authenticated;
GRANT UPDATE (
    title, artist, key_signature, tempo_bpm, time_signature, chordpro_lyrics,
    song_notes, revision, is_active, updated_at
) ON public.songs TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.song_arrangements TO authenticated;
GRANT UPDATE (
    arrangement_name, key, capo_position, tempo_override,
    time_signature_override, performance_notes, updated_at
) ON public.song_arrangements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.song_media TO authenticated;
GRANT SELECT ON public.song_tags TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.songs_tags TO authenticated;

GRANT SELECT, INSERT, DELETE ON public.lineups TO authenticated;
GRANT UPDATE (
    service_date, service_title, status, published_at, version, updated_at
) ON public.lineups TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.lineup_items TO authenticated;
GRANT UPDATE (
    position, selected_arrangement_id, key_override, tempo_override,
    transition_notes, updated_at
) ON public.lineup_items TO authenticated;

GRANT SELECT, INSERT, DELETE ON public.team_posts TO authenticated;
GRANT UPDATE (message_body, updated_at) ON public.team_posts TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.song_comments TO authenticated;
GRANT UPDATE (comment_body, updated_at) ON public.song_comments TO authenticated;

GRANT SELECT, INSERT ON public.practice_sessions TO authenticated;

COMMIT;
