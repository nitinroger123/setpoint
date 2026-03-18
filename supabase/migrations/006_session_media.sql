-- Session media: photos, YouTube links, and other URLs attached to a session.
-- media_type is auto-detected by the backend: 'image', 'youtube', or 'link'.
-- Only one item per session can be is_featured=true (enforced by the backend).
-- The featured item appears in the public session view next to the standings table.

CREATE TABLE IF NOT EXISTS public.session_media (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid        NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  url         text        NOT NULL,
  caption     text,
  media_type  text        NOT NULL DEFAULT 'link',  -- 'image' | 'youtube' | 'link'
  is_featured boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.session_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read session_media"
  ON public.session_media FOR SELECT USING (true);
