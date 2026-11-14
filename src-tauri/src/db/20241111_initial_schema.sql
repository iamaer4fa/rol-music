-- CreateTable
CREATE TABLE "public"."teams" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CreateTable
CREATE TABLE "public"."profiles" (
    "id" UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    "display_name" VARCHAR(255),
    "profile_image" VARCHAR(255),
    "preferred_instrument" VARCHAR(255),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CreateTable
CREATE TABLE "public"."team_members" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "team_id" UUID NOT NULL REFERENCES "public"."teams"(id) ON DELETE CASCADE,
    "user_id" UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    "access_role" VARCHAR(50) NOT NULL DEFAULT 'member',
    "musical_roles" JSONB DEFAULT '[]',
    "membership_status" VARCHAR(50) DEFAULT 'active',
    "date_joined" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "practice_sharing_enabled" BOOLEAN DEFAULT false,
    "practice_sharing_consent_at" TIMESTAMPTZ,
    "practice_sharing_consent_version" VARCHAR(50),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(team_id, user_id)
);

-- CreateTable
CREATE TABLE "public"."team_settings" (
    "team_id" UUID PRIMARY KEY REFERENCES "public"."teams"(id) ON DELETE CASCADE,
    "iana_timezone" VARCHAR(50) NOT NULL DEFAULT 'Asia/Manila',
    "week_starts_on" INTEGER NOT NULL DEFAULT 1 CHECK ("week_starts_on" >= 1 AND "week_starts_on" <= 7),
    "service_day_of_week" INTEGER NOT NULL DEFAULT 7 CHECK ("service_day_of_week" >= 1 AND "service_day_of_week" <= 7),
    "service_cutoff_time" TIME NOT NULL DEFAULT '09:00:00',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CreateTable
CREATE TABLE "public"."songs" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "team_id" UUID NOT NULL REFERENCES "public"."teams"(id) ON DELETE CASCADE,
    "title" VARCHAR(255) NOT NULL,
    "artist" VARCHAR(255),
    "key_signature" VARCHAR(50) DEFAULT 'C',
    "tempo_bpm" INTEGER,
    "time_signature" VARCHAR(20) DEFAULT '4/4',
    "chordpro_lyrics" TEXT NOT NULL,
    "song_notes" TEXT,
    "created_by" UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CreateTable
CREATE TABLE "public"."song_arrangements" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "song_id" UUID NOT NULL REFERENCES "public"."songs"(id) ON DELETE CASCADE,
    "arrangement_name" VARCHAR(255) NOT NULL,
    "key" VARCHAR(50) DEFAULT 'C',
    "capo_position" INTEGER DEFAULT 0,
    "tempo_override" INTEGER,
    "time_signature_override" VARCHAR(20),
    "performance_notes" TEXT,
    "created_by" UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CreateTable
CREATE TABLE "public"."song_media" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "song_id" UUID NOT NULL REFERENCES "public"."songs"(id) ON DELETE CASCADE,
    "media_type" VARCHAR(50) NOT NULL,
    "external_url" VARCHAR(500),
    "local_file_reference" VARCHAR(500),
    "attribution" VARCHAR(500),
    "description" VARCHAR(255),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CreateTable
CREATE TABLE "public"."song_tags" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "tag_name" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CreateTable
CREATE TABLE "public"."songs_tags" (
    "song_id" UUID NOT NULL REFERENCES "public"."songs"(id) ON DELETE CASCADE,
    "tag_id" UUID NOT NULL REFERENCES "public"."song_tags"(id) ON DELETE CASCADE,
    PRIMARY KEY (song_id, tag_id)
);

-- CreateTable
CREATE TABLE "public"."lineups" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "team_id" UUID NOT NULL REFERENCES "public"."teams"(id) ON DELETE CASCADE,
    "service_date" DATE NOT NULL,
    "service_title" VARCHAR(255),
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK ("status" IN ('draft', 'published', 'archived')),
    "created_by" UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    "published_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CreateTable
CREATE TABLE "public"."lineup_items" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "lineup_id" UUID NOT NULL REFERENCES "public"."lineups"(id) ON DELETE CASCADE,
    "song_id" UUID NOT NULL REFERENCES "public"."songs"(id) ON DELETE CASCADE,
    "position" INTEGER NOT NULL,
    "selected_arrangement_id" UUID REFERENCES "public"."song_arrangements"(id) ON DELETE SET NULL,
    "key_override" VARCHAR(50),
    "tempo_override" INTEGER,
    "transition_notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CreateTable
CREATE TABLE "public"."team_posts" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "team_id" UUID NOT NULL REFERENCES "public"."teams"(id) ON DELETE CASCADE,
    "author_id" UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    "post_type" VARCHAR(50) NOT NULL DEFAULT 'announcement',
    "message_body" TEXT NOT NULL,
    "parent_post_id" UUID REFERENCES "public"."team_posts"(id) ON DELETE CASCADE,
    "song_id" UUID REFERENCES "public"."songs"(id) ON DELETE SET NULL,
    "lineup_item_id" UUID REFERENCES "public"."lineup_items"(id) ON DELETE SET NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CreateTable
CREATE TABLE "public"."song_comments" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "song_id" UUID NOT NULL REFERENCES "public"."songs"(id) ON DELETE CASCADE,
    "song_section" VARCHAR(100),
    "author_id" UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    "comment_body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CreateTable
CREATE TABLE "public"."song_tags_seed" (
    -- Seed data for common tags
    "tag_name" VARCHAR(50) NOT NULL
);

-- Enable RLS
ALTER TABLE "public"."teams" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."team_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."team_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."songs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."song_arrangements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."song_media" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."song_tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."songs_tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."lineups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."lineup_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."team_posts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."song_comments" ENABLE ROW LEVEL SECURITY;
-- CreateTable
CREATE TABLE "public"."practice_sessions" (
    "session_id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "team_id" UUID NOT NULL REFERENCES "public"."teams"(id) ON DELETE CASCADE,
    "user_id" UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    "song_id" UUID NOT NULL REFERENCES "public"."songs"(id) ON DELETE CASCADE,
    "arrangement_id" UUID REFERENCES "public"."song_arrangements"(id) ON DELETE SET NULL,
    "lineup_item_id" UUID REFERENCES "public"."lineup_items"(id) ON DELETE SET NULL,
    "device_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "started_at" TIMESTAMPTZ NOT NULL,
    "ended_at" TIMESTAMPTZ,
    "actual_practice_duration_seconds" INTEGER NOT NULL DEFAULT 0 CHECK ("actual_practice_duration_seconds" >= 0),
    "playback_speed" NUMERIC(3, 2) NOT NULL DEFAULT 1.0 CHECK ("playback_speed" >= 0.5 AND "playback_speed" <= 2.0),
    "loop_start_ms" INTEGER,
    "loop_end_ms" INTEGER,
    "loop_repetitions" INTEGER NOT NULL DEFAULT 0,
    "schema_version" VARCHAR(20) NOT NULL DEFAULT '1.0',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "public"."practice_sessions" ENABLE ROW LEVEL SECURITY;