
-- cinematic_music_tracks
DROP POLICY IF EXISTS "music tracks readable" ON public.cinematic_music_tracks;
REVOKE SELECT ON public.cinematic_music_tracks FROM anon;
CREATE POLICY "Admins can read music tracks"
  ON public.cinematic_music_tracks FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- cinematic_voice_profiles
DROP POLICY IF EXISTS "voice profiles readable" ON public.cinematic_voice_profiles;
REVOKE SELECT ON public.cinematic_voice_profiles FROM anon;
CREATE POLICY "Admins can read voice profiles"
  ON public.cinematic_voice_profiles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- cinematic_voiceover_lines
DROP POLICY IF EXISTS "voiceover lines readable" ON public.cinematic_voiceover_lines;
REVOKE SELECT ON public.cinematic_voiceover_lines FROM anon;
CREATE POLICY "Admins can read voiceover lines"
  ON public.cinematic_voiceover_lines FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- pinterest_board_mappings
DROP POLICY IF EXISTS "Anyone can view board mappings" ON public.pinterest_board_mappings;
REVOKE SELECT ON public.pinterest_board_mappings FROM anon;
CREATE POLICY "Admins can read board mappings"
  ON public.pinterest_board_mappings FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
