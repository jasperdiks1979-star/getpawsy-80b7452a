INSERT INTO pinterest_board_mappings (category_key, board_names, priority)
VALUES ('scale', ARRAY['Cat Care Essentials','Smart Pet Products','Cat Owner Hacks','Pet Cleaning Solutions'], 1)
ON CONFLICT (category_key) DO UPDATE SET board_names = EXCLUDED.board_names;