// VisitorWorldMapV2 — Stage 1 shim.
//
// The V2 refactor (staged plan in docs/visitor-world-map-v2/inventory.md)
// introduces a single shared component that will replace every current
// map surface — desktop, mobile widget, and the upcoming Pro admin page.
//
// At Stage 1 we only reserve the symbol and re-export the existing
// implementation verbatim so downstream imports can migrate incrementally
// with ZERO behavioural change. The actual layout/subcomponent split
// (Toolbar, KpiHeader, MapCanvas, LeftFilters, RightFeed,
// DiagnosticsPanels) lands in a later stage under its own review.
//
// Do NOT add divergent logic here. If a change is worth making, make it
// in the underlying component so the mobile widget and Pro page stay
// byte-for-byte identical — that is the whole point of V2.
export {
  VisitorWorldMap as VisitorWorldMapV2,
  type VisitorWorldMapProps as VisitorWorldMapV2Props,
} from "@/components/admin/VisitorWorldMap";