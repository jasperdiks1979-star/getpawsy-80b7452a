/**
 * seo-action-engine.mjs
 * Translates SEO reports into structured, prioritized action recommendations.
 * EXECUTE=false by default — suggestion only.
 */
import fs from "node:fs";
import path from "node:path";

const REPORTS_DIR = path.join(process.cwd(), "reports");
const EXECUTE = process.env.EXECUTE === "true";

function readJson(p) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } }

function main() {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const rankings = readJson(path.join(REPORTS_DIR, "ranking-predictions.json"));
  const volatility = readJson(path.join(REPORTS_DIR, "serp-volatility.json"));
  const contentGaps = readJson(path.join(REPORTS_DIR, "content-gaps.json"));
  const ctrVariants = readJson(path.join(REPORTS_DIR, "ctr-variants.json"));
  const linkSuggestions = readJson(path.join(REPORTS_DIR, "internal-link-suggestions.json"));

  const actions = [];

  // Index reports by URL for cross-referencing
  const rankByUrl = {};
  if (rankings?.predictions) for (const p of rankings.predictions) rankByUrl[p.url] = p;
  const gapByUrl = {};
  if (contentGaps?.gaps) for (const g of contentGaps.gaps) gapByUrl[g.url] = g;
  const ctrByUrl = {};
  if (ctrVariants?.candidates) for (const c of ctrVariants.candidates) ctrByUrl[c.url] = c;
  const linkByUrl = {};
  if (linkSuggestions?.suggestions) for (const s of linkSuggestions.suggestions) linkByUrl[s.target_url] = s;

  // Collect all unique URLs
  const allUrls = new Set([
    ...Object.keys(rankByUrl),
    ...Object.keys(gapByUrl),
    ...Object.keys(ctrByUrl),
    ...Object.keys(linkByUrl),
  ]);

  for (const url of allUrls) {
    const rank = rankByUrl[url];
    const gap = gapByUrl[url];
    const ctr = ctrByUrl[url];
    const link = linkByUrl[url];
    const urlActions = [];

    // High Drop Risk → defensive actions
    if (rank?.classification === "At Risk" || rank?.drop_probability >= 40) {
      urlActions.push({ type: "add_internal_links", count: 3, priority: "critical", reason: "High drop risk — strengthen link equity" });
      urlActions.push({ type: "expand_faq", priority: "critical", reason: "Defensive content expansion" });
      urlActions.push({ type: "refresh_comparison", priority: "high", reason: "Content freshness signal" });
    }

    // Growth Opportunity → offensive actions
    if (rank?.classification === "Growth Opportunity" || rank?.improvement_probability >= 50) {
      urlActions.push({ type: "add_snippet_block", priority: "high", reason: "Position improvement potential" });
      urlActions.push({ type: "increase_word_count", min_words: 500, priority: "high", reason: "Content depth expansion" });
    }

    // Low CTR → title/meta optimization
    if (ctr && ctr.ctr_gap > 2) {
      urlActions.push({
        type: "title_swap",
        priority: ctr.impact === "high" ? "critical" : "high",
        reason: `CTR gap ${ctr.ctr_gap}% — ${ctr.potential_extra_clicks} potential clicks`,
        suggested_title: ctr.title_variants?.[0] || null,
      });
    }

    // Content Gap Critical → subtopic additions
    if (gap?.priority === "critical") {
      for (const missing of gap.missing_elements || []) {
        urlActions.push({ type: "add_subtopic", detail: missing, priority: "high", reason: "Critical content gap" });
      }
    }

    // Weak internal links
    if (link && (link.is_orphan || link.inbound_links < 3)) {
      urlActions.push({
        type: "boost_internal_links",
        priority: link.is_orphan ? "critical" : "high",
        reason: link.is_orphan ? "Orphan page — zero inbound links" : `Only ${link.inbound_links} inbound links`,
        suggested_sources: (link.suggested_links || []).slice(0, 3).map((l) => l.source_url),
      });
    }

    if (urlActions.length > 0) {
      actions.push({ url, actions: urlActions });
    }
  }

  // Categorize
  let critical = 0, high = 0, low = 0;
  for (const a of actions) {
    for (const act of a.actions) {
      if (act.priority === "critical") critical++;
      else if (act.priority === "high") high++;
      else low++;
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    execute_mode: EXECUTE,
    total_urls_with_actions: actions.length,
    critical_actions: critical,
    high_impact_actions: high,
    low_priority_actions: low,
    actions,
  };

  fs.writeFileSync(path.join(REPORTS_DIR, "seo-action-plan.json"), JSON.stringify(report, null, 2), "utf8");

  console.log("\n══════════════════════════════════════════");
  console.log("  SEO Action Engine");
  console.log("══════════════════════════════════════════");
  console.log(`  Mode:              ${EXECUTE ? "⚡ EXECUTE" : "🔒 SAFE (dry run)"}`);
  console.log(`  URLs with actions: ${actions.length}`);
  console.log(`  Critical Actions:  ${critical}`);
  console.log(`  High Impact:       ${high}`);
  console.log(`  Low Priority:      ${low}`);
  console.log("══════════════════════════════════════════\n");
}

main();
