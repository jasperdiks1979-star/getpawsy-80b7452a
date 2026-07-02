import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Category keywords mapping
const categoryKeywords: Record<string, string[]> = {
  'dogs': ['dog', 'dogs', 'puppy', 'puppies', 'canine', 'pup', 'pups', 'pet dog', 'furry friend'],
  'dog-beds': ['dog bed', 'dog beds', 'pet bed', 'orthopedic bed', 'memory foam bed'],
  'dog-collars-leashes': ['dog collar', 'dog leash', 'collar', 'leash', 'harness', 'dog harness'],
  'dog-carriers': ['dog carrier', 'pet carrier', 'travel carrier', 'backpack carrier', 'pet stroller'],
  'dog-toys': ['dog toy', 'dog toys', 'chew toy', 'squeaky toy', 'puzzle toy', 'interactive toy'],
  'dog-grooming': ['grooming', 'brush', 'nail clipper', 'shampoo', 'deshedding'],
  'dog-training': ['training', 'dog training', 'puppy training', 'potty training'],
  'dog-food-treats': ['dog food', 'dog treat', 'treats', 'training treat', 'dental treat'],
  'cats': ['cat', 'cats', 'kitten', 'kittens', 'feline', 'kitty'],
  'cat-beds': ['cat bed', 'cat beds', 'cat hammock', 'cat cave'],
  'cat-trees-and-condos': ['cat tree', 'scratching post', 'cat tower', 'cat condo'],
  'cat-litter-boxes': ['litter box', 'litter boxes', 'automatic litter box', 'self-cleaning litter'],
  'cat-toys': ['cat toy', 'cat toys', 'feather toy', 'laser pointer', 'wand toy'],
  'birds': ['bird', 'birds', 'parrot', 'parakeet', 'cockatiel', 'budgie', 'canary'],
  'bird-cages': ['bird cage', 'bird cages', 'aviary', 'parrot cage'],
  'bird-feeders': ['bird feeder', 'bird feeders', 'seed feeder', 'bird bath'],
  'bird-toys': ['bird toy', 'bird toys', 'bird swing', 'bird perch'],
  'fish-aquarium': ['fish', 'tropical fish', 'goldfish', 'betta', 'guppy', 'aquarium'],
  'fish-tanks': ['aquarium', 'fish tank', 'tank', 'planted tank'],
  'small-pets': ['small pet', 'small pets', 'pocket pet'],
  'hamsters': ['hamster', 'hamsters', 'dwarf hamster', 'syrian hamster'],
  'rabbits': ['rabbit', 'rabbits', 'bunny', 'bunnies'],
  'guinea-pigs': ['guinea pig', 'guinea pigs', 'cavy'],
  'reptiles': ['reptile', 'reptiles', 'lizard', 'gecko', 'bearded dragon', 'snake', 'turtle'],
  'reptile-terrariums': ['terrarium', 'terrariums', 'vivarium', 'reptile tank'],
};

// Product-specific phrases
const productPhrases: Record<string, string> = {
  'automatic litter box': 'cat-litter-boxes',
  'self-cleaning litter': 'cat-litter-boxes',
  'smart litter box': 'cat-litter-boxes',
  'water fountain': 'dog-bowls-feeders',
  'pet water fountain': 'dog-bowls-feeders',
  'automatic feeder': 'dog-bowls-feeders',
  'smart feeder': 'dog-bowls-feeders',
  'orthopedic dog bed': 'dog-beds',
  'memory foam bed': 'dog-beds',
  'cooling mat': 'pet-beds',
  'puzzle toy': 'dog-toys',
  'interactive puzzle': 'dog-toys',
  'mental stimulation': 'dog-toys',
  'travel carrier': 'dog-carriers',
  'pet backpack': 'dog-carriers',
  'airline approved': 'dog-carriers',
  'anxiety vest': 'dog-training',
  'calming vest': 'dog-training',
  'nail grinder': 'dog-grooming',
  'deshedding brush': 'dog-grooming',
  'first aid kit': 'dogs',
  'pet first aid': 'dogs',
  'rescue pet': 'dogs',
  'rescue dog': 'dogs',
  'rescue cat': 'cats',
  'adopt a pet': 'dogs',
  'pet adoption': 'dogs',
};

interface LinkableKeyword {
  keyword: string;
  url: string;
  priority: number;
}

function generateKeywords(): LinkableKeyword[] {
  const keywords: LinkableKeyword[] = [];
  
  // Add category keywords
  Object.entries(categoryKeywords).forEach(([slug, kws]) => {
    kws.forEach((kw) => {
      keywords.push({
        keyword: kw.toLowerCase(),
        url: `/products?category=${slug}`,
        priority: 6,
      });
    });
  });
  
  // Add product phrases (higher priority)
  Object.entries(productPhrases).forEach(([phrase, categorySlug]) => {
    keywords.push({
      keyword: phrase.toLowerCase(),
      url: `/products?category=${categorySlug}`,
      priority: 9,
    });
  });
  
  // Sort by priority and length
  return keywords.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return b.keyword.length - a.keyword.length;
  });
}

function addInternalLinksToContent(
  htmlContent: string,
  maxTotalLinks: number = 10,
  minWordsBetweenLinks: number = 30
): { content: string; linksAdded: number } {
  if (!htmlContent || typeof htmlContent !== 'string') {
    return { content: '', linksAdded: 0 };
  }

  // Check if already has many links
  const existingLinkCount = (htmlContent.match(/<a\s/gi) || []).length;
  if (existingLinkCount > 8) {
    return { content: htmlContent, linksAdded: 0 };
  }

  const keywords = generateKeywords();
  const linkedKeywords = new Map<string, number>();
  let totalLinksAdded = 0;
  let processedContent = String(htmlContent);
  let lastLinkPosition = -minWordsBetweenLinks;

  for (const { keyword, url } of keywords) {
    if (totalLinksAdded >= maxTotalLinks) break;
    
    const timesLinked = linkedKeywords.get(keyword) || 0;
    if (timesLinked >= 1) continue;
    
    // Create regex to match keyword
    const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(
      `(?<![<\\/a-zA-Z])\\b(${escapedKeyword})\\b(?![^<]*>)(?![^<]*<\\/a>)`,
      'gi'
    );
    
    let match: RegExpExecArray | null;
    
    while ((match = regex.exec(processedContent)) !== null) {
      // Estimate word position
      const textBeforeMatch = processedContent.substring(0, match.index).replace(/<[^>]*>/g, '');
      const wordPosition = textBeforeMatch.split(/\s+/).length;
      
      // Check if far enough from last link
      if (wordPosition - lastLinkPosition < minWordsBetweenLinks) {
        continue;
      }
      
      // Check if inside a tag
      const beforeMatch = processedContent.substring(Math.max(0, match.index - 100), match.index);
      const afterMatch = processedContent.substring(match.index, Math.min(processedContent.length, match.index + 100));
      
      if (beforeMatch.lastIndexOf('<') > beforeMatch.lastIndexOf('>') ||
          (afterMatch.indexOf('>') < afterMatch.indexOf('<') && afterMatch.indexOf('>') !== -1)) {
        continue;
      }
      
      // Create the link
      const matchedText = match[1];
      const link = `<a href="${url}" class="internal-link text-primary hover:underline">${matchedText}</a>`;
      
      // Replace in content
      const before = processedContent.substring(0, match.index);
      const after = processedContent.substring(match.index + matchedText.length);
      processedContent = before + link + after;
      
      // Update tracking
      linkedKeywords.set(keyword, (linkedKeywords.get(keyword) || 0) + 1);
      totalLinksAdded++;
      lastLinkPosition = wordPosition;
      
      // Adjust regex lastIndex
      regex.lastIndex = match.index + link.length;
      
      break; // Move to next keyword
    }
  }

  return { content: processedContent, linksAdded: totalLinksAdded };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const guard = await requireInternalOrAdmin(req);
  if (guard) return guard;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch all published blog posts
    const { data: posts, error: fetchError } = await supabase
      .from("blog_posts")
      .select("id, title, content, slug")
      .eq("is_published", true);

    if (fetchError) {
      throw new Error(`Failed to fetch blog posts: ${fetchError.message}`);
    }

    console.log(`Processing ${posts?.length || 0} blog posts...`);

    const results: { slug: string; title: string; linksAdded: number }[] = [];
    let totalLinksAdded = 0;

    for (const post of posts || []) {
      // Process content
      const { content: updatedContent, linksAdded } = addInternalLinksToContent(
        post.content,
        10, // max links
        30  // min words between links
      );

      if (linksAdded > 0) {
        // Update the blog post
        const { error: updateError } = await supabase
          .from("blog_posts")
          .update({ content: updatedContent, updated_at: new Date().toISOString() })
          .eq("id", post.id);

        if (updateError) {
          console.error(`Failed to update post ${post.slug}:`, updateError);
        } else {
          results.push({
            slug: post.slug,
            title: post.title,
            linksAdded,
          });
          totalLinksAdded += linksAdded;
          console.log(`Updated "${post.title}" with ${linksAdded} internal links`);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Added ${totalLinksAdded} internal links to ${results.length} blog posts`,
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
