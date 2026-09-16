UPDATE public.smoke_test_runs
SET status = 'refunded', updated_at = now()
WHERE id = '724f0bf0-46c4-4eb9-86fb-477b0fb96361'
  AND stripe_session_id = 'cs_live_a1o54ZsR3hmFgRYf0E79tJkn9F1kyOWOw0u8GTY5iYvrxG9TxsgjKKIky2'
  AND payment_intent_id = 'pi_3UGGnNKvSv3HZqAj1uBQIkQd'
  AND refund_id = 're_3UGGnNKvSv3HZqAj1hpMKlUJ'
  AND refunded_at IS NOT NULL
  AND status = 'paid';