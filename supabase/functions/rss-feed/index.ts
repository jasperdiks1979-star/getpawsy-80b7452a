import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SITE = "https://getpawsy.pet";

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch latest blog posts
    const { data: posts } = await supabase
      .from("blog_posts")
      .select("title, slug, excerpt, published_at, featured_image, author_name")
      .eq("is_published", true)
      .order("published_at", { ascending: false })
      .limit(50);

    // Fetch latest guides
    const { data: guides } = await supabase
      .from("published_guides")
      .select("title, slug, meta_description, published_at")
      .eq("is_published", true)
      .order("published_at", { ascending: false })
      .limit(50);

    // Merge and sort by date
    interface FeedItem {
      title: string;
      link: string;
      description: string;
      pubDate: string;
      image?: string;
      author?: string;
    }

    const items: FeedItem[] = [];

    for (const post of posts || []) {
      items.push({
        title: post.title,
        link: `${SITE}/blog/${post.slug}`,
        description: post.excerpt || "",
        pubDate: post.published_at || new Date().toISOString(),
        image: post.featured_image || undefined,
        author: post.author_name || "GetPawsy Team",
      });
    }

    for (const guide of guides || []) {
      items.push({
        title: guide.title || guide.slug,
        link: `${SITE}/guides/${guide.slug}`,
        description: guide.meta_description || "",
        pubDate: guide.published_at || new Date().toISOString(),
        author: "GetPawsy Team",
      });
    }

    // Sort by date descending
    items.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

    const rssItems = items.slice(0, 50).map(item => `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.link)}</link>
      <description>${escapeXml(item.description)}</description>
      <pubDate>${new Date(item.pubDate).toUTCString()}</pubDate>
      <guid isPermaLink="true">${escapeXml(item.link)}</guid>
      ${item.author ? `<author>${escapeXml(item.author)}</author>` : ""}
      ${item.image ? `<enclosure url="${escapeXml(item.image)}" type="image/jpeg" />` : ""}
    </item>`).join("\n");

    const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>GetPawsy – Pet Care Guides &amp; Blog</title>
    <link>${SITE}</link>
    <description>Expert pet care guides, training tips, and product reviews for dog and cat owners.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml" />
${rssItems}
  </channel>
</rss>`;

    console.log(`[rss-feed] Generated ${items.length} items`);

    return new Response(rss, {
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "X-Content-Type-Options": "nosniff",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    console.error("[rss-feed] Error:", err);
    const fallback = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>GetPawsy</title><link>${SITE}</link><description>Pet Care</description></channel></rss>`;
    return new Response(fallback, {
      status: 500,
      headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
    });
  }
});
