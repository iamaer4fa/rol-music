-- Optional, rerunnable demo catalog for the ROL Worship Team.
-- All lyrics below are original test material. No practice sessions are fabricated.
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
        'Gather in the Morning', 'G', 96, '4/4',
        $song1${title: Gather in the Morning}
{key: G}
{tempo: 96}
{time: 4/4}

{start_of_verse}
[G]Daylight rests upon the [D]open fields
[Em]Hope is rising with the [C]sound
[G]Side by side we bring the [D]work we carry
[C]Set it gently on the [G]ground
{end_of_verse}

{start_of_chorus}
[G]We will walk this road to[D]gether
[Em]Step by step and [C]heart to heart
[G]When the morning turns to [D]evening
[C]We will make a [D]steadfast [G]start
{end_of_chorus}$song1$,
'Original demo lyrics for catalog, chord, and practice-screen testing.'
    ),
    (
        'd0000000-0000-4000-8000-000000000002'::uuid,
        'Steady River', 'D', 82, '6/8',
        $song2${title: Steady River}
{key: D}
{tempo: 82}
{time: 6/8}

{start_of_verse}
[D]Over stone and [A]through the valley
[Bm]Moving onward, [G]clear and strong
[D]Every bend reveals a [A]new horizon
[G]Every current [A]carries [D]on
{end_of_verse}

{start_of_chorus}
[D]Steady river, [A]lead us
[Bm]Keep our footsteps [G]true
[D]Through the changing [A]seasons
[G]We will travel [A]on with [D]you
{end_of_chorus}$song2$,
'Original demo lyrics in 6/8 for meter and tempo testing.'
    ),
    (
        'd0000000-0000-4000-8000-000000000003'::uuid,
        'Hands of Mercy', 'C', 108, '4/4',
        $song3${title: Hands of Mercy}
{key: C}
{tempo: 108}
{time: 4/4}

{start_of_verse}
[C]When the road is worn and [G]heavy
[Am]When the words are hard to [F]find
[C]There is room to start a[G]gain here
[F]There is shelter for the [C]tired
{end_of_verse}

{start_of_chorus}
[C]Hands of mercy, [G]hearts made open
[Am]Make a place where [F]all belong
[C]Turn our care to [G]acts of kindness
[F]Teach our lives a [G]patient [C]song
{end_of_chorus}$song3$,
'Original demo lyrics; useful for testing a second key and tag filter.'
    ),
    (
        'd0000000-0000-4000-8000-000000000004'::uuid,
        'Open Road of Hope', 'A', 112, '4/4',
        $song4${title: Open Road of Hope}
{key: A}
{tempo: 112}
{time: 4/4}

{start_of_verse}
[A]Pack the courage we have [E]gathered
[F#m]Leave a little room to [D]grow
[A]Every voice can shape the [E]future
[D]Every seed has time to [A]grow
{end_of_verse}

{start_of_chorus}
[A]There is an open road of [E]hope before us
[F#m]There is a song we [D]haven't sung
[A]We will meet the miles to[E]gether
[D]One by one and [E]young by [A]young
{end_of_chorus}$song4$,
'Original demo lyrics for lineup and arrangement testing.'
    ),
    (
        'd0000000-0000-4000-8000-000000000005'::uuid,
        'Quiet Promise', 'E', 72, '3/4',
        $song5${title: Quiet Promise}
{key: E}
{tempo: 72}
{time: 3/4}

{start_of_verse}
[E]Evening folds the [B]day away
[C#m]Rest is near and [A]peace can stay
[E]We will hold the [B]good we found
[A]Till the morning [B]comes a[E]round
{end_of_verse}

{start_of_chorus}
[E]Quiet promise, [B]steady light
[C#m]Guide us gently [A]through the night
[E]When the new day [B]calls us through
[A]We will start a[B]fresh and [E]true
{end_of_chorus}$song5$,
'Original demo lyrics in 3/4 for meter and arrangement testing.'
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
    'ROL Worship Team (Demo)',
    demo.key_signature,
    demo.tempo_bpm,
    demo.time_signature,
    demo.chordpro_lyrics,
    demo.song_notes,
    context.leader_id
FROM demo_songs AS demo
CROSS JOIN pg_temp.demo_seed_context AS context
WHERE NOT EXISTS (
    SELECT 1
    FROM public.songs AS existing
    WHERE existing.team_id = context.team_id
      AND existing.title = demo.title
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.songs_tags (team_id, song_id, tag_id)
SELECT context.team_id, song.id, tag.id
FROM pg_temp.demo_seed_context AS context
JOIN public.songs AS song ON song.team_id = context.team_id
JOIN (
    VALUES
        ('Gather in the Morning', 'Opening'),
        ('Gather in the Morning', 'Worship'),
        ('Steady River', 'Worship'),
        ('Steady River', 'Communion'),
        ('Hands of Mercy', 'Praise'),
        ('Hands of Mercy', 'Worship'),
        ('Open Road of Hope', 'Opening'),
        ('Open Road of Hope', 'Praise'),
        ('Quiet Promise', 'Closing'),
        ('Quiet Promise', 'Worship')
) AS demo_tags(song_title, tag_name) ON demo_tags.song_title = song.title
JOIN public.song_tags AS tag ON tag.tag_name = demo_tags.tag_name
ON CONFLICT (song_id, tag_id) DO NOTHING;

INSERT INTO public.song_arrangements (
    id, team_id, song_id, arrangement_name, key, capo_position,
    tempo_override, performance_notes, created_by
)
SELECT
    demo.id,
    context.team_id,
    song.id,
    demo.arrangement_name,
    demo.arrangement_key,
    demo.capo_position,
    demo.tempo_override,
    demo.performance_notes,
    context.leader_id
FROM pg_temp.demo_seed_context AS context
JOIN (
    VALUES
        ('d1000000-0000-4000-8000-000000000001'::uuid, 'Gather in the Morning', 'Full band', 'G', 0, 96, 'Bright, steady opening.'),
        ('d1000000-0000-4000-8000-000000000002'::uuid, 'Gather in the Morning', 'Acoustic', 'G', 2, 92, 'Light percussion; leave space for the verses.'),
        ('d1000000-0000-4000-8000-000000000003'::uuid, 'Steady River', 'Gentle 6/8', 'D', 0, 82, 'Keep the pulse flowing and even.'),
        ('d1000000-0000-4000-8000-000000000004'::uuid, 'Hands of Mercy', 'Full band', 'C', 0, 108, 'Build gradually into the chorus.'),
        ('d1000000-0000-4000-8000-000000000005'::uuid, 'Open Road of Hope', 'Acoustic', 'A', 0, 112, 'Use a light strum through the first verse.'),
        ('d1000000-0000-4000-8000-000000000006'::uuid, 'Quiet Promise', 'Piano and voices', 'E', 0, 72, 'Soft 3/4 feel; finish without a repeat.')
) AS demo(id, song_title, arrangement_name, arrangement_key, capo_position, tempo_override, performance_notes)
    ON true
JOIN public.songs AS song
    ON song.team_id = context.team_id
   AND song.title = demo.song_title
WHERE NOT EXISTS (
    SELECT 1
    FROM public.song_arrangements AS existing
    WHERE existing.song_id = song.id
      AND existing.arrangement_name = demo.arrangement_name
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.lineups (
    id, team_id, service_date, service_title, status, created_by, published_at
)
SELECT
    'd2000000-0000-4000-8000-000000000001'::uuid,
    context.team_id,
    service.service_date,
    'Demo Sunday Worship - ' || service.service_date::text,
    'published',
    context.leader_id,
    now()
FROM pg_temp.demo_seed_context AS context
CROSS JOIN (
    SELECT CURRENT_DATE
        + ((7 - EXTRACT(ISODOW FROM CURRENT_DATE)::integer) % 7) AS service_date
) AS service
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.lineup_items (
    id, team_id, lineup_id, song_id, position, selected_arrangement_id, transition_notes
)
SELECT
    demo.item_id,
    context.team_id,
    'd2000000-0000-4000-8000-000000000001'::uuid,
    song.id,
    demo.position,
    arrangement.id,
    demo.transition_notes
FROM pg_temp.demo_seed_context AS context
JOIN (
    VALUES
        ('d3000000-0000-4000-8000-000000000001'::uuid, 'Gather in the Morning', 'Full band', 1, 'Begin after a short instrumental intro.'),
        ('d3000000-0000-4000-8000-000000000002'::uuid, 'Hands of Mercy', 'Full band', 2, 'Move directly into the next count-in.'),
        ('d3000000-0000-4000-8000-000000000003'::uuid, 'Steady River', 'Gentle 6/8', 3, 'Allow a brief pause before the first verse.'),
        ('d3000000-0000-4000-8000-000000000004'::uuid, 'Quiet Promise', 'Piano and voices', 4, 'End quietly; no additional repeat.')
) AS demo(item_id, song_title, arrangement_name, position, transition_notes)
    ON true
JOIN public.songs AS song
    ON song.team_id = context.team_id
   AND song.title = demo.song_title
JOIN public.song_arrangements AS arrangement
    ON arrangement.team_id = context.team_id
   AND arrangement.song_id = song.id
   AND arrangement.arrangement_name = demo.arrangement_name
WHERE NOT EXISTS (
    SELECT 1
    FROM public.lineup_items AS existing
    WHERE existing.lineup_id = 'd2000000-0000-4000-8000-000000000001'::uuid
      AND existing.position = demo.position
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.team_posts (id, team_id, author_id, post_type, message_body)
SELECT
    'd4000000-0000-4000-8000-000000000001'::uuid,
    context.team_id,
    context.leader_id,
    'announcement',
    'Demo catalog is ready: five original test songs, arrangements, and a published lineup are available. These entries are sample content and can be edited or removed.'
FROM pg_temp.demo_seed_context AS context
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.song_comments (
    id, team_id, song_id, author_id, song_section, comment_body
)
SELECT
    'd5000000-0000-4000-8000-000000000001'::uuid,
    context.team_id,
    song.id,
    context.leader_id,
    'Chorus',
    'Demo note: try the acoustic arrangement if this key feels high for the group.'
FROM pg_temp.demo_seed_context AS context
JOIN public.songs AS song
    ON song.team_id = context.team_id
   AND song.title = 'Gather in the Morning'
ON CONFLICT (id) DO NOTHING;

COMMIT;
