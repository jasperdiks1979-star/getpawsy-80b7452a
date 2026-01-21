// Google Ads Campaign Export Utility
// Formats ad data for bulk upload to Google Ads Editor

export interface AdVariant {
  campaign: string;
  adGroup: string;
  headlines: string[];
  descriptions: string[];
  displayPaths: string[];
  keywords: string[];
  finalUrl: string;
}

export const campaignData: AdVariant[] = [
  // GPS Dog Fence Tracker - 5 variants
  {
    campaign: "GPS Dog Fence - Search",
    adGroup: "Core Benefits",
    headlines: ["Advanced GPS Dog Fence", "Keep Your Dog Safe & Secure", "Wireless Fence - No Wires"],
    descriptions: [
      "Create an invisible boundary for your pet. No buried wires, just easy GPS setup.",
      "Precision satellite technology keeps your dog in the safe zone. Water-resistant & durable."
    ],
    displayPaths: ["Dog-Safety", "Wireless-Fence"],
    keywords: ["GPS dog fence", "wireless pet containment", "portable dog fence", "GPS tracking collar", "electric dog fence"],
    finalUrl: "https://getpawsy.pet/products"
  },
  {
    campaign: "GPS Dog Fence - Search",
    adGroup: "Urgency & Fear",
    headlines: ["Stop Your Dog From Escaping", "Order Now - Limited Stock", "Protect Your Pet Today"],
    descriptions: [
      "Stop escape artists in their tracks. Receive instant alerts if your dog leaves the yard.",
      "Ensure your dog's safety today. Easy setup works for any yard or park. Shop now!"
    ],
    displayPaths: ["Pet-Alerts", "Fast-Shipping"],
    keywords: ["dog escape tracker", "containment system", "anti-lost dog collar", "GPS boundary alert", "smart dog collar"],
    finalUrl: "https://getpawsy.pet/products"
  },
  {
    campaign: "GPS Dog Fence - Search",
    adGroup: "Social Proof",
    headlines: ["Top-Rated GPS Dog Collar", "Join 10,000+ Happy Owners", "Reliable Pet Containment"],
    descriptions: [
      "The trusted choice for American pet owners. Durable IPX6 waterproof construction.",
      "Join thousands of satisfied dog parents. High-accuracy GPS for ultimate peace of mind."
    ],
    displayPaths: ["Safe-Pets", "Trusted-GPS"],
    keywords: ["best dog fence", "top rated GPS collar", "reliable dog tracker", "pet safety device", "dog fence reviews"],
    finalUrl: "https://getpawsy.pet/products"
  },
  {
    campaign: "GPS Dog Fence - Search",
    adGroup: "Travel & Outdoor",
    headlines: ["The Portable Dog Fence", "Take Safety on Every Trip", "Perfect for Parks & Travel"],
    descriptions: [
      "Setting up boundaries at parks or campsites is a breeze. No permanent wires needed.",
      "Wireless GPS protection wherever you go. Ideal for active dogs and traveling owners."
    ],
    displayPaths: ["Travel-Dog", "Portable-Fence"],
    keywords: ["portable pet fence", "camping with dogs", "travel dog tracker", "outdoor dog safety", "mobile dog fence"],
    finalUrl: "https://getpawsy.pet/products"
  },
  {
    campaign: "GPS Dog Fence - Search",
    adGroup: "Tech-Forward",
    headlines: ["Stop Digging & Burying Wires", "Modern GPS Fence Technology", "Save on Complex Installation"],
    descriptions: [
      "Ditch the shovel. Our 2-in-1 GPS collar uses satellites to create safe zones instantly.",
      "Adjustable radius from 32 to 2887 feet. The modern solution for smart pet owners."
    ],
    displayPaths: ["Easy-Setup", "Smart-Collar"],
    keywords: ["wireless dog barrier", "no dig dog fence", "satellite dog fence", "gps containment system", "easy install fence"],
    finalUrl: "https://getpawsy.pet/products"
  },
  
  // Pet Carrier Backpack - 5 variants
  {
    campaign: "Pet Carrier Backpack - Search",
    adGroup: "Comfort & Design",
    headlines: ["Extra-Roomy Pet Backpack", "Expandable Comfort for Pets", "Top-Rated Dog & Cat Carrier"],
    descriptions: [
      "Give your pet 2x more space with our unique back extension. Breathable & ultra-comfy.",
      "Premium mesh panels & padded straps for the ultimate pet travel experience. Shop now!"
    ],
    displayPaths: ["Pet-Travel", "Backpacks"],
    keywords: ["expandable pet carrier", "cat backpack carrier", "small dog backpack", "breathable pet bag", "pet travel gear"],
    finalUrl: "https://getpawsy.pet/products"
  },
  {
    campaign: "Pet Carrier Backpack - Search",
    adGroup: "Outdoor Adventure",
    headlines: ["Take Your Pet Anyplace", "Hiking Gear for Small Dogs", "Adventurous Cat Backpacks"],
    descriptions: [
      "The perfect hiking companion for pets up to 26 lbs. Built for safety & outdoor fun.",
      "Durable, lightweight, and adventure-ready. Folds flat for easy storage between trips."
    ],
    displayPaths: ["Outdoor", "Pet-Adventures"],
    keywords: ["dog hiking backpack", "cat carrier for hiking", "adventure pet gear", "outdoor cat bag", "active pet owner"],
    finalUrl: "https://getpawsy.pet/products"
  },
  {
    campaign: "Pet Carrier Backpack - Search",
    adGroup: "Airline Travel",
    headlines: ["Airline Approved Carrier", "Stress-Free Flying With Pets", "Ultimate Travel Pet Bag"],
    descriptions: [
      "Designed for the jet-setting pet. Comfortable, secure, and airline-compliant design.",
      "Navigate the airport with ease using our padded straps and safety buckle system."
    ],
    displayPaths: ["Flights", "Travel-Safe"],
    keywords: ["airline approved pet carrier", "pet travel backpack", "flying with a cat", "TSA pet carrier", "cat flight bag"],
    finalUrl: "https://getpawsy.pet/products"
  },
  {
    campaign: "Pet Carrier Backpack - Search",
    adGroup: "Social Proof",
    headlines: ["Safe & Secure Pet Travel", "Trusted by 10,000+ Owners", "Premium Quality Pet Carrier"],
    descriptions: [
      "Join 1,000s of happy pet parents. Secure safety buckles and durable mesh windows.",
      "Highly rated for safety and durability. The go-to choice for vet visits and trips."
    ],
    displayPaths: ["Best-Sellers", "Top-Rated"],
    keywords: ["safe cat carrier", "dog carrier for vet", "sturdy pet backpack", "highest rated pet bag", "best dog backpack"],
    finalUrl: "https://getpawsy.pet/products"
  },
  {
    campaign: "Pet Carrier Backpack - Search",
    adGroup: "Urgency & Promo",
    headlines: ["Limited Time Offer: 20% Off", "Upgrade Your Pet's Ride", "Order Today for Free Shipping"],
    descriptions: [
      "Don't let your pet miss out! Get the expandable backpack that's selling out fast.",
      "Final hours to save on the most comfortable pet backpack of 2025. Shop now!"
    ],
    displayPaths: ["Flash-Sale", "Limited-Offer"],
    keywords: ["pet carrier sale", "cheap dog backpack", "best cat carrier 2025", "discount pet gear", "expandable pet bag"],
    finalUrl: "https://getpawsy.pet/products"
  },
  
  // Slow Feeder Bowl - 5 variants
  {
    campaign: "Slow Feeder Bowl - Search",
    adGroup: "Health Benefits",
    headlines: ["Stop Fast Eating Today", "Better Digestion For Dogs", "Prevents Bloat & Choking"],
    descriptions: [
      "Slow down your pet's eating by 10x with our interactive maze bowl. Healthy and fun!",
      "Improve your pet's digestion and prevent bloating. Safe, BPA-free, and easy to clean."
    ],
    displayPaths: ["Dog-Health", "Slow-Feeder"],
    keywords: ["dog slow feeder bowl", "prevent dog bloating", "pet digestive health", "maze dog bowl", "cat slow feeder"],
    finalUrl: "https://getpawsy.pet/products"
  },
  {
    campaign: "Slow Feeder Bowl - Search",
    adGroup: "Budget & Urgency",
    headlines: ["Flash Sale: 50% Off Bowl", "Limited Stock Feeder Toy", "Treat Your Pet Today"],
    descriptions: [
      "Don't let your dog gulp their food. Get the #1 slow feeder bowl while supplies last!",
      "Huge savings on the ultimate pet enrichment toy. Order now before we sell out!"
    ],
    displayPaths: ["Special-Offer", "Sale-Today"],
    keywords: ["affordable dog toys", "dog bowl sale", "cheap pet puzzle", "best budget dog bowl", "pet feeder discount"],
    finalUrl: "https://getpawsy.pet/products"
  },
  {
    campaign: "Slow Feeder Bowl - Search",
    adGroup: "Social Proof",
    headlines: ["Voted Best Pet Puzzle", "Join 50,000+ Happy Pets", "5-Star Rated Dog Feeder"],
    descriptions: [
      "The pet parents' choice for reducing anxiety and improving IQ. Read our 5-star reviews!",
      "Trusted by thousands of US dog owners. Durable, non-slip, and vet-recommended design."
    ],
    displayPaths: ["Top-Rated", "Best-Sellers"],
    keywords: ["best rated dog puzzle", "vetted pet products", "top dog feeder 2025", "expert dog toys", "safe pet bowls"],
    finalUrl: "https://getpawsy.pet/products"
  },
  {
    campaign: "Slow Feeder Bowl - Search",
    adGroup: "Mental Enrichment",
    headlines: ["Boost Your Dog's IQ", "End Dog Boredom Now", "Interactive Mental Fun"],
    descriptions: [
      "Turn mealtime into playtime. Challenge your dog's mind with this fun puzzle feeder!",
      "A mental workout for your pet. Perfect for reducing anxiety and keeping dogs busy."
    ],
    displayPaths: ["Pet-Training", "IQ-Toys"],
    keywords: ["dog puzzle toys", "mental enrichment dog", "interactive dog feeder", "dog anxiety relief", "pet training bowl"],
    finalUrl: "https://getpawsy.pet/products"
  },
  {
    campaign: "Slow Feeder Bowl - Search",
    adGroup: "First-Time Owners",
    headlines: ["Puppy Essentials 101", "New Pet Owner Must-Have", "Easy-to-Clean Dog Bowl"],
    descriptions: [
      "The perfect starter kit addition for new pet parents. Safe, non-slip, and easy to wash.",
      "Ensure your new puppy grows up healthy. Prevent fast eating with this simple tool."
    ],
    displayPaths: ["New-Pet", "Puppy-Care"],
    keywords: ["puppy supplies list", "new dog owner tips", "first time cat owner", "non slip dog bowl", "bpa free pet bowl"],
    finalUrl: "https://getpawsy.pet/products"
  }
];

// Generate Responsive Search Ads CSV (Google Ads Editor format)
export function generateResponsiveAdsCSV(): string {
  const headers = [
    "Campaign",
    "Ad Group", 
    "Headline 1",
    "Headline 2",
    "Headline 3",
    "Description 1",
    "Description 2",
    "Path 1",
    "Path 2",
    "Final URL",
    "Status"
  ];
  
  const rows = campaignData.map(ad => [
    ad.campaign,
    ad.adGroup,
    ad.headlines[0] || "",
    ad.headlines[1] || "",
    ad.headlines[2] || "",
    ad.descriptions[0] || "",
    ad.descriptions[1] || "",
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
export function generateKeywordsCSV(): string {
  const headers = [
    "Campaign",
    "Ad Group",
    "Keyword",
    "Match Type",
    "Status"
  ];
  
  const rows: string[][] = [];
  
  campaignData.forEach(ad => {
    ad.keywords.forEach(keyword => {
      // Add phrase match
      rows.push([ad.campaign, ad.adGroup, `"${keyword}"`, "Phrase", "Enabled"]);
      // Add exact match
      rows.push([ad.campaign, ad.adGroup, `[${keyword}]`, "Exact", "Enabled"]);
    });
  });
  
  const csvContent = [
    headers.join(","),
    ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(","))
  ].join("\n");
  
  return csvContent;
}

// Generate Campaign Structure CSV
export function generateCampaignStructureCSV(): string {
  const headers = [
    "Campaign",
    "Campaign Type",
    "Budget",
    "Bid Strategy",
    "Networks",
    "Location",
    "Language",
    "Status"
  ];
  
  const campaigns = [...new Set(campaignData.map(ad => ad.campaign))];
  
  const rows = campaigns.map(campaign => [
    campaign,
    "Search",
    "20.00",
    "Maximize Conversions",
    "Google Search; Search Partners",
    "United States",
    "English",
    "Enabled"
  ]);
  
  const csvContent = [
    headers.join(","),
    ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(","))
  ].join("\n");
  
  return csvContent;
}

// Download helper
export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Export all files as a zip-like bundle (individual downloads)
export function exportAllGoogleAds(): void {
  // Download all three CSVs
  downloadCSV(generateCampaignStructureCSV(), "getpawsy_campaigns_structure.csv");
  
  setTimeout(() => {
    downloadCSV(generateResponsiveAdsCSV(), "getpawsy_responsive_ads.csv");
  }, 500);
  
  setTimeout(() => {
    downloadCSV(generateKeywordsCSV(), "getpawsy_keywords.csv");
  }, 1000);
}
