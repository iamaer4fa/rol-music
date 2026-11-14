-- Optional, rerunnable demo catalog for the ROL Worship Team.
-- The hymns are public-domain texts. No practice sessions are fabricated.
BEGIN;

CREATE TEMP TABLE demo_seed_context ON COMMIT DROP AS
SELECT t.id AS team_id, tm.user_id AS leader_id
FROM public.teams AS t
JOIN public.team_members AS tm ON tm.team_id = t.id
JOIN public.profiles AS p ON p.id = tm.user_id
WHERE t.name = 'ROL Worship Team'
  AND tm.access_role = 'worship_leader'
  AND tm.membership_status = 'active';

DO $$
BEGIN
    IF (SELECT count(*) FROM pg_temp.demo_seed_context) <> 1 THEN
        RAISE EXCEPTION
            'Expected exactly one active ROL Worship Team leader with a profile; refusing to seed.';
    END IF;
END;
$$;

WITH demo_songs (
    id, title, key_signature, tempo_bpm, time_signature,
    chordpro_lyrics, song_notes
) AS (
    VALUES
    (
        'd0000000-0000-4000-8000-000000000001'::uuid,
        'Amazing Grace', 'G', 96, '3/4',
        $song1${title: Amazing Grace}
{key: G}
{tempo: 96}
{time: 3/4}

{start_of_verse}
[G]Amazing [G7]grace! how [C]sweet the [G]sound,
[G]That [Em]saved a [D]wretch like [G]me!
[G]I [G7]once was [C]lost, but [G]now am found,
[Em]Was [D]blind, but [G]now I [D]see.
{end_of_verse}

[G]Through [G7]many [C]dangers, [G]toils and snares
[G]I [Em]have al[D]ready [G]come;
[G]’Tis [G7]grace hath [C]brought me [G]safe thus far,
[Em]And [D]grace will [G]lead me [D]home.$song1$,
'Public-domain hymn by John Newton (1779).'
    ),
    (
        'd0000000-0000-4000-8000-000000000002'::uuid,
        'Be Thou My Vision', 'D', 76, '3/4',
        $song2${title: Be Thou My Vision}
{key: D}
{tempo: 76}
{time: 3/4}

{start_of_verse}
[D]Be Thou my [G]Vision, O [D]Lord of my [A]heart;
[Bm]Naught be all [G]else to [D]me, save that [A]Thou [D]art.
[D]Thou my best [G]Thought, by [D]day or by [A]night,
[Bm]Waking or [G]sleeping, Thy [A]presence my [D]light.
{end_of_verse}

[D]Be Thou my [G]Wisdom, and [D]Thou my true [A]Word;
[Bm]I ever with [G]Thee and [D]Thou with me, [A]Lord;
[D]Thou my great [G]Father, I [D]Thy true [A]son;
[Bm]Thou in me [G]dwelling, and [A]I with Thee [D]one.$song2$,
'Public-domain Irish hymn; English translation by Mary E. Byrne (1905).'
    ),
    (
        'd0000000-0000-4000-8000-000000000003'::uuid,
        'Holy, Holy, Holy! Lord God Almighty', 'D', 92, '4/4',
        $song3${title: Holy, Holy, Holy! Lord God Almighty}
{key: D}
{tempo: 92}
{time: 4/4}

{start_of_verse}
[D]Holy, [A]holy, [D]holy! [G]Lord God Al[D]mighty!
[D]Early in the [A]morning our [E7]song shall rise to [A]Thee;
[D]Holy, [A]holy, [D]holy! [G]merciful and [D]mighty,
[G]God in three [D]Persons, [A]blessed [D]Trinity!
{end_of_verse}

[D]Holy, [A]holy, [D]holy! [G]all the saints a[D]dore Thee,
[D]Casting down their [A]golden crowns a[E7]round the glassy [A]sea;
[D]Cherubim and [A]seraphim [D]falling down be[G]fore Thee,
[G]Who wert, and [D]art, and [A]evermore shalt [D]be.$song3$,
'Public-domain hymn by Reginald Heber (1826).'
    ),
    (
        'd0000000-0000-4000-8000-000000000004'::uuid,
        'It Is Well with My Soul', 'C', 76, '4/4',
        $song4${title: It Is Well with My Soul}
{key: C}
{tempo: 76}
{time: 4/4}

{start_of_verse}
[C]When peace like a [F]river at[C]tendeth my [G]way,
[C]When [Am]sorrows like [D7]sea billows [G]roll;
[C]Whatever my [F]lot, Thou hast [C]taught me to [G]say,
[C]It is [F]well, it is [G]well with my [C]soul.
{end_of_verse}

{start_of_chorus}
[C]It is [F]well with my [C]soul,
[Am]It is [D7]well, it is [G]well with my [C]soul.
{end_of_chorus}$song4$,
'Public-domain hymn by Horatio G. Spafford (1873).'
    ),
    (
        'd0000000-0000-4000-8000-000000000005'::uuid,
        'Come, Thou Fount of Every Blessing', 'G', 112, '3/4',
        $song5${title: Come, Thou Fount of Every Blessing}
{key: G}
{tempo: 112}
{time: 3/4}

{start_of_verse}
[G]Come, Thou [D]Fount of every [G]blessing,
[G]Tune my [C]heart to [D]sing Thy [G]grace;
[G]Streams of [D]mercy, never [G]ceasing,
[G]Call for [C]songs of [D]loudest [G]praise.
{end_of_verse}

[G]Teach me [D]some melodious [G]sonnet,
[G]Sung by [C]flaming [D]tongues a[G]bove;
[G]Praise the [D]mount! I'm fixed up[G]on it,
[G]Mount of [C]Thy re[D]deeming [G]love.$song5$,
'Public-domain hymn by Robert Robinson (1758).'
    )
)
INSERT INTO public.songs (
    id, team_id, title, artist, key_signature, tempo_bpm,
    time_signature, chordpro_lyrics, song_notes, created_by
)
SELECT
    demo.id,
    context.team_id,
    demo.title,
    CASE demo.id
        WHEN 'd0000000-0000-4000-8000-000000000001'::uuid THEN 'John Newton (1779)'
        WHEN 'd0000000-0000-4000-8000-000000000002'::uuid THEN 'Irish traditional; trans. Mary E. Byrne (1905)'
        WHEN 'd0000000-0000-4000-8000-000000000003'::uuid THEN 'Reginald Heber (1826)'
        WHEN 'd0000000-0000-4000-8000-000000000004'::uuid THEN 'Horatio G. Spafford (1873)'
        ELSE 'Robert Robinson (1758)'
    END,
    demo.key_signature,
    demo.tempo_bpm,
    demo.time_signature,
    demo.chordpro_lyrics,
    demo.song_notes,
    context.leader_id
FROM demo_songs AS demo
CROSS JOIN pg_temp.demo_seed_context AS context
ON CONFLICT (id) DO UPDATE
SET title = EXCLUDED.title,
    artist = EXCLUDED.artist,
    key_signature = EXCLUDED.key_signature,
    tempo_bpm = EXCLUDED.tempo_bpm,
    time_signature = EXCLUDED.time_signature,
    chordpro_lyrics = EXCLUDED.chordpro_lyrics,
    song_notes = EXCLUDED.song_notes,
    revision = public.songs.revision + 1,
    updated_at = now()
WHERE public.songs.team_id = EXCLUDED.team_id
  AND (
      public.songs.title IS DISTINCT FROM EXCLUDED.title
      OR public.songs.artist IS DISTINCT FROM EXCLUDED.artist
      OR public.songs.key_signature IS DISTINCT FROM EXCLUDED.key_signature
      OR public.songs.tempo_bpm IS DISTINCT FROM EXCLUDED.tempo_bpm
      OR public.songs.time_signature IS DISTINCT FROM EXCLUDED.time_signature
      OR public.songs.chordpro_lyrics IS DISTINCT FROM EXCLUDED.chordpro_lyrics
      OR public.songs.song_notes IS DISTINCT FROM EXCLUDED.song_notes
  );

DELETE FROM public.songs_tags AS link
USING pg_temp.demo_seed_context AS context
WHERE link.team_id = context.team_id
  AND link.song_id IN (
      'd0000000-0000-4000-8000-000000000001'::uuid,
      'd0000000-0000-4000-8000-000000000002'::uuid,
      'd0000000-0000-4000-8000-000000000003'::uuid,
      'd0000000-0000-4000-8000-000000000004'::uuid,
      'd0000000-0000-4000-8000-000000000005'::uuid
  );

INSERT INTO public.songs_tags (team_id, song_id, tag_id)
SELECT context.team_id, song.id, tag.id
FROM pg_temp.demo_seed_context AS context
JOIN public.songs AS song ON song.team_id = context.team_id
JOIN (
    VALUES
        ('d0000000-0000-4000-8000-000000000001'::uuid, 'Closing'),
        ('d0000000-0000-4000-8000-000000000001'::uuid, 'Worship'),
        ('d0000000-0000-4000-8000-000000000002'::uuid, 'Opening'),
        ('d0000000-0000-4000-8000-000000000002'::uuid, 'Worship'),
        ('d0000000-0000-4000-8000-000000000003'::uuid, 'Worship'),
        ('d0000000-0000-4000-8000-000000000003'::uuid, 'Special Service'),
        ('d0000000-0000-4000-8000-000000000004'::uuid, 'Communion'),
        ('d0000000-0000-4000-8000-000000000004'::uuid, 'Worship'),
        ('d0000000-0000-4000-8000-000000000005'::uuid, 'Praise'),
        ('d0000000-0000-4000-8000-000000000005'::uuid, 'Worship')
) AS demo_tags(song_id, tag_name)
  ON demo_tags.song_id = song.id
JOIN public.song_tags AS tag ON tag.tag_name = demo_tags.tag_name
ON CONFLICT (song_id, tag_id) DO NOTHING;

INSERT INTO public.song_arrangements (
    id, team_id, song_id, arrangement_name, key, capo_position,
    tempo_override, performance_notes, created_by
)
SELECT
    demo.id,
    context.team_id,
demo.song_id,
    demo.arrangement_name,
    demo.arrangement_key,
    demo.capo_position,
    demo.tempo_override,
    demo.performance_notes,
    context.leader_id
FROM pg_temp.demo_seed_context AS context
JOIN (
    VALUES
    ('d1000000-0000-4000-8000-000000000001'::uuid, 'd0000000-0000-4000-8000-000000000001'::uuid, 'Full band', 'G', 0, 96, 'A steady, singable 3/4 hymn arrangement.'),
    ('d1000000-0000-4000-8000-000000000002'::uuid, 'd0000000-0000-4000-8000-000000000001'::uuid, 'Acoustic', 'D', 0, 82, 'Gentle acoustic strum; leave space between verses.'),
    ('d1000000-0000-4000-8000-000000000003'::uuid, 'd0000000-0000-4000-8000-000000000002'::uuid, 'Piano and voices', 'D', 0, 76, 'Quiet 3/4 feel with a clear vocal melody.'),
    ('d1000000-0000-4000-8000-000000000004'::uuid, 'd0000000-0000-4000-8000-000000000003'::uuid, 'Hymn band', 'D', 0, 92, 'Traditional, stately four-beat pulse.'),
    ('d1000000-0000-4000-8000-000000000005'::uuid, 'd0000000-0000-4000-8000-000000000004'::uuid, 'Acoustic', 'C', 0, 76, 'Warm, unhurried accompaniment.'),
    ('d1000000-0000-4000-8000-000000000006'::uuid, 'd0000000-0000-4000-8000-000000000005'::uuid, 'Full band', 'G', 0, 112, 'Bright 3/4 arrangement; keep the melody prominent.')
) AS demo(id, song_id, arrangement_name, arrangement_key, capo_position, tempo_override, performance_notes)
ON true
ON CONFLICT (id) DO UPDATE
SET team_id = EXCLUDED.team_id,
song_id = EXCLUDED.song_id,
arrangement_name = EXCLUDED.arrangement_name,
key = EXCLUDED.key,
capo_position = EXCLUDED.capo_position,
tempo_override = EXCLUDED.tempo_override,
performance_notes = EXCLUDED.performance_notes,
updated_at = now()
WHERE public.song_arrangements.team_id = EXCLUDED.team_id
  AND (
  public.song_arrangements.song_id IS DISTINCT FROM EXCLUDED.song_id
  OR public.song_arrangements.arrangement_name IS DISTINCT FROM EXCLUDED.arrangement_name
  OR public.song_arrangements.key IS DISTINCT FROM EXCLUDED.key
  OR public.song_arrangements.capo_position IS DISTINCT FROM EXCLUDED.capo_position
  OR public.song_arrangements.tempo_override IS DISTINCT FROM EXCLUDED.tempo_override
  OR public.song_arrangements.performance_notes IS DISTINCT FROM EXCLUDED.performance_notes
  );

INSERT INTO public.lineups (
    id, team_id, service_date, service_title, status, created_by, published_at
)
SELECT
    'd2000000-0000-4000-8000-000000000001'::uuid,
    context.team_id,
    service.service_date,
    'Demo Sunday Hymns - ' || service.service_date::text,
    'published',
    context.leader_id,
    now()
FROM pg_temp.demo_seed_context AS context
CROSS JOIN (
    SELECT CURRENT_DATE
        + ((7 - EXTRACT(ISODOW FROM CURRENT_DATE)::integer) % 7) AS service_date
) AS service
ON CONFLICT (id) DO UPDATE
SET service_date = EXCLUDED.service_date,
    service_title = EXCLUDED.service_title,
    status = EXCLUDED.status,
    created_by = EXCLUDED.created_by,
    published_at = EXCLUDED.published_at,
    updated_at = now()
WHERE public.lineups.team_id = EXCLUDED.team_id;

INSERT INTO public.lineup_items (
    id, team_id, lineup_id, song_id, position, selected_arrangement_id, transition_notes
)
SELECT
    demo.item_id,
    context.team_id,
    'd2000000-0000-4000-8000-000000000001'::uuid,
    demo.song_id,
    demo.position,
    demo.arrangement_id,
    demo.transition_notes
FROM pg_temp.demo_seed_context AS context
JOIN (
    VALUES
        ('d3000000-0000-4000-8000-000000000001'::uuid, 'd0000000-0000-4000-8000-000000000001'::uuid, 'd1000000-0000-4000-8000-000000000001'::uuid, 1, 'Begin with a short instrumental introduction.'),
        ('d3000000-0000-4000-8000-000000000002'::uuid, 'd0000000-0000-4000-8000-000000000003'::uuid, 'd1000000-0000-4000-8000-000000000004'::uuid, 2, 'Keep the hymn stately and let the voices lead.'),
        ('d3000000-0000-4000-8000-000000000003'::uuid, 'd0000000-0000-4000-8000-000000000002'::uuid, 'd1000000-0000-4000-8000-000000000003'::uuid, 3, 'Allow a brief pause before the first verse.'),
        ('d3000000-0000-4000-8000-000000000004'::uuid, 'd0000000-0000-4000-8000-000000000004'::uuid, 'd1000000-0000-4000-8000-000000000005'::uuid, 4, 'End quietly; no additional repeat.')
) AS demo(item_id, song_id, arrangement_id, position, transition_notes)
ON true
ON CONFLICT (id) DO UPDATE
SET team_id = EXCLUDED.team_id,
    lineup_id = EXCLUDED.lineup_id,
    song_id = EXCLUDED.song_id,
    position = EXCLUDED.position,
    selected_arrangement_id = EXCLUDED.selected_arrangement_id,
    transition_notes = EXCLUDED.transition_notes,
    updated_at = now()
WHERE public.lineup_items.team_id = EXCLUDED.team_id;

INSERT INTO public.team_posts (id, team_id, author_id, post_type, message_body)
SELECT
    'd4000000-0000-4000-8000-000000000001'::uuid,
    context.team_id,
    context.leader_id,
    'announcement',
    'Demo catalog is ready with five public-domain hymns, arrangements, and a published lineup. These entries are sample content and can be edited or removed.'
FROM pg_temp.demo_seed_context AS context
ON CONFLICT (id) DO UPDATE
SET message_body = EXCLUDED.message_body,
    updated_at = now()
WHERE public.team_posts.team_id = EXCLUDED.team_id;

INSERT INTO public.song_comments (
    id, team_id, song_id, author_id, song_section, comment_body
)
SELECT
    'd5000000-0000-4000-8000-000000000001'::uuid,
    context.team_id,
    song.id,
    context.leader_id,
    'Verse 1',
    'Demo note: use the D acoustic arrangement if the G version sits too high for the group.'
FROM pg_temp.demo_seed_context AS context
JOIN public.songs AS song
    ON song.team_id = context.team_id
   AND song.id = 'd0000000-0000-4000-8000-000000000001'::uuid
ON CONFLICT (id) DO UPDATE
SET song_id = EXCLUDED.song_id,
    song_section = EXCLUDED.song_section,
    comment_body = EXCLUDED.comment_body,
    updated_at = now()
WHERE public.song_comments.team_id = EXCLUDED.team_id;

COMMIT;
