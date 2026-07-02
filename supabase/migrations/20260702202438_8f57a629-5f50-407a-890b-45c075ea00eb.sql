
INSERT INTO public.pcie2_ci_banned_phrases (phrase, category, severity)
VALUES
  ('cleaner litter, less work', 'duplicate_slop', 'hard_block'),
  ('tired of scooping',         'duplicate_slop', 'hard_block'),
  ('tired of litter scooping',  'duplicate_slop', 'hard_block'),
  ('tired of litter box chores','duplicate_slop', 'hard_block'),
  ('tired of daily scooping',   'duplicate_slop', 'hard_block'),
  ('cat parents love this',     'duplicate_slop', 'hard_block'),
  ('cat owners love this',      'duplicate_slop', 'hard_block'),
  ('cat owners love it',        'duplicate_slop', 'hard_block'),
  ('what if you never scooped', 'duplicate_slop', 'hard_block'),
  ('reclaim your time',         'duplicate_slop', 'hard_block'),
  ('stop scooping',             'duplicate_slop', 'hard_block')
ON CONFLICT (phrase) DO UPDATE
  SET category = EXCLUDED.category,
      severity = EXCLUDED.severity;
