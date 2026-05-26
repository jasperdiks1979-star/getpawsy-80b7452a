UPDATE public.cinematic_ad_jobs
SET status='render_queued',
    error_message=NULL,
    status_message='requeued after auto-trim deploy',
    render_token=gen_random_uuid()::text,
    render_attempts=0,
    render_started_at=NULL,
    render_complete_at=NULL,
    rendered_at=NULL,
    render_worker_id=NULL,
    output_mp4_url=NULL,
    output_duration_seconds=NULL,
    duration_valid=NULL,
    validation_passed=NULL,
    approved_for_render=true,
    duration_auto_trimmed=false,
    original_duration_seconds=NULL,
    trim_attempted_at=NULL,
    trim_ffmpeg_exit_code=NULL
WHERE id IN (
  '3669eabc-505c-4642-937f-86a69f68ee8a',
  '47276d12-3917-4b88-96c4-419ccb188355',
  '4a3af8c6-f6cb-489c-96b0-e08c45931c22',
  'ba05feaf-150d-47b9-a1f9-634abd6c2f23',
  'cb86cbf7-21b1-45c6-970c-96c021cc5b77',
  'fb5509d1-8f59-4409-acd2-661ef42fc6e2'
);