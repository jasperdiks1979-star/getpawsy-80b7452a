UPDATE catalog_commerce_runs
SET current_wave = 1,
    phase = 'wave1',
    updated_at = NOW()
WHERE run_id = 'stepC-1783924943151';