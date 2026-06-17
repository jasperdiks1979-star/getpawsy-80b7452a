---
name: Revenue Command Center
description: Mobile-first admin dashboard at /admin/revenue-command-center aggregating revenue, conversion, traffic, Pinterest, and SMS alerts
type: feature
---
- Page: `src/pages/admin/RevenueCommandCenterPage.tsx`. Auto-refresh 60s.
- Aggregator: `revenue-command-center` edge function (admin-only, has_role check).
- Monitor: `revenue-alert-monitor` cron every 10m. Twilio SMS to OWNER_ALERT_PHONE.
- Config: `revenue_alert_config` (singleton id=true). Log: `revenue_alert_log` (dedupe key + cooldown).
- Alert types: pinterest_stall, out_of_stock, checkout_errors, new_order, revenue_threshold.
- Cooldowns: stall=threshold mins, OOS=24h/product, checkout=60m, new_order=24h/order, daily_rev=24h, weekly_rev=7d.