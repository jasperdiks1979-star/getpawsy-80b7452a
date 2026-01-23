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
// Includes up to 15 headlines and 4 descriptions per ad
export function generateResponsiveAdsCSV(): string {
  const headers = [
    "Campaign",
    "Ad Group", 
    "Headline 1",
    "Headline 2",
    "Headline 3",
    "Headline 4",
    "Headline 5",
    "Headline 6",
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
    ad.headlines[3] || "",
    ad.headlines[4] || "",
    ad.headlines[5] || "",
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
    "15.00", // Adjusted budget for new account
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

// Generate Sitelinks CSV
export function generateSitelinksCSV(): string {
  const headers = [
    "Campaign",
    "Sitelink Text",
    "Final URL",
    "Description Line 1",
    "Description Line 2"
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
        sitelink.url,
        sitelink.desc1,
        sitelink.desc2
      ]);
    });
  });
  
  const csvContent = [
    headers.join(","),
    ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(","))
  ].join("\n");
  
  return csvContent;
}

// Generate Image Assets CSV for Google Ads
export function generateImageAssetsCSV(): string {
  const headers = [
    "Campaign",
    "Image URL",
    "Image Type",
    "Asset Name"
  ];
  
  const campaigns = [...new Set(campaignData.map(ad => ad.campaign))];
  
  // Image assets hosted on getpawsy.pet
  const imageAssets = [
    {
      url: "https://getpawsy.pet/ads/google-ads-square.jpg",
      type: "Square (1:1)",
      name: "GetPawsy Square Logo"
    },
    {
      url: "https://getpawsy.pet/ads/google-ads-landscape.jpg",
      type: "Landscape (1.91:1)",
      name: "GetPawsy Landscape Banner"
    },
    {
      url: "https://getpawsy.pet/ads/google-ads-logo.png",
      type: "Logo Square (1:1)",
      name: "GetPawsy Logo Square"
    },
    {
      url: "https://getpawsy.pet/ads/google-ads-logo-landscape.png",
      type: "Logo Landscape (4:1)",
      name: "GetPawsy Logo Landscape"
    }
  ];
  
  const rows: string[][] = [];
  
  campaigns.forEach(campaign => {
    imageAssets.forEach(asset => {
      rows.push([
        campaign,
        asset.url,
        asset.type,
        asset.name
      ]);
    });
  });
  
  const csvContent = [
    headers.join(","),
    ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(","))
  ].join("\n");
  
  return csvContent;
}

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
  
  // Download all CSVs with timestamps
  downloadCSV(generateCampaignStructureCSV(), `getpawsy_campaigns_${timestamp}.csv`);
  
  setTimeout(() => {
    downloadCSV(generateResponsiveAdsCSV(), `getpawsy_ads_${timestamp}.csv`);
  }, 500);
  
  setTimeout(() => {
    downloadCSV(generateKeywordsCSV(), `getpawsy_keywords_${timestamp}.csv`);
  }, 1000);
  
  setTimeout(() => {
    downloadCSV(generateSitelinksCSV(), `getpawsy_sitelinks_${timestamp}.csv`);
  }, 1500);
  
  setTimeout(() => {
    downloadCSV(generateImageAssetsCSV(), `getpawsy_images_${timestamp}.csv`);
  }, 2000);
}

// Export all files as a single ZIP file
export async function exportAllAsZip(): Promise<void> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const timestamp = new Date().toISOString().split('T')[0];
  
  // Add all CSV files to the ZIP
  zip.file(`getpawsy_campaigns_${timestamp}.csv`, generateCampaignStructureCSV());
  zip.file(`getpawsy_ads_${timestamp}.csv`, generateResponsiveAdsCSV());
  zip.file(`getpawsy_keywords_${timestamp}.csv`, generateKeywordsCSV());
  zip.file(`getpawsy_sitelinks_${timestamp}.csv`, generateSitelinksCSV());
  zip.file(`getpawsy_images_${timestamp}.csv`, generateImageAssetsCSV());
  
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

// Export all files as Excel (.xlsx) with multiple sheets
export async function exportAllAsExcel(): Promise<void> {
  const XLSX = await import('xlsx');
  const timestamp = new Date().toISOString().split('T')[0];
  
  // Create workbook
  const workbook = XLSX.utils.book_new();
  
  // Helper to add CSV data as sheet
  const addSheet = (csvContent: string, sheetName: string) => {
    const data = parseCSVToArray(csvContent);
    const worksheet = XLSX.utils.aoa_to_sheet(data);
    
    // Set column widths based on content
    const colWidths = data[0]?.map((_, colIndex) => {
      const maxWidth = Math.max(
        ...data.slice(0, 50).map(row => (row[colIndex] || '').length)
      );
      return { wch: Math.min(Math.max(maxWidth, 10), 50) };
    }) || [];
    worksheet['!cols'] = colWidths;
    
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  };
  
  // Add all sheets
  addSheet(generateCampaignStructureCSV(), 'Campaigns');
  addSheet(generateResponsiveAdsCSV(), 'Ads');
  addSheet(generateKeywordsCSV(), 'Keywords');
  addSheet(generateSitelinksCSV(), 'Sitelinks');
  addSheet(generateImageAssetsCSV(), 'Images');
  
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
