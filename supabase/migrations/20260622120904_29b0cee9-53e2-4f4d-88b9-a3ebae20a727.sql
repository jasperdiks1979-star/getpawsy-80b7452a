
UPDATE pinterest_video_autopilot_settings SET enabled = false, mode = 'disabled', updated_at = now();

UPDATE pinterest_video_queue
  SET status = 'rejected',
      error_message = COALESCE(error_message,'') || ' | CJ_SUPPLIER_BLOCKED',
      archived = true,
      updated_at = now()
  WHERE status IN ('draft','publish_blocked','failed','creative_rejected');

UPDATE pinterest_pin_queue
  SET status = 'rejected',
      rejection_reason = 'QUALITY_GATE_BLOCKED:cj_supplier',
      updated_at = now()
  WHERE status IN ('draft','queued','pending')
    AND (
      coalesce(pin_image_url,'') ILIKE '%cjdropshipping%'
      OR coalesce(pin_image_url,'') ILIKE '%aliexpress%'
      OR coalesce(pin_title,'') ~* '\m(CE|FCC|factory|aliexpress|cj ?dropshipping)\M'
      OR coalesce(pin_description,'') ~* '\m(CE|FCC|factory|aliexpress|cj ?dropshipping)\M'
    );
