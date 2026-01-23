// Google Ads Campaign Export Utility
// Formats ad data for bulk upload to Google Ads Editor
// Updated: January 2026 - Optimized for GetPawsy.pet

export interface AdVariant {
  campaign: string;
  adGroup: string;
  headlines: string[]; // Max 30 chars each, up to 15 headlines
  descriptions: string[]; // Max 90 chars each, up to 4 descriptions
  displayPaths: string[]; // Max 15 chars each
  keywords: string[];
  finalUrl: string;
}

export const campaignData: AdVariant[] = [
  // =====================
  // GPS DOG FENCE TRACKER
  // =====================
  {
    campaign: "GPS Dog Fence - Search",
    adGroup: "Core Benefits",
    headlines: [
      "GPS Dog Fence Tracker",
      "Keep Your Dog Safe",
      "Wireless Pet Boundary",
      "No Buried Wires Needed",
      "Real-Time Dog Tracking",
      "Safe Zone Alerts"
    ],
    descriptions: [
      "Create invisible boundaries for your pet with satellite GPS. Easy 5-minute setup.",
      "Precision GPS keeps your dog safe. Water-resistant IPX6 design. Free shipping!"
    ],
    displayPaths: ["GPS-Fence", "Dog-Safety"],
    keywords: [
      "gps dog fence", "wireless dog fence", "gps pet containment", "invisible dog fence gps",
      "portable dog fence", "gps tracking collar dog", "wireless pet boundary", "dog fence no wires"
    ],
    finalUrl: "https://getpawsy.pet/products?category=dog-collars-leashes"
  },
  {
    campaign: "GPS Dog Fence - Search",
    adGroup: "Escape Prevention",
    headlines: [
      "Stop Dog Escapes Now",
      "Instant Boundary Alerts",
      "Escape-Proof Your Yard",
      "Track Your Dog Live",
      "Peace of Mind for Dogs",
      "Never Lose Your Pet"
    ],
    descriptions: [
      "Get instant alerts when your dog crosses the boundary. Works anywhere, anytime.",
      "Stop escape artists with real-time GPS alerts. Trusted by 10,000+ pet parents."
    ],
    displayPaths: ["Pet-Safety", "GPS-Alerts"],
    keywords: [
      "dog escape prevention", "anti escape dog collar", "dog boundary alert", "gps alert collar",
      "dog tracker escape", "lost dog prevention", "dog containment system", "smart dog fence"
    ],
    finalUrl: "https://getpawsy.pet/products?category=dog-collars-leashes"
  },
  {
    campaign: "GPS Dog Fence - Search",
    adGroup: "Travel & Outdoor",
    headlines: [
      "Portable Dog Fence",
      "Perfect for Camping",
      "Travel With Your Dog",
      "Park & Beach Ready",
      "Take Safety Anywhere",
      "Outdoor Dog Freedom"
    ],
    descriptions: [
      "Set up safe zones at parks, beaches, or campsites in seconds. No wires needed.",
      "The ultimate travel companion for active dogs. Adjustable radius 32-2887 feet."
    ],
    displayPaths: ["Travel", "Portable"],
    keywords: [
      "portable dog fence camping", "travel dog containment", "hiking dog fence", "beach dog fence",
      "camping pet safety", "outdoor dog tracker", "mobile dog fence", "vacation dog gear"
    ],
    finalUrl: "https://getpawsy.pet/products?category=dog-collars-leashes"
  },
  {
    campaign: "GPS Dog Fence - Search",
    adGroup: "Tech Features",
    headlines: [
      "2-in-1 GPS Collar",
      "Satellite Technology",
      "10-Day Battery Life",
      "IPX6 Waterproof",
      "App-Controlled Fence",
      "Smart Pet Tech"
    ],
    descriptions: [
      "Advanced GPS with 10-day battery. Track location & set boundaries from your phone.",
      "IPX6 waterproof rating. Works in all weather. Modern solution for smart pet owners."
    ],
    displayPaths: ["Smart-Tech", "GPS-Collar"],
    keywords: [
      "smart dog collar gps", "gps collar app", "dog tracker long battery", "waterproof gps dog collar",
      "satellite dog tracker", "modern dog fence", "tech dog collar", "digital pet fence"
    ],
    finalUrl: "https://getpawsy.pet/products?category=dog-collars-leashes"
  },

  // ====================
  // PET CARRIER BACKPACK
  // ====================
  {
    campaign: "Pet Carrier Backpack - Search",
    adGroup: "Expandable Design",
    headlines: [
      "Expandable Pet Carrier",
      "2X More Space for Pets",
      "Breathable Pet Backpack",
      "Comfy Cat & Dog Bag",
      "Premium Pet Travel",
      "Extra-Large Pet Bag"
    ],
    descriptions: [
      "Give your pet 2x more space with expandable back panel. Breathable mesh design.",
      "Premium padded straps for your comfort. Holds pets up to 26 lbs. Free shipping!"
    ],
    displayPaths: ["Backpacks", "Pet-Travel"],
    keywords: [
      "expandable pet carrier", "pet backpack carrier", "cat backpack", "small dog carrier backpack",
      "breathable pet bag", "extra large pet carrier", "roomy cat backpack", "comfortable pet bag"
    ],
    finalUrl: "https://getpawsy.pet/products?category=bags"
  },
  {
    campaign: "Pet Carrier Backpack - Search",
    adGroup: "Adventure & Hiking",
    headlines: [
      "Hiking Pet Backpack",
      "Adventure With Pets",
      "Outdoor Cat Carrier",
      "Trail-Ready Pet Bag",
      "Explore Together",
      "Active Pet Owners"
    ],
    descriptions: [
      "Take your pet on every adventure. Durable, lightweight design for hiking & trails.",
      "Built for outdoor enthusiasts. Secure safety buckles. Folds flat for easy storage."
    ],
    displayPaths: ["Hiking", "Adventure"],
    keywords: [
      "hiking pet backpack", "dog hiking carrier", "outdoor cat carrier", "adventure pet bag",
      "trail pet carrier", "camping with pets", "nature pet gear", "active pet owner gear"
    ],
    finalUrl: "https://getpawsy.pet/products?category=bags"
  },
  {
    campaign: "Pet Carrier Backpack - Search",
    adGroup: "Airline Travel",
    headlines: [
      "Airline Approved Bag",
      "Fly With Your Pet",
      "TSA Pet Carrier",
      "Cabin-Ready Pet Bag",
      "Stress-Free Flying",
      "Travel Pet Essentials"
    ],
    descriptions: [
      "Airline compliant design fits under most seats. Navigate airports with ease.",
      "Designed for jet-setting pets. Secure, comfortable, and flight-ready. Order now!"
    ],
    displayPaths: ["Airline", "Travel"],
    keywords: [
      "airline approved pet carrier", "pet carrier for flying", "tsa pet carrier", "cabin pet bag",
      "flying with cat", "plane pet carrier", "airline cat backpack", "travel pet carrier"
    ],
    finalUrl: "https://getpawsy.pet/products?category=bags"
  },
  {
    campaign: "Pet Carrier Backpack - Search",
    adGroup: "Vet & Errands",
    headlines: [
      "Vet Visit Carrier",
      "Easy Pet Transport",
      "Hands-Free Pet Bag",
      "Secure Pet Carrier",
      "Daily Pet Errands",
      "Safe & Comfortable"
    ],
    descriptions: [
      "Make vet visits stress-free. Secure safety buckles keep your pet calm and safe.",
      "Perfect for daily errands. Hands-free design with padded shoulder straps."
    ],
    displayPaths: ["Vet-Visits", "Daily-Use"],
    keywords: [
      "pet carrier for vet", "cat carrier vet visit", "hands free pet carrier", "secure pet transport",
      "daily pet carrier", "errands with pet", "safe cat carrier", "dog carrier transport"
    ],
    finalUrl: "https://getpawsy.pet/products?category=bags"
  },

  // ================
  // SLOW FEEDER BOWL
  // ================
  {
    campaign: "Slow Feeder Bowl - Search",
    adGroup: "Health Benefits",
    headlines: [
      "Slow Feeder Dog Bowl",
      "Stop Fast Eating",
      "Prevent Dog Bloating",
      "Healthy Eating Habits",
      "Better Digestion",
      "Anti-Choke Bowl"
    ],
    descriptions: [
      "Slow down eating by 10x with maze design. Prevents bloating and improves digestion.",
      "BPA-free, non-slip, and easy to clean. Vet-recommended for healthier mealtimes."
    ],
    displayPaths: ["Health", "Slow-Feed"],
    keywords: [
      "slow feeder dog bowl", "anti gulp dog bowl", "slow eating bowl", "prevent dog bloat",
      "maze dog bowl", "healthy dog bowl", "anti choke bowl", "digestion dog bowl"
    ],
    finalUrl: "https://getpawsy.pet/products?category=feeding"
  },
  {
    campaign: "Slow Feeder Bowl - Search",
    adGroup: "Mental Enrichment",
    headlines: [
      "Dog Puzzle Feeder",
      "Mental Stimulation",
      "End Dog Boredom",
      "Interactive Dog Bowl",
      "Brain Games for Dogs",
      "Fun Mealtime Toy"
    ],
    descriptions: [
      "Turn mealtime into playtime. Challenge your dog's mind with this puzzle feeder.",
      "Reduce anxiety and boredom. Perfect mental enrichment for active dogs."
    ],
    displayPaths: ["Puzzle", "Enrichment"],
    keywords: [
      "dog puzzle feeder", "interactive dog bowl", "mental stimulation dog", "dog enrichment toy",
      "brain games dog", "puzzle bowl dog", "iq dog feeder", "dog boredom solution"
    ],
    finalUrl: "https://getpawsy.pet/products?category=feeding"
  },
  {
    campaign: "Slow Feeder Bowl - Search",
    adGroup: "Cat Slow Feeder",
    headlines: [
      "Cat Slow Feeder",
      "Stop Cat Vomiting",
      "Healthy Cat Eating",
      "Anti-Regurgitation",
      "Cat Puzzle Bowl",
      "Better Cat Digestion"
    ],
    descriptions: [
      "Prevent vomiting from fast eating. Maze design slows cats down naturally.",
      "Perfect for cats who eat too fast. Non-slip base and easy to clean. Shop now!"
    ],
    displayPaths: ["Cat-Health", "Slow-Feed"],
    keywords: [
      "cat slow feeder", "cat anti vomit bowl", "slow eating cat bowl", "cat puzzle feeder",
      "cat digestion bowl", "stop cat regurgitation", "healthy cat bowl", "interactive cat bowl"
    ],
    finalUrl: "https://getpawsy.pet/products?category=feeding"
  },

  // =================
  // CAT PRODUCTS
  // =================
  {
    campaign: "Cat Supplies - Search",
    adGroup: "Cat Furniture",
    headlines: [
      "Cat Trees & Towers",
      "Premium Cat Furniture",
      "Multi-Level Cat Tree",
      "Scratching Post Tower",
      "Cozy Cat Climbing",
      "Happy Indoor Cats"
    ],
    descriptions: [
      "Multi-level cat trees with scratching posts, platforms, and cozy hideaways.",
      "Keep your cat active and entertained. Durable construction. Free shipping!"
    ],
    displayPaths: ["Cat-Trees", "Furniture"],
    keywords: [
      "cat tree", "cat tower", "cat furniture", "scratching post cat tree", "multi level cat tree",
      "cat climbing tree", "indoor cat tree", "large cat tower"
    ],
    finalUrl: "https://getpawsy.pet/products?category=cat-furniture"
  },
  {
    campaign: "Cat Supplies - Search",
    adGroup: "Cat Beds",
    headlines: [
      "Cozy Cat Beds",
      "Calming Cat Bed",
      "Warm Cat Sleeping",
      "Plush Cat Nest",
      "Cat Cave Beds",
      "Luxury Cat Comfort"
    ],
    descriptions: [
      "Ultra-soft cat beds for maximum comfort. Calming design reduces cat anxiety.",
      "Give your cat the perfect nap spot. Machine washable. Various sizes available."
    ],
    displayPaths: ["Cat-Beds", "Comfort"],
    keywords: [
      "cat bed", "calming cat bed", "cat cave bed", "plush cat bed", "warm cat bed",
      "cozy cat sleeping", "donut cat bed", "cat anxiety bed"
    ],
    finalUrl: "https://getpawsy.pet/products?category=cat-beds"
  },
  {
    campaign: "Cat Supplies - Search",
    adGroup: "Cat Toys",
    headlines: [
      "Interactive Cat Toys",
      "Chase Toys for Cats",
      "Feather Cat Wands",
      "Laser Cat Toys",
      "Cat Entertainment",
      "Keep Cats Active"
    ],
    descriptions: [
      "Interactive toys to keep your cat entertained for hours. Stimulate natural instincts.",
      "From feather wands to laser pointers. Everything your cat needs to play and exercise."
    ],
    displayPaths: ["Cat-Toys", "Play"],
    keywords: [
      "cat toys", "interactive cat toy", "feather wand cat", "laser toy cat", "cat chase toys",
      "cat entertainment", "kitten toys", "cat exercise toys"
    ],
    finalUrl: "https://getpawsy.pet/products?category=chase-toys"
  },

  // =================
  // DOG PRODUCTS
  // =================
  {
    campaign: "Dog Supplies - Search",
    adGroup: "Dog Beds",
    headlines: [
      "Orthopedic Dog Beds",
      "Memory Foam Dog Bed",
      "Cozy Dog Sleeping",
      "Joint Support Bed",
      "Large Dog Beds",
      "Calming Dog Bed"
    ],
    descriptions: [
      "Orthopedic memory foam beds for dogs of all sizes. Perfect for senior dogs.",
      "Give your pup the best sleep. Machine washable covers. Free shipping on orders!"
    ],
    displayPaths: ["Dog-Beds", "Comfort"],
    keywords: [
      "dog bed", "orthopedic dog bed", "memory foam dog bed", "large dog bed", "calming dog bed",
      "senior dog bed", "cozy dog bed", "waterproof dog bed"
    ],
    finalUrl: "https://getpawsy.pet/products?category=pet-beds"
  },
  {
    campaign: "Dog Supplies - Search",
    adGroup: "Dog Collars & Leashes",
    headlines: [
      "Durable Dog Collars",
      "Premium Dog Leashes",
      "Reflective Dog Gear",
      "Adjustable Collars",
      "Walking Essentials",
      "Safe Dog Walking"
    ],
    descriptions: [
      "High-quality collars and leashes for daily walks. Reflective for night safety.",
      "Durable construction for active dogs. Adjustable sizing for perfect fit."
    ],
    displayPaths: ["Collars", "Leashes"],
    keywords: [
      "dog collar", "dog leash", "reflective dog collar", "durable dog leash", "adjustable dog collar",
      "walking dog gear", "night safety collar", "strong dog leash"
    ],
    finalUrl: "https://getpawsy.pet/products?category=dog-collars-leashes"
  },
  {
    campaign: "Dog Supplies - Search",
    adGroup: "Dog Toys",
    headlines: [
      "Durable Dog Toys",
      "Chew Toys for Dogs",
      "Interactive Dog Play",
      "Fetch Toys Dogs",
      "Tough Dog Toys",
      "Exercise Dog Toys"
    ],
    descriptions: [
      "Durable toys built to last. Perfect for aggressive chewers and active play.",
      "From fetch toys to puzzles. Keep your dog entertained and mentally stimulated."
    ],
    displayPaths: ["Dog-Toys", "Play"],
    keywords: [
      "dog toys", "durable dog toys", "chew toys dog", "interactive dog toy", "fetch toys",
      "tough dog toys", "dog puzzle toy", "dog exercise toys"
    ],
    finalUrl: "https://getpawsy.pet/products?category=toys"
  },

  // =================
  // GROOMING
  // =================
  {
    campaign: "Pet Grooming - Search",
    adGroup: "Grooming Tools",
    headlines: [
      "Pet Grooming Tools",
      "Deshedding Brushes",
      "Nail Clippers Pets",
      "Professional Grooming",
      "At-Home Pet Care",
      "Reduce Pet Shedding"
    ],
    descriptions: [
      "Professional grooming tools for at-home use. Reduce shedding and keep coats healthy.",
      "From brushes to nail clippers. Everything you need for a well-groomed pet."
    ],
    displayPaths: ["Grooming", "Pet-Care"],
    keywords: [
      "pet grooming tools", "dog brush", "cat brush", "deshedding tool", "pet nail clippers",
      "grooming kit pet", "reduce shedding", "pet hair brush"
    ],
    finalUrl: "https://getpawsy.pet/products?category=grooming"
  },

  // =================
  // BRAND CAMPAIGNS
  // =================
  {
    campaign: "GetPawsy Brand - Search",
    adGroup: "Brand Awareness",
    headlines: [
      "GetPawsy Pet Shop",
      "Premium Pet Supplies",
      "Happy Pets Worldwide",
      "Quality Pet Products",
      "Trusted Pet Store",
      "Free Global Shipping"
    ],
    descriptions: [
      "Your one-stop shop for premium pet supplies. Dogs, cats, birds & small pets.",
      "Trusted by pet parents worldwide. Free shipping on all orders. Shop now!"
    ],
    displayPaths: ["Shop", "Pet-Supplies"],
    keywords: [
      "getpawsy", "get pawsy", "pawsy pet shop", "online pet store", "pet supplies online",
      "buy pet products", "pet shop free shipping", "quality pet supplies"
    ],
    finalUrl: "https://getpawsy.pet"
  },
  {
    campaign: "GetPawsy Brand - Search",
    adGroup: "Free Shipping",
    headlines: [
      "Free Worldwide Ship",
      "No Minimum Order",
      "Fast Pet Delivery",
      "Shop Pet Supplies",
      "Delivered to You",
      "Order Today"
    ],
    descriptions: [
      "Free worldwide shipping on all pet products. No minimum order required.",
      "Quality pet supplies delivered to your door. Trusted by 10,000+ pet parents."
    ],
    displayPaths: ["Free-Ship", "Worldwide"],
    keywords: [
      "pet supplies free shipping", "pet store free delivery", "buy pet products online",
      "pet shop worldwide shipping", "cheap pet supplies", "pet products delivery"
    ],
    finalUrl: "https://getpawsy.pet"
  }
];

// Generate Responsive Search Ads CSV (Google Ads Editor format)
// CRITICAL: Must include "Row Type" or ad-type indicator for proper import
// Reference: https://support.google.com/google-ads/editor/answer/57747
export function generateResponsiveAdsCSV(): string {
  // Google Ads Editor requires specific column headers in English
  // Ad Type must be specified for responsive search ads
  const headers = [
    "Campaign",
    "Ad Group",
    "Ad type",
    "Headline 1",
    "Headline 2",
    "Headline 3",
    "Headline 4",
    "Headline 5",
    "Headline 6",
    "Headline 7",
    "Headline 8",
    "Headline 9",
    "Headline 10",
    "Headline 11",
    "Headline 12",
    "Headline 13",
    "Headline 14",
    "Headline 15",
    "Description 1",
    "Description 2",
    "Description 3",
    "Description 4",
    "Path 1",
    "Path 2",
    "Final URL",
    "Status"
  ];
  
  const rows = campaignData.map(ad => [
    ad.campaign,
    ad.adGroup,
    "Responsive search ad", // Required ad type identifier
    ad.headlines[0] || "",
    ad.headlines[1] || "",
    ad.headlines[2] || "",
    ad.headlines[3] || "",
    ad.headlines[4] || "",
    ad.headlines[5] || "",
    ad.headlines[6] || "",
    ad.headlines[7] || "",
    ad.headlines[8] || "",
    ad.headlines[9] || "",
    ad.headlines[10] || "",
    ad.headlines[11] || "",
    ad.headlines[12] || "",
    ad.headlines[13] || "",
    ad.headlines[14] || "",
    ad.descriptions[0] || "",
    ad.descriptions[1] || "",
    ad.descriptions[2] || "",
    ad.descriptions[3] || "",
    ad.displayPaths[0] || "",
    ad.displayPaths[1] || "",
    ad.finalUrl,
    "Enabled"
  ]);
  
  const csvContent = [
    headers.join(","),
    ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(","))
  ].join("\n");
  
  return csvContent;
}

// Generate Keywords CSV (Google Ads Editor format)
// Must include proper Match Type column
export function generateKeywordsCSV(): string {
  const headers = [
    "Campaign",
    "Ad Group",
    "Keyword",
    "Criterion Type", // Google Ads Editor uses "Criterion Type" or "Match Type"
    "Status",
    "Max CPC"
  ];
  
  const rows: string[][] = [];
  
  campaignData.forEach(ad => {
    ad.keywords.forEach(keyword => {
      // Add broad match (default)
      rows.push([ad.campaign, ad.adGroup, keyword, "Broad", "Enabled", ""]);
      // Add phrase match
      rows.push([ad.campaign, ad.adGroup, `"${keyword}"`, "Phrase", "Enabled", ""]);
      // Add exact match
      rows.push([ad.campaign, ad.adGroup, `[${keyword}]`, "Exact", "Enabled", ""]);
    });
  });
  
  const csvContent = [
    headers.join(","),
    ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(","))
  ].join("\n");
  
  return csvContent;
}

// Generate Campaign Structure CSV with Ad Groups
// IMPORTANT: Campaigns and Ad Groups must be created before ads can be assigned
export function generateCampaignStructureCSV(): string {
  // Campaigns CSV - Google Ads Editor format
  const campaignHeaders = [
    "Campaign",
    "Campaign type",
    "Campaign status",
    "Budget",
    "Budget type",
    "Bid strategy type",
    "Networks",
    "Languages",
    "Locations"
  ];
  
  const campaigns = [...new Set(campaignData.map(ad => ad.campaign))];
  
  const campaignRows = campaigns.map(campaign => [
    campaign,
    "Search",
    "Enabled",
    "15.00",
    "Daily",
    "Maximize conversions",
    "Google Search;Search Partners",
    "en", // English language code
    "US" // United States
  ]);
  
  const csvContent = [
    campaignHeaders.join(","),
    ...campaignRows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(","))
  ].join("\n");
  
  return csvContent;
}

// Generate Ad Groups CSV - separate from campaigns for cleaner import
export function generateAdGroupsCSV(): string {
  const headers = [
    "Campaign",
    "Ad Group",
    "Ad Group status",
    "Max CPC"
  ];
  
  const adGroupRows = campaignData.map(ad => [
    ad.campaign,
    ad.adGroup,
    "Enabled",
    "1.00" // Default max CPC, can be adjusted in Google Ads
  ]);
  
  const csvContent = [
    headers.join(","),
    ...adGroupRows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(","))
  ].join("\n");
  
  return csvContent;
}

// Generate Sitelinks CSV - Google Ads Editor format
// Reference: https://support.google.com/google-ads/editor/answer/57747
export function generateSitelinksCSV(): string {
  // Sitelink extensions require specific column format
  const headers = [
    "Campaign",
    "Sitelink text",
    "Description line 1",
    "Description line 2",
    "Final URL",
    "Start date",
    "End date",
    "Device preference",
    "Status"
  ];
  
  const campaigns = [...new Set(campaignData.map(ad => ad.campaign))];
  
  const sitelinks = [
    {
      text: "Dog Supplies",
      url: "https://getpawsy.pet/products?category=dogs",
      desc1: "Everything for your dog",
      desc2: "Collars, toys, beds & more"
    },
    {
      text: "Cat Essentials",
      url: "https://getpawsy.pet/products?category=cats",
      desc1: "Premium cat products",
      desc2: "Trees, beds, toys & feeders"
    },
    {
      text: "GPS Pet Trackers",
      url: "https://getpawsy.pet/products?category=dog-collars-leashes",
      desc1: "Never lose your pet",
      desc2: "Real-time GPS tracking"
    },
    {
      text: "Free Shipping",
      url: "https://getpawsy.pet/shipping",
      desc1: "Worldwide free delivery",
      desc2: "No minimum order required"
    }
  ];
  
  const rows: string[][] = [];
  
  campaigns.forEach(campaign => {
    sitelinks.forEach(sitelink => {
      rows.push([
        campaign,
        sitelink.text,
        sitelink.desc1,
        sitelink.desc2,
        sitelink.url,
        "",
        "",
        "All",
        "Enabled"
      ]);
    });
  });
  
  const csvContent = [
    headers.join(","),
    ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(","))
  ].join("\n");
  
  return csvContent;
}

// Generate a COMBINED import file - single CSV with all entities
// This is the RECOMMENDED approach for Google Ads Editor
export function generateCombinedImportCSV(): string {
  // This combined format allows importing everything in one file
  // Google Ads Editor will automatically recognize different row types
  
  // First section: Campaigns
  let content = "Campaign,Campaign type,Campaign status,Budget,Budget type,Bid strategy type,Networks,Languages,Locations\n";
  
  const campaigns = [...new Set(campaignData.map(ad => ad.campaign))];
  campaigns.forEach(campaign => {
    content += `"${campaign}","Search","Enabled","15.00","Daily","Maximize conversions","Google Search;Search Partners","en","US"\n`;
  });
  
  content += "\n";
  
  // Second section: Ad Groups
  content += "Campaign,Ad Group,Ad Group status,Max CPC\n";
  campaignData.forEach(ad => {
    content += `"${ad.campaign}","${ad.adGroup}","Enabled","1.00"\n`;
  });
  
  content += "\n";
  
  // Third section: Responsive Search Ads
  content += "Campaign,Ad Group,Ad type,Headline 1,Headline 2,Headline 3,Headline 4,Headline 5,Headline 6,Description 1,Description 2,Path 1,Path 2,Final URL,Status\n";
  campaignData.forEach(ad => {
    const headlines = ad.headlines.slice(0, 6).map(h => `"${h.replace(/"/g, '""')}"`).join(",");
    const paddedHeadlines = headlines + ",".repeat(Math.max(0, 6 - ad.headlines.length));
    content += `"${ad.campaign}","${ad.adGroup}","Responsive search ad",${headlines}${"," .repeat(Math.max(0, 6 - ad.headlines.slice(0, 6).length))}"${ad.descriptions[0] || ""}","${ad.descriptions[1] || ""}","${ad.displayPaths[0] || ""}","${ad.displayPaths[1] || ""}","${ad.finalUrl}","Enabled"\n`;
  });
  
  return content;
}

// Generate Image Assets Instructions (NOT CSV - Google Ads Editor doesn't support image CSV imports)
export function generateImageAssetsInstructions(): string {
  const instructions = `
================================================================================
                    GOOGLE ADS IMAGE ASSETS - MANUAL SETUP GUIDE
================================================================================

⚠️  IMPORTANT: Google Ads Editor does NOT support CSV imports for image assets.
    You must add images manually via the Google Ads Editor or web interface.

================================================================================
                              IMAGE ASSETS TO ADD
================================================================================

1. SQUARE IMAGE (1:1 ratio - 1200x1200px)
   ─────────────────────────────────────────
   Name: GetPawsy Square Marketing Image
   URL:  https://getpawsy.pet/ads/google-ads-square.jpg
   Use:  Main marketing image for responsive display ads

2. LANDSCAPE IMAGE (1.91:1 ratio - 1200x628px)
   ─────────────────────────────────────────
   Name: GetPawsy Landscape Banner
   URL:  https://getpawsy.pet/ads/google-ads-landscape.jpg
   Use:  Wide banner for display network

3. LOGO SQUARE (1:1 ratio - 1200x1200px)
   ─────────────────────────────────────────
   Name: GetPawsy Logo Square
   URL:  https://getpawsy.pet/ads/google-ads-logo.png
   Use:  Square logo for brand recognition

4. LOGO LANDSCAPE (4:1 ratio - 1200x300px)
   ─────────────────────────────────────────
   Name: GetPawsy Logo Landscape
   URL:  https://getpawsy.pet/ads/google-ads-logo-landscape.png
   Use:  Wide logo for horizontal placements

================================================================================
                         HOW TO ADD IMAGES IN GOOGLE ADS EDITOR
================================================================================

STEP 1: Open Google Ads Editor
        └── Make sure your campaigns are already imported

STEP 2: Navigate to Shared Library
        └── Left panel → "Shared Library" → "Assets" → "Images"

STEP 3: Add New Images
        └── Click "+ Add" button
        └── Select "Images from URL" option

STEP 4: Enter Image URLs
        └── Paste each URL from above one at a time
        └── Google Ads will automatically download and validate

STEP 5: Assign to Campaigns
        └── After adding, select the images
        └── Right-click → "Assign to campaigns"
        └── Select all relevant campaigns

================================================================================
                         ALTERNATIVE: GOOGLE ADS WEB INTERFACE
================================================================================

1. Go to ads.google.com
2. Navigate to: Tools & Settings → Shared Library → Asset Library
3. Click "+ Create asset" → "Image"
4. Upload or enter URL for each image
5. Images will be available for all campaigns in your account

================================================================================
                              QUICK DOWNLOAD LINKS
================================================================================

Click these links to download images directly to your computer:

• Square Image:     https://getpawsy.pet/ads/google-ads-square.jpg
• Landscape Image:  https://getpawsy.pet/ads/google-ads-landscape.jpg
• Logo Square:      https://getpawsy.pet/ads/google-ads-logo.png
• Logo Landscape:   https://getpawsy.pet/ads/google-ads-logo-landscape.png

================================================================================
                              RECOMMENDED IMAGE SPECS
================================================================================

For best results, Google Ads recommends:

Marketing Images:
  • Square (1:1):      Min 300x300px, Max 5120x5120px, Recommended 1200x1200px
  • Landscape (1.91:1): Min 600x314px, Max 5120x5120px, Recommended 1200x628px

Logo Images:
  • Square (1:1):      Min 128x128px, Max 5120x5120px, Recommended 1200x1200px  
  • Landscape (4:1):   Min 512x128px, Max 5120x5120px, Recommended 1200x300px

File Types: JPG, PNG, GIF (static only)
Max File Size: 5MB per image

================================================================================
`;

  return instructions.trim();
}

// Legacy function name for backwards compatibility
export const generateImageAssetsCSV = generateImageAssetsInstructions;

// Download helper with iOS Files app support
export async function downloadCSV(content: string, filename: string): Promise<void> {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  
  // Check if Web Share API is available (iOS Safari supports this)
  if (navigator.share && navigator.canShare) {
    const file = new File([blob], filename, { type: "text/csv" });
    const shareData = { files: [file] };
    
    // Check if we can share files
    if (navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        // User cancelled or share failed, fall back to regular download
        if ((err as Error).name === 'AbortError') {
          return; // User cancelled, don't show error
        }
      }
    }
  }
  
  // Fallback: regular download for desktop browsers
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Export all files as a zip-like bundle (individual downloads)
export function exportAllGoogleAds(): void {
  const timestamp = new Date().toISOString().split('T')[0];
  
  // Download all CSVs with timestamps - in correct import order
  downloadCSV(generateCampaignStructureCSV(), `01_campaigns_${timestamp}.csv`);
  
  setTimeout(() => {
    downloadCSV(generateAdGroupsCSV(), `02_adgroups_${timestamp}.csv`);
  }, 400);
  
  setTimeout(() => {
    downloadCSV(generateResponsiveAdsCSV(), `03_ads_${timestamp}.csv`);
  }, 800);
  
  setTimeout(() => {
    downloadCSV(generateKeywordsCSV(), `04_keywords_${timestamp}.csv`);
  }, 1200);
  
  setTimeout(() => {
    downloadCSV(generateSitelinksCSV(), `05_sitelinks_${timestamp}.csv`);
  }, 1600);
  
  setTimeout(() => {
    downloadCSV(generateImageAssetsInstructions(), `images_instructions_${timestamp}.txt`);
  }, 2000);
}

// Export all files as a single ZIP file
export async function exportAllAsZip(): Promise<void> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const timestamp = new Date().toISOString().split('T')[0];
  
  // Add all CSV files to the ZIP with proper naming for import order
  zip.file(`01_campaigns_${timestamp}.csv`, generateCampaignStructureCSV());
  zip.file(`02_adgroups_${timestamp}.csv`, generateAdGroupsCSV());
  zip.file(`03_ads_${timestamp}.csv`, generateResponsiveAdsCSV());
  zip.file(`04_keywords_${timestamp}.csv`, generateKeywordsCSV());
  zip.file(`05_sitelinks_${timestamp}.csv`, generateSitelinksCSV());
  zip.file(`images_instructions_${timestamp}.txt`, generateImageAssetsInstructions());
  
  // Generate and download the ZIP
  const content = await zip.generateAsync({ type: 'blob' });
  const filename = `getpawsy_google_ads_${timestamp}.zip`;
  
  // Check if Web Share API is available (iOS Safari)
  if (navigator.share && navigator.canShare) {
    const file = new File([content], filename, { type: 'application/zip' });
    const shareData = { files: [file] };
    
    if (navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          return;
        }
      }
    }
  }
  
  // Fallback: regular download
  const link = document.createElement('a');
  const url = URL.createObjectURL(content);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Image assets configuration for Google Ads
const imageAssets = [
  {
    name: 'getpawsy_square_1200x1200.jpg',
    url: 'https://getpawsy.pet/ads/google-ads-square.jpg',
    type: 'Marketing Square (1:1)'
  },
  {
    name: 'getpawsy_landscape_1200x628.jpg', 
    url: 'https://getpawsy.pet/ads/google-ads-landscape.jpg',
    type: 'Marketing Landscape (1.91:1)'
  },
  {
    name: 'getpawsy_logo_square_1200x1200.png',
    url: 'https://getpawsy.pet/ads/google-ads-logo.png',
    type: 'Logo Square (1:1)'
  },
  {
    name: 'getpawsy_logo_landscape_1200x300.png',
    url: 'https://getpawsy.pet/ads/google-ads-logo-landscape.png',
    type: 'Logo Landscape (4:1)'
  }
];

// Export image assets as a ZIP folder for Google Ads Editor import
// Use: Account → Import → Import image assets from files → Select folder
export async function exportImageAssetsZip(): Promise<void> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const timestamp = new Date().toISOString().split('T')[0];
  
  // Create a folder inside the ZIP for better organization
  const imagesFolder = zip.folder('getpawsy_image_assets');
  
  if (!imagesFolder) {
    throw new Error('Failed to create images folder in ZIP');
  }
  
  // Fetch and add each image to the ZIP
  const fetchPromises = imageAssets.map(async (asset) => {
    try {
      const response = await fetch(asset.url);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${asset.name}: ${response.statusText}`);
      }
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      imagesFolder.file(asset.name, arrayBuffer);
      return { success: true, name: asset.name };
    } catch (error) {
      console.error(`Error fetching ${asset.name}:`, error);
      return { success: false, name: asset.name, error };
    }
  });
  
  const results = await Promise.all(fetchPromises);
  const failedDownloads = results.filter(r => !r.success);
  
  if (failedDownloads.length > 0) {
    console.warn('Some images failed to download:', failedDownloads);
  }
  
  // Add a README with import instructions
  const readme = `
================================================================================
                    GETPAWSY IMAGE ASSETS - IMPORT INSTRUCTIONS
================================================================================

Deze map bevat alle image assets voor je Google Ads campagnes.

HOE TE IMPORTEREN IN GOOGLE ADS EDITOR:
────────────────────────────────────────

1. Pak deze ZIP uit naar een map op je computer

2. Open Google Ads Editor

3. Ga naar: Account → Import → Import image assets from files

4. Selecteer de "getpawsy_image_assets" map

5. Klik "Import" - alle afbeeldingen worden automatisch toegevoegd

6. De afbeeldingen verschijnen onder: Shared Library → Assets → Images

INHOUD VAN DEZE MAP:
────────────────────
${imageAssets.map(a => `• ${a.name} - ${a.type}`).join('\n')}

BELANGRIJK:
────────────
• Bestandsnamen bevatten de afmetingen voor eenvoudige identificatie
• Na import kun je afbeeldingen toewijzen aan campagnes via rechtermuisknop
• Alle afbeeldingen zijn geoptimaliseerd voor Google Ads vereisten

Generated: ${new Date().toLocaleString('nl-NL')}
================================================================================
`;
  
  imagesFolder.file('README.txt', readme.trim());
  
  // Generate and download the ZIP
  const content = await zip.generateAsync({ type: 'blob' });
  const filename = `getpawsy_image_assets_${timestamp}.zip`;
  
  // Check if Web Share API is available (iOS Safari)
  if (navigator.share && navigator.canShare) {
    const file = new File([content], filename, { type: 'application/zip' });
    const shareData = { files: [file] };
    
    if (navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          return;
        }
      }
    }
  }
  
  // Fallback: regular download
  const link = document.createElement('a');
  const url = URL.createObjectURL(content);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Export COMPLETE campaign package: All CSVs + All Images in one ZIP
// This is the ultimate one-click solution for Google Ads setup
export async function exportCompleteCampaignPackage(
  onProgress?: (stage: string, percent: number) => void
): Promise<void> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const timestamp = new Date().toISOString().split('T')[0];
  
  onProgress?.('CSV bestanden toevoegen...', 10);
  
  // Create folders for organization
  const csvFolder = zip.folder('01_csv_files');
  const imagesFolder = zip.folder('02_image_assets');
  
  if (!csvFolder || !imagesFolder) {
    throw new Error('Failed to create folders in ZIP');
  }
  
  // Add all CSV files with proper naming for import order
  csvFolder.file(`01_campaigns_${timestamp}.csv`, generateCampaignStructureCSV());
  csvFolder.file(`02_adgroups_${timestamp}.csv`, generateAdGroupsCSV());
  csvFolder.file(`03_ads_${timestamp}.csv`, generateResponsiveAdsCSV());
  csvFolder.file(`04_keywords_${timestamp}.csv`, generateKeywordsCSV());
  csvFolder.file(`05_sitelinks_${timestamp}.csv`, generateSitelinksCSV());
  
  onProgress?.('Afbeeldingen downloaden...', 30);
  
  // Fetch and add each image to the ZIP
  const fetchPromises = imageAssets.map(async (asset, index) => {
    try {
      const response = await fetch(asset.url);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${asset.name}: ${response.statusText}`);
      }
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      imagesFolder.file(asset.name, arrayBuffer);
      onProgress?.(`Afbeelding ${index + 1}/${imageAssets.length} geladen...`, 30 + ((index + 1) / imageAssets.length) * 40);
      return { success: true, name: asset.name };
    } catch (error) {
      console.error(`Error fetching ${asset.name}:`, error);
      return { success: false, name: asset.name, error };
    }
  });
  
  await Promise.all(fetchPromises);
  
  onProgress?.('ZIP genereren...', 80);
  
  // Add comprehensive README with CORRECT import instructions
  const readme = `
================================================================================
            GETPAWSY COMPLETE GOOGLE ADS CAMPAIGN PACKAGE
================================================================================

Generated: ${new Date().toLocaleString('nl-NL')}

This ZIP contains EVERYTHING you need to set up your Google Ads campaigns!

================================================================================
                               CONTENTS
================================================================================

📁 01_csv_files/
   ├── 01_campaigns_${timestamp}.csv   → Campaign settings (import FIRST)
   ├── 02_adgroups_${timestamp}.csv    → Ad Groups (import SECOND)
   ├── 03_ads_${timestamp}.csv         → Responsive Search Ads
   ├── 04_keywords_${timestamp}.csv    → Keywords (broad, phrase, exact)
   └── 05_sitelinks_${timestamp}.csv   → Sitelink extensions

📁 02_image_assets/
   ├── getpawsy_square_1200x1200.jpg        → Marketing image (1:1)
   ├── getpawsy_landscape_1200x628.jpg      → Marketing banner (1.91:1)
   ├── getpawsy_logo_square_1200x1200.png   → Logo square (1:1)
   └── getpawsy_logo_landscape_1200x300.png → Logo wide (4:1)

================================================================================
                    ⚠️  CRITICAL: IMPORT ORDER MATTERS!
================================================================================

You MUST import files in the correct order. Campaigns and Ad Groups must exist
before you can add ads, keywords, or sitelinks to them.

================================================================================
                          STEP-BY-STEP IMPORT GUIDE
================================================================================

STEP 1: DOWNLOAD GOOGLE ADS EDITOR
──────────────────────────────────────
• Download: https://ads.google.com/home/tools/ads-editor/
• Install and sign in with your Google Ads account
• Click "Get recent changes" to sync your account

STEP 2: IMPORT CAMPAIGNS (FIRST!)
──────────────────────────────────────
1. Go to: Account → Import → From file...
2. Select: 01_campaigns_${timestamp}.csv
3. Verify column headers are correctly detected:
   - Campaign, Campaign type, Campaign status, Budget, etc.
4. Click "Import"
5. Review and keep proposed changes

STEP 3: IMPORT AD GROUPS (SECOND!)
──────────────────────────────────────
1. Go to: Account → Import → From file...
2. Select: 02_adgroups_${timestamp}.csv
3. Verify column headers:
   - Campaign, Ad Group, Ad Group status, Max CPC
4. Click "Import"
5. Review and keep proposed changes

STEP 4: IMPORT ADS
──────────────────────────────────────
1. Go to: Account → Import → From file...
2. Select: 03_ads_${timestamp}.csv
3. Verify column headers:
   - Campaign, Ad Group, Ad type (should say "Responsive search ad")
   - Headline 1-15, Description 1-4, Path 1, Path 2, Final URL
4. Click "Import"
5. Review and keep proposed changes

STEP 5: IMPORT KEYWORDS
──────────────────────────────────────
1. Go to: Account → Import → From file...
2. Select: 04_keywords_${timestamp}.csv
3. Verify column headers:
   - Campaign, Ad Group, Keyword, Criterion Type, Status
4. Click "Import"
5. Review and keep proposed changes

STEP 6: IMPORT SITELINKS
──────────────────────────────────────
1. Go to: Account → Import → From file...
2. Select: 05_sitelinks_${timestamp}.csv
3. Verify column headers:
   - Campaign, Sitelink text, Description line 1, Description line 2, Final URL
4. Click "Import"
5. Review and keep proposed changes

STEP 7: ADD IMAGE ASSETS
──────────────────────────────────────
1. In Google Ads Editor, go to: Shared Library → Assets → Images
2. Click "+ Add" → "From file"
3. Select all images from the "02_image_assets" folder
4. After adding, right-click images → "Assign to campaigns"
5. Select all campaigns

STEP 8: CONFIGURE SETTINGS
──────────────────────────────────────
1. Select each campaign and verify:
   - Budget: Set your daily budget (start with $10-20)
   - Bid strategy: "Maximize conversions" (recommended)
   - Location: United States
   - Language: English

STEP 9: POST CHANGES
──────────────────────────────────────
1. Click "Post" in the top toolbar
2. Review all changes one more time
3. Click "Post" to upload to Google Ads
4. Wait for Google to review your ads (24-48 hours)

================================================================================
                        TROUBLESHOOTING COMMON ERRORS
================================================================================

ERROR: "Some required columns are not specified"
→ Make sure column headers match exactly (Campaign, Ad Group, etc.)
→ Headers are case-insensitive but must be in English

ERROR: "Campaign not found"
→ Import campaigns CSV FIRST before other files
→ Campaign names must match exactly

ERROR: "Ad Group not found"
→ Import ad groups CSV before ads/keywords
→ Ad group names must match exactly

ERROR: "CSV header missing"
→ Your file may have been saved incorrectly
→ Re-export and ensure UTF-8 encoding

================================================================================
                               CAMPAIGN STATS
================================================================================

• Campaigns: 7 (GPS Fence, Pet Carrier, Slow Feeder, Cat, Dog, Grooming, Brand)
• Ad Groups: 20 (multiple per campaign)
• Keywords: 316+ (broad, phrase, and exact match)
• Sitelinks: 28 (4 per campaign)
• Image Assets: 4 (square, landscape, logos)

================================================================================
                               SUPPORT
================================================================================

Questions? Visit: https://getpawsy.pet/contact

Happy advertising! 🎉
================================================================================
`;

  zip.file('README.txt', readme.trim());
  
  onProgress?.('ZIP voltooien...', 95);
  
  // Generate and download the ZIP
  const content = await zip.generateAsync({ type: 'blob' });
  const filename = `getpawsy_complete_campaign_package_${timestamp}.zip`;
  
  onProgress?.('Downloaden...', 100);
  
  // Check if Web Share API is available (iOS Safari)
  if (navigator.share && navigator.canShare) {
    const file = new File([content], filename, { type: 'application/zip' });
    const shareData = { files: [file] };
    
    if (navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          return;
        }
      }
    }
  }
  
  // Fallback: regular download
  const link = document.createElement('a');
  const url = URL.createObjectURL(content);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Get list of image assets for display purposes
export function getImageAssetsList() {
  return imageAssets;
}

// Parse CSV string to 2D array
function parseCSVToArray(csv: string): string[][] {
  const lines = csv.trim().split('\n');
  return lines.map(line => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  });
}

// Data validation options for different column types
const dataValidationOptions = {
  campaignStatus: ['Enabled', 'Paused', 'Removed'],
  adGroupStatus: ['Enabled', 'Paused', 'Removed'],
  adStatus: ['Enabled', 'Paused'],
  keywordMatchType: ['Exact', 'Phrase', 'Broad'],
  keywordStatus: ['Enabled', 'Paused'],
  biddingStrategy: ['Maximize conversions', 'Maximize clicks', 'Target CPA', 'Target ROAS', 'Manual CPC'],
  campaignType: ['Search', 'Display', 'Shopping', 'Video', 'Performance Max'],
  adType: ['Responsive search ad', 'Expanded text ad'],
  sitelinkStatus: ['Enabled', 'Paused'],
  imageAssetType: ['MARKETING_IMAGE', 'SQUARE_MARKETING_IMAGE', 'LOGO', 'LANDSCAPE_LOGO']
};

// Column to validation mapping per sheet
const sheetValidationConfig: Record<string, Record<string, string[]>> = {
  'Campaigns': {
    'Campaign Status': dataValidationOptions.campaignStatus,
    'Ad Group Status': dataValidationOptions.adGroupStatus,
    'Bidding Strategy': dataValidationOptions.biddingStrategy,
    'Campaign Type': dataValidationOptions.campaignType
  },
  'Ads': {
    'Campaign Status': dataValidationOptions.campaignStatus,
    'Ad Group Status': dataValidationOptions.adGroupStatus,
    'Status': dataValidationOptions.adStatus,
    'Ad Type': dataValidationOptions.adType
  },
  'Keywords': {
    'Campaign Status': dataValidationOptions.campaignStatus,
    'Ad Group Status': dataValidationOptions.adGroupStatus,
    'Status': dataValidationOptions.keywordStatus,
    'Match Type': dataValidationOptions.keywordMatchType
  },
  'Sitelinks': {
    'Status': dataValidationOptions.sitelinkStatus
  },
  'Images': {
    'Asset Type': dataValidationOptions.imageAssetType
  }
};

// Default Excel color scheme
export const defaultExcelColors = {
  campaigns: '2563EB',   // Blue
  ads: '7C3AED',         // Purple
  keywords: '059669',    // Green
  sitelinks: 'EA580C',   // Orange
  images: 'DC2626',      // Red
  evenRow: 'F3F4F6',     // Light gray
  border: 'E5E7EB'       // Border gray
};

// Preset color schemes
export const excelColorPresets: Record<string, typeof defaultExcelColors> = {
  default: defaultExcelColors,
  ocean: {
    campaigns: '0EA5E9',
    ads: '06B6D4',
    keywords: '14B8A6',
    sitelinks: '0D9488',
    images: '0891B2',
    evenRow: 'F0FDFA',
    border: 'CCFBF1'
  },
  sunset: {
    campaigns: 'F59E0B',
    ads: 'EF4444',
    keywords: 'EC4899',
    sitelinks: 'F97316',
    images: 'DC2626',
    evenRow: 'FFF7ED',
    border: 'FED7AA'
  },
  forest: {
    campaigns: '16A34A',
    ads: '15803D',
    keywords: '166534',
    sitelinks: '22C55E',
    images: '4ADE80',
    evenRow: 'F0FDF4',
    border: 'BBF7D0'
  },
  monochrome: {
    campaigns: '374151',
    ads: '4B5563',
    keywords: '6B7280',
    sitelinks: '1F2937',
    images: '111827',
    evenRow: 'F9FAFB',
    border: 'E5E7EB'
  },
  corporate: {
    campaigns: '1E40AF',
    ads: '1E3A8A',
    keywords: '1D4ED8',
    sitelinks: '2563EB',
    images: '3B82F6',
    evenRow: 'EFF6FF',
    border: 'BFDBFE'
  }
};

export type ExcelColorScheme = typeof defaultExcelColors;

// Available sheets for export
export type ExcelSheetKey = 'campaigns' | 'ads' | 'keywords' | 'sitelinks' | 'images';

export const excelSheetOptions: { key: ExcelSheetKey; label: string }[] = [
  { key: 'campaigns', label: 'Campaigns' },
  { key: 'ads', label: 'Ads' },
  { key: 'keywords', label: 'Keywords' },
  { key: 'sitelinks', label: 'Sitelinks' },
  { key: 'images', label: 'Images' }
];

export interface ExcelExportOptions {
  colors: ExcelColorScheme;
  sheets: ExcelSheetKey[];
}

// Export all files as Excel (.xlsx) with multiple sheets and styled headers
export async function exportAllAsExcel(
  colors: ExcelColorScheme = defaultExcelColors,
  sheets: ExcelSheetKey[] = ['campaigns', 'ads', 'keywords', 'sitelinks', 'images']
): Promise<void> {
  const XLSX = await import('xlsx-js-style');
  const timestamp = new Date().toISOString().split('T')[0];
  
  // Create workbook
  const workbook = XLSX.utils.book_new();
  
  // Define header style with brand colors
  const headerStyle = {
    fill: { fgColor: { rgb: "2563EB" } }, // Blue background
    font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
    alignment: { horizontal: "center", vertical: "center" },
    border: {
      top: { style: "thin", color: { rgb: "1E40AF" } },
      bottom: { style: "thin", color: { rgb: "1E40AF" } },
      left: { style: "thin", color: { rgb: "1E40AF" } },
      right: { style: "thin", color: { rgb: "1E40AF" } }
    }
  };
  
  // Alternating row styles
  const evenRowStyle = {
    fill: { fgColor: { rgb: colors.evenRow } },
    border: {
      bottom: { style: "thin", color: { rgb: colors.border } }
    }
  };
  
  // Conditional formatting styles based on cell values
  const conditionalStyles: Record<string, { fill: { fgColor: { rgb: string } }; font: { color: { rgb: string }; bold?: boolean } }> = {
    // Status values
    'Paused': { fill: { fgColor: { rgb: 'FEE2E2' } }, font: { color: { rgb: 'DC2626' } } },
    'Removed': { fill: { fgColor: { rgb: 'FEE2E2' } }, font: { color: { rgb: '991B1B' }, bold: true } },
    'Enabled': { fill: { fgColor: { rgb: 'DCFCE7' } }, font: { color: { rgb: '16A34A' } } },
    // Match types
    'Exact': { fill: { fgColor: { rgb: 'DBEAFE' } }, font: { color: { rgb: '2563EB' } } },
    'Phrase': { fill: { fgColor: { rgb: 'E0E7FF' } }, font: { color: { rgb: '4F46E5' } } },
    'Broad': { fill: { fgColor: { rgb: 'FEF3C7' } }, font: { color: { rgb: 'D97706' } } },
    // Bidding strategies
    'Maximize conversions': { fill: { fgColor: { rgb: 'D1FAE5' } }, font: { color: { rgb: '059669' } } },
    'Maximize clicks': { fill: { fgColor: { rgb: 'CFFAFE' } }, font: { color: { rgb: '0891B2' } } },
    'Target CPA': { fill: { fgColor: { rgb: 'FCE7F3' } }, font: { color: { rgb: 'DB2777' } } },
    'Target ROAS': { fill: { fgColor: { rgb: 'FDF4FF' } }, font: { color: { rgb: 'A855F7' } } },
    'Manual CPC': { fill: { fgColor: { rgb: 'F3F4F6' } }, font: { color: { rgb: '6B7280' } } },
    // Campaign types
    'Search': { fill: { fgColor: { rgb: 'DBEAFE' } }, font: { color: { rgb: '2563EB' } } },
    'Display': { fill: { fgColor: { rgb: 'FEF3C7' } }, font: { color: { rgb: 'D97706' } } },
    'Shopping': { fill: { fgColor: { rgb: 'D1FAE5' } }, font: { color: { rgb: '059669' } } },
    'Video': { fill: { fgColor: { rgb: 'FEE2E2' } }, font: { color: { rgb: 'DC2626' } } },
    'Performance Max': { fill: { fgColor: { rgb: 'E0E7FF' } }, font: { color: { rgb: '4F46E5' } } },
    // Ad types
    'Responsive search ad': { fill: { fgColor: { rgb: 'DBEAFE' } }, font: { color: { rgb: '2563EB' } } },
    'Expanded text ad': { fill: { fgColor: { rgb: 'F3F4F6' } }, font: { color: { rgb: '6B7280' } } }
  };
  
  // Columns that should have conditional formatting applied
  const conditionalColumns = [
    'Campaign Status', 'Ad Group Status', 'Status', 
    'Match Type', 'Bidding Strategy', 'Campaign Type', 'Ad Type'
  ];
  
  // Helper to add CSV data as sheet with styling and validation
  const addSheet = (csvContent: string, sheetName: string, accentColor: string) => {
    const data = parseCSVToArray(csvContent);
    const worksheet = XLSX.utils.aoa_to_sheet(data);
    
    // Get range of cells
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    const headers = data[0] || [];
    
    // Find column indices that need conditional formatting
    const conditionalColumnIndices = headers.reduce((acc, header, index) => {
      if (conditionalColumns.includes(header)) {
        acc[index] = header;
      }
      return acc;
    }, {} as Record<number, string>);
    
    // Apply header styling to first row
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: col });
      if (worksheet[cellRef]) {
        worksheet[cellRef].s = {
          ...headerStyle,
          fill: { fgColor: { rgb: accentColor } }
        };
      }
    }
    
    // Apply alternating row styles and conditional formatting
    for (let row = 1; row <= range.e.r; row++) {
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
        if (worksheet[cellRef]) {
          const cellValue = worksheet[cellRef].v?.toString() || '';
          
          // Check if this column should have conditional formatting
          if (conditionalColumnIndices[col] && conditionalStyles[cellValue]) {
            worksheet[cellRef].s = {
              ...conditionalStyles[cellValue],
              alignment: { horizontal: "center" },
              border: {
                bottom: { style: "thin", color: { rgb: colors.border } }
              }
            };
          } else if (row % 2 === 0) {
            worksheet[cellRef].s = evenRowStyle;
          }
        }
      }
    }
    
    // Add data validation for specific columns
    const validationConfig = sheetValidationConfig[sheetName];
    if (validationConfig && range.e.r > 0) {
      const dataValidations: Array<{
        sqref: string;
        type: string;
        operator: string;
        formula1: string;
        showDropDown: boolean;
        showErrorMessage: boolean;
        errorTitle: string;
        error: string;
      }> = [];
      
      headers.forEach((header, colIndex) => {
        const options = validationConfig[header];
        if (options) {
          const colLetter = XLSX.utils.encode_col(colIndex);
          // Apply to all data rows (skip header)
          const sqref = `${colLetter}2:${colLetter}${range.e.r + 1}`;
          
          dataValidations.push({
            sqref,
            type: 'list',
            operator: 'equal',
            formula1: `"${options.join(',')}"`,
            showDropDown: true,
            showErrorMessage: true,
            errorTitle: 'Ongeldige waarde',
            error: `Kies een waarde uit de lijst: ${options.join(', ')}`
          });
        }
      });
      
      if (dataValidations.length > 0) {
        worksheet['!dataValidation'] = dataValidations;
      }
    }
    
    // Set column widths based on content
    const colWidths = data[0]?.map((_, colIndex) => {
      const maxWidth = Math.max(
        ...data.slice(0, 50).map(row => (row[colIndex] || '').length)
      );
      return { wch: Math.min(Math.max(maxWidth, 12), 50) };
    }) || [];
    worksheet['!cols'] = colWidths;
    
    // Freeze first row
    worksheet['!freeze'] = { xSplit: 0, ySplit: 1 };
    
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  };
  
  // Sheet generators mapping
  const sheetGenerators: Record<ExcelSheetKey, { generator: () => string; color: string }> = {
    campaigns: { generator: generateCampaignStructureCSV, color: colors.campaigns },
    ads: { generator: generateResponsiveAdsCSV, color: colors.ads },
    keywords: { generator: generateKeywordsCSV, color: colors.keywords },
    sitelinks: { generator: generateSitelinksCSV, color: colors.sitelinks },
    images: { generator: generateImageAssetsCSV, color: colors.images }
  };

  // Add only selected sheets
  sheets.forEach(sheetKey => {
    const config = sheetGenerators[sheetKey];
    if (config) {
      const sheetName = sheetKey.charAt(0).toUpperCase() + sheetKey.slice(1);
      addSheet(config.generator(), sheetName, config.color);
    }
  });
  
  // Generate Excel file
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const filename = `getpawsy_google_ads_${timestamp}.xlsx`;
  
  // Check if Web Share API is available (iOS Safari)
  if (navigator.share && navigator.canShare) {
    const file = new File([blob], filename, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const shareData = { files: [file] };
    
    if (navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          return;
        }
      }
    }
  }
  
  // Fallback: regular download
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Get campaign statistics
export function getCampaignStats() {
  const campaigns = [...new Set(campaignData.map(ad => ad.campaign))];
  const totalAdGroups = campaignData.length;
  const totalKeywords = campaignData.reduce((sum, ad) => sum + ad.keywords.length * 2, 0); // x2 for phrase + exact
  const totalHeadlines = campaignData.reduce((sum, ad) => sum + ad.headlines.length, 0);
  
  return {
    campaigns: campaigns.length,
    adGroups: totalAdGroups,
    keywords: totalKeywords,
    headlines: totalHeadlines,
    campaignNames: campaigns
  };
}
