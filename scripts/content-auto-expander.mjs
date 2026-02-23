/**
 * content-auto-expander.mjs
 * Generates structured content expansion blocks for pages with critical gaps.
 * EXECUTE=false by default — drafts only, never auto-publishes.
 */
import fs from "node:fs";
import path from "node:path";

const REPORTS_DIR = path.join(process.cwd(), "reports");
const EXECUTE = process.env.EXECUTE === "true";

function readJson(p) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } }

function slugToKeyword(urlPath) {
  return urlPath
    .replace(/^\/(product|blog|collections|guides)\//, "")
    .replace(/-\d+$/, "")
    .replace(/-/g, " ")
    .trim();
}

function generateFaqBlock(keyword) {
  const q1 = `What is the best ${keyword} for my pet?`;
  const a1 = `The best ${keyword} depends on your pet's size, breed, and specific needs. We recommend considering factors like durability, material safety, and your pet's preferences. Our curated selection features top-rated options that pet owners trust.`;

  const q2 = `How do I choose the right ${keyword}?`;
  const a2 = `When choosing a ${keyword}, consider your pet's size and activity level. Look for high-quality materials, easy maintenance, and positive reviews from other pet owners. Our product descriptions include detailed specifications to help you decide.`;

  const q3 = `Is ${keyword} worth the investment?`;
  const a3 = `Quality ${keyword} products are a worthwhile investment in your pet's comfort and well-being. Premium options tend to last longer, provide better support, and come with satisfaction guarantees. Check our bestsellers for the most popular choices.`;

  return { type: "faq", questions: [{ q: q1, a: a1 }, { q: q2, a: a2 }, { q: q3, a: a3 }] };
}

function generateSubtopicBlock(keyword, missingElements) {
  const topics = [];

  if (missingElements.some((m) => m.includes("word count") || m.includes("depth"))) {
    topics.push({
      heading: `Complete Guide to ${keyword.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}`,
      content: `Finding the perfect ${keyword} doesn't have to be overwhelming. This comprehensive guide covers everything you need to know — from material quality and sizing to maintenance tips and value comparisons. Whether you're a first-time pet owner or upgrading your current setup, understanding these key factors will help you make a confident purchasing decision.`,
    });
  }

  if (missingElements.some((m) => m.includes("comparison"))) {
    topics.push({
      heading: `How ${keyword.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")} Compare`,
      content: `Not all ${keyword} products are created equal. Key differentiators include material quality, durability, ease of cleaning, and pet comfort ratings. Premium options typically feature reinforced construction and hypoallergenic materials, while budget-friendly alternatives offer solid performance for everyday use.`,
    });
  }

  return { type: "subtopic", topics };
}

function generateSnippetBlock(keyword) {
  return {
    type: "snippet_paragraph",
    content: `${keyword.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")} — Shop premium pet products with fast US shipping. Our expert-curated selection features top-rated options trusted by thousands of happy pet owners. Free shipping available on qualifying orders.`,
  };
}

function main() {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const contentGaps = readJson(path.join(REPORTS_DIR, "content-gaps.json"));
  const rankings = readJson(path.join(REPORTS_DIR, "ranking-predictions.json"));

  if (!contentGaps?.gaps?.length) {
    console.warn("[content-expander] No content gaps found. Skipping.");
    return;
  }

  // Cross-reference with ranking data
  const rankByUrl = {};
  if (rankings?.predictions) for (const p of rankings.predictions) rankByUrl[p.url] = p;

  const expansions = [];

  // Focus on critical and high priority gaps
  const targets = contentGaps.gaps
    .filter((g) => g.priority === "critical" || g.priority === "high")
    .slice(0, 30);

  for (const gap of targets) {
    const keyword = slugToKeyword(gap.url);
    const rank = rankByUrl[gap.url];
    const blocks = [];

    // FAQ block if missing
    if (gap.missing_elements.some((m) => m.toLowerCase().includes("faq"))) {
      blocks.push(generateFaqBlock(keyword));
    }

    // Subtopic block for content depth
    if (gap.missing_elements.some((m) => m.includes("word count") || m.includes("comparison") || m.includes("depth"))) {
      blocks.push(generateSubtopicBlock(keyword, gap.missing_elements));
    }

    // Snippet block for CTR improvement
    if (rank?.classification === "Growth Opportunity" || gap.impressions > 100) {
      blocks.push(generateSnippetBlock(keyword));
    }

    if (blocks.length > 0) {
      expansions.push({
        url: gap.url,
        keyword,
        current_word_count: gap.word_count,
        position: gap.position,
        impressions: gap.impressions,
        ranking_classification: rank?.classification || "unknown",
        expansion_blocks: blocks,
        status: EXECUTE ? "draft_ready" : "suggestion_only",
      });
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    execute_mode: EXECUTE,
    pages_targeted: expansions.length,
    total_blocks_generated: expansions.reduce((sum, e) => sum + e.expansion_blocks.length, 0),
    expansions,
  };

  fs.writeFileSync(path.join(REPORTS_DIR, "content-expansions.json"), JSON.stringify(report, null, 2), "utf8");

  console.log("\n══════════════════════════════════════════");
  console.log("  Content Auto-Expander");
  console.log("══════════════════════════════════════════");
  console.log(`  Mode:                 ${EXECUTE ? "⚡ DRAFT READY" : "🔒 SUGGESTION ONLY"}`);
  console.log(`  Pages targeted:       ${expansions.length}`);
  console.log(`  Blocks generated:     ${report.total_blocks_generated}`);
  console.log("══════════════════════════════════════════\n");
}

main();
