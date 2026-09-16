REVOKE EXECUTE ON FUNCTION public.review_order_is_eligible(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.product_reviews_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_order_is_eligible(uuid, uuid, uuid) TO service_role;