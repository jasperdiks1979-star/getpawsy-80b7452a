// Pure per-session classification from stored canonical_sessions fields.
import { classifyTraffic, type TrafficQuality } from "./traffic-classifier.ts";

export interface SessionRow {
  session_id: string;
  user_agent?: string | null;
  first_landing_path?: string | null;
  landing_page?: string | null;
  last_stage?: string | null;
  order_id?: string | null;
  engagement_ms?: number | null;
  interaction_count?: number | null;
}
export interface SessionHints {
  is_internal?: boolean | null;
  is_admin_path?: boolean | null;
  is_bot_suspect?: boolean | null;
  bot_suspect_reason?: string | null;
  crawler_verified?: boolean | null;
  crawler_reason?: string | null;
}
export interface SessionLabel {
  traffic_quality: TrafficQuality;
  is_bot: boolean;
  technical_path: boolean;
  bot_confidence: number;
  bot_reason: string | null;
}

const ATC_STAGES = new Set(["CANONICAL_ADD_TO_CART", "CANONICAL_CART", "CANONICAL_CHECKOUT", "CANONICAL_PURCHASE"]);

export function classifySessionRow(s: SessionRow, h: SessionHints | null): SessionLabel {
  const stage = s.last_stage ?? "";
  const hasOrder = stage === "CANONICAL_PURCHASE" || !!s.order_id;
  const hasCheckout = hasOrder || stage === "CANONICAL_CHECKOUT";
  const hasAtc = hasCheckout || ATC_STAGES.has(stage);
  const c = classifyTraffic({
    page_path: s.first_landing_path || s.landing_page || null,
    user_agent: s.user_agent ?? null,
    is_internal_hint: !!(h?.is_internal || h?.is_admin_path),
    is_bot_suspect_hint: h?.is_bot_suspect ?? null,
    bot_suspect_reason: h?.bot_suspect_reason ?? null,
    crawler_verified: h?.crawler_verified === true,
    crawler_reason: h?.crawler_reason ?? null,
    engagement_ms: s.engagement_ms ?? null,
    interaction_count: s.interaction_count ?? null,
    has_atc: hasAtc,
    has_checkout: hasCheckout,
    has_order: hasOrder,
  });
  return {
    traffic_quality: c.traffic_quality,
    is_bot: c.traffic_quality === "bot",
    technical_path: c.traffic_quality === "technical",
    bot_confidence: Number(c.bot_confidence || 0),
    bot_reason: c.traffic_quality === "bot" ? c.bot_reason : null,
  };
}
