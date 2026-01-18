import React from 'react';
import { sanitizeHtml } from '@/lib/sanitize';
import { CheckCircle2, Sparkles } from 'lucide-react';

interface FormattedDescriptionProps {
  description: string;
  className?: string;
}

/**
 * Intelligently formats product descriptions for better readability.
 * - Splits long text into paragraphs
 * - Detects and renders feature lists as bullet points
 * - Highlights key product information
 * - Applies proper typography and spacing
 */
const FormattedDescription: React.FC<FormattedDescriptionProps> = ({ 
  description, 
  className = '' 
}) => {
  // Check if description contains HTML
  const hasHtml = /<[^>]+>/.test(description);
  
  if (hasHtml) {
    // For HTML content, use existing sanitization with enhanced styling
    return (
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
          [&_b]:text-foreground [&_b]:font-semibold
          ${className}`}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(description) }}
      />
    );
  }
  
  // Parse plain text into structured sections
  const sections = parseDescription(description);
  
  return (
    <div className={`space-y-6 ${className}`}>
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
  // Find quoted text or important phrases to highlight
  const parts = text.split(/(".*?"|\d+(?:\.\d+)?(?:\s*(?:inch|inches|cm|lbs?|kg|mm|"|'))?)/g);
  
  return parts.map((part, idx) => {
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
