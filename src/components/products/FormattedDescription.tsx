import React, { useState, useEffect } from 'react';
import { sanitizeHtml } from '@/lib/sanitize';
import { CheckCircle2, Sparkles, Zap, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface FormattedDescriptionProps {
  description: string;
  productName?: string;
  productId?: string;
  className?: string;
}

interface AISummary {
  summary: string;
  highlights: string[];
}

/**
 * Intelligently formats product descriptions for better readability.
 * - AI-generated summary with 3 key highlights
 * - Splits long text into paragraphs
 * - Detects and renders feature lists as bullet points
 * - Highlights key product information
 * - Applies proper typography and spacing
 */
const FormattedDescription: React.FC<FormattedDescriptionProps> = ({ 
  description, 
  productName = 'Product',
  productId,
  className = '' 
}) => {
  const [aiSummary, setAiSummary] = useState<AISummary | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState(false);

  // Fetch AI summary on mount
  useEffect(() => {
    const fetchAISummary = async () => {
      // Only fetch if description is long enough
      if (!description || description.length < 100) return;
      
      // Check if we have a cached summary in localStorage
      const cacheKey = `product-summary-${productId || description.substring(0, 50)}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          setAiSummary(JSON.parse(cached));
          return;
        } catch {
          localStorage.removeItem(cacheKey);
        }
      }

      setIsLoadingSummary(true);
      setSummaryError(false);

      try {
        const { data, error } = await supabase.functions.invoke('generate-product-summary', {
          body: { 
            description: description.substring(0, 2000), // Limit input size
            productName 
          }
        });

        if (error) throw error;
        
        if (data?.summary && data?.highlights?.length > 0) {
          setAiSummary(data);
          // Cache the result
          localStorage.setItem(cacheKey, JSON.stringify(data));
        }
      } catch (err) {
        console.error('Failed to fetch AI summary:', err);
        setSummaryError(true);
      } finally {
        setIsLoadingSummary(false);
      }
    };

    fetchAISummary();
  }, [description, productName, productId]);

  // Check if description contains HTML
  const hasHtml = /<[^>]+>/.test(description);
  
  // AI Summary component
  const AISummarySection = () => {
    if (isLoadingSummary) {
      return (
        <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent rounded-2xl p-5 mb-6 border border-primary/20">
          <div className="flex items-center gap-2 text-primary">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm font-medium">Generating summary...</span>
          </div>
        </div>
      );
    }

    if (!aiSummary || summaryError) return null;

    return (
      <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent rounded-2xl p-5 mb-6 border border-primary/20 animate-in fade-in slide-in-from-top-2 duration-500">
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
            <Zap className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="text-xs font-semibold text-primary uppercase tracking-wider">Quick Summary</span>
        </div>
        
        {/* Summary text */}
        <p className="text-foreground font-medium leading-relaxed mb-4">
          {aiSummary.summary}
        </p>
        
        {/* Key highlights */}
        <div className="flex flex-wrap gap-2">
          {aiSummary.highlights.map((highlight, idx) => (
            <span 
              key={idx}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-background/80 rounded-full text-sm border border-border/50"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
              <span className="text-muted-foreground">{highlight}</span>
            </span>
          ))}
        </div>
      </div>
    );
  };
  
  if (hasHtml) {
    // For HTML content, use existing sanitization with enhanced styling
    return (
      <div className={className}>
        <AISummarySection />
        <div 
          className={`prose prose-sm max-w-none text-muted-foreground 
            [&_h2]:text-xl [&_h2]:font-display [&_h2]:font-bold [&_h2]:text-foreground [&_h2]:mt-8 [&_h2]:mb-4
            [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-foreground [&_h3]:mt-6 [&_h3]:mb-3
            [&_p]:leading-relaxed [&_p]:mb-4 [&_p]:text-[15px]
            [&_ul]:list-none [&_ul]:pl-0 [&_ul]:my-4 [&_ul]:space-y-2
            [&_li]:flex [&_li]:items-start [&_li]:gap-2 [&_li]:my-0
            [&_li:before]:content-['✓'] [&_li:before]:text-primary [&_li:before]:font-bold
            [&_img]:rounded-xl [&_img]:my-6
            [&_strong]:text-foreground [&_strong]:font-semibold
            [&_b]:text-foreground [&_b]:font-semibold`}
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(description) }}
        />
      </div>
    );
  }
  
  // Parse plain text into structured sections
  const sections = parseDescription(description);
  
  return (
    <div className={`space-y-6 ${className}`}>
      <AISummarySection />
      
      {sections.map((section, index) => (
        <React.Fragment key={index}>
          {section.type === 'intro' && (
            <p className="text-[15px] leading-relaxed text-foreground/80 first-letter:text-2xl first-letter:font-display first-letter:font-bold first-letter:text-primary first-letter:mr-1 first-letter:float-left">
              {section.content}
            </p>
          )}
          
          {section.type === 'paragraph' && (
            <p className="text-[15px] leading-relaxed text-muted-foreground">
              {formatTextWithHighlights(section.content)}
            </p>
          )}
          
          {section.type === 'features' && (
            <div className="bg-primary/5 rounded-xl p-5 border border-primary/10">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-5 h-5 text-primary" />
                <h4 className="font-semibold text-foreground">Features</h4>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2">
                {section.items.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-muted-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {section.type === 'specifications' && (
            <div className="bg-muted/50 rounded-xl p-5">
              <h4 className="font-semibold text-foreground mb-4">Specifications</h4>
              <dl className="grid gap-2 text-sm">
                {section.items.map((item, idx) => {
                  const [label, value] = item.includes(':') 
                    ? item.split(':').map(s => s.trim()) 
                    : [item, ''];
                  return (
                    <div key={idx} className="flex flex-wrap gap-2 py-1.5 border-b border-border/50 last:border-0">
                      <dt className="text-muted-foreground min-w-[120px]">{label}</dt>
                      <dd className="font-medium text-foreground">{value}</dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          )}
          
          {section.type === 'highlight' && (
            <div className="border-l-4 border-primary bg-primary/5 rounded-r-xl p-4">
              <p className="text-[15px] text-foreground/90 italic">
                {section.content}
              </p>
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

interface Section {
  type: 'intro' | 'paragraph' | 'features' | 'specifications' | 'highlight';
  content: string;
  items: string[];
}

/**
 * Parse a plain text description into structured sections
 */
function parseDescription(text: string): Section[] {
  const sections: Section[] = [];
  
  // Clean up text
  let cleanText = text
    .replace(/\*\*/g, '') // Remove markdown bold
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
  
  // Detect feature lists (common patterns: "- feature", "• feature", "Features: -")
  const featurePatterns = [
    /Features?:?\s*[-–•]/i,
    /(?:^|\n)\s*[-–•]\s+/,
    /\.\s+[-–•]\s+/
  ];
  
  const specPatterns = [
    /Specifications?:?\s*/i,
    /Dimensions?:?\s*/i,
    /Package Includes:?\s*/i
  ];
  
  let hasFeatures = featurePatterns.some(p => p.test(cleanText));
  let hasSpecs = specPatterns.some(p => p.test(cleanText));
  
  // Split by common delimiters
  if (hasFeatures || hasSpecs) {
    // Find where features/specs start
    let featureMatch = cleanText.match(/Features?:?\s*[-–•]/i);
    let specMatch = cleanText.match(/Specifications?:?\s*/i);
    let packageMatch = cleanText.match(/Package Includes:?\s*/i);
    
    let introPart = cleanText;
    let featuresPart = '';
    let specsPart = '';
    
    if (featureMatch) {
      const idx = featureMatch.index || 0;
      introPart = cleanText.substring(0, idx).trim();
      const remaining = cleanText.substring(idx);
      
      // Check if specs come after features
      specMatch = remaining.match(/Specifications?:?\s*/i);
      packageMatch = remaining.match(/Package Includes:?\s*/i);
      
      if (specMatch && specMatch.index) {
        featuresPart = remaining.substring(0, specMatch.index).trim();
        specsPart = remaining.substring(specMatch.index).trim();
      } else if (packageMatch && packageMatch.index) {
        featuresPart = remaining.substring(0, packageMatch.index).trim();
        specsPart = remaining.substring(packageMatch.index).trim();
      } else {
        featuresPart = remaining.trim();
      }
    } else if (specMatch) {
      const idx = specMatch.index || 0;
      introPart = cleanText.substring(0, idx).trim();
      specsPart = cleanText.substring(idx).trim();
    }
    
    // Parse intro paragraphs
    if (introPart) {
      const sentences = introPart.split(/(?<=[.!?])\s+/);
      const introSentences = sentences.slice(0, 2).join(' ');
      const restSentences = sentences.slice(2).join(' ');
      
      if (introSentences) {
        sections.push({
          type: 'intro',
          content: introSentences,
          items: []
        });
      }
      
      if (restSentences) {
        sections.push({
          type: 'paragraph',
          content: restSentences,
          items: []
        });
      }
    }
    
    // Parse features
    if (featuresPart) {
      const items = extractListItems(featuresPart);
      if (items.length > 0) {
        sections.push({
          type: 'features',
          content: '',
          items
        });
      }
    }
    
    // Parse specifications
    if (specsPart) {
      const items = extractListItems(specsPart);
      if (items.length > 0) {
        sections.push({
          type: 'specifications',
          content: '',
          items
        });
      }
    }
  } else {
    // No features/specs detected, split into natural paragraphs
    const sentences = cleanText.split(/(?<=[.!?])\s+/);
    
    // Create paragraphs of 2-3 sentences each
    const paragraphs: string[] = [];
    let currentParagraph: string[] = [];
    
    sentences.forEach((sentence, idx) => {
      currentParagraph.push(sentence);
      
      // Create new paragraph every 2-3 sentences, or at natural breaks
      const isBreakPoint = sentence.includes('!') || 
                          sentence.toLowerCase().includes('perfect for') ||
                          sentence.toLowerCase().includes('featuring') ||
                          sentence.toLowerCase().includes('this') ||
                          sentence.toLowerCase().includes('with');
      
      if (currentParagraph.length >= 3 || (currentParagraph.length >= 2 && isBreakPoint)) {
        paragraphs.push(currentParagraph.join(' '));
        currentParagraph = [];
      }
    });
    
    // Add remaining sentences
    if (currentParagraph.length > 0) {
      paragraphs.push(currentParagraph.join(' '));
    }
    
    // Convert to sections
    paragraphs.forEach((para, idx) => {
      sections.push({
        type: idx === 0 ? 'intro' : 'paragraph',
        content: para,
        items: []
      });
    });
  }
  
  return sections;
}

/**
 * Extract list items from text containing bullet points or dashes
 */
function extractListItems(text: string): string[] {
  // Remove header like "Features:" or "Specifications:"
  text = text.replace(/^(Features?|Specifications?|Dimensions?|Package Includes):?\s*/i, '');
  
  // Split by common list delimiters
  const items = text
    .split(/\s*[-–•]\s+/)
    .map(item => item.trim())
    .filter(item => item.length > 0 && item.length < 200); // Filter out headers and very long items
  
  return items;
}

/**
 * Format text with highlighted keywords (bold markers)
 */
function formatTextWithHighlights(text: string): React.ReactNode {
  // Safety check: ensure text is a string
  if (typeof text !== 'string') {
    console.warn('formatTextWithHighlights received non-string:', typeof text);
    return String(text || '');
  }
  
  // Find quoted text or important phrases to highlight
  const parts = text.split(/(".*?"|\d+(?:\.\d+)?(?:\s*(?:inch|inches|cm|lbs?|kg|mm|"|'))?)/g);
  
  return parts.map((part, idx) => {
    // Safety: ensure part is a string before processing
    if (typeof part !== 'string') return String(part || '');
    
    // Highlight quoted text
    if (part.startsWith('"') && part.endsWith('"')) {
      return <strong key={idx} className="text-foreground font-medium">{part}</strong>;
    }
    // Highlight measurements
    if (/^\d+(?:\.\d+)?(?:\s*(?:inch|inches|cm|lbs?|kg|mm|"|'))?$/i.test(part)) {
      return <strong key={idx} className="text-foreground font-medium">{part}</strong>;
    }
    return part;
  });
}

export default FormattedDescription;
