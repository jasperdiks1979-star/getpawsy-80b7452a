UPDATE pinterest_creative_factory_jobs
  SET status='pending', stage='planning', leased_until=NULL, lease_owner=NULL, error_message=NULL
  WHERE pin_queue_id IN ('272b84f9-2b4a-4a33-b8c6-c9719f0b944a','b6845027-6e7b-49bc-ad85-3ca28d15834f');
UPDATE pinterest_creative_factory_jobs
  SET status='pending', stage='planning', leased_until=NULL, lease_owner=NULL, priority=1
  WHERE pin_queue_id IN ('63e812ee-26f8-4290-a4a9-0099f07a3b67','272b84f9-2b4a-4a33-b8c6-c9719f0b944a','0e0ff754-3a0a-4abf-9485-51378104fa3f','3e56eb56-f955-43a9-849e-b65f0e0c2378','b6845027-6e7b-49bc-ad85-3ca28d15834f','418810af-0d0f-45ba-837f-f9bcea123ecc','c67b4f77-37e1-4280-9db9-8048ab483ce5','b84af2cb-8b84-4ec7-92db-9eb3c6adab22','f17b5e91-5da9-4578-9f94-3180e6fc83d5','1f22afb4-ea32-4d92-8f8c-9d4aa094c5f7');