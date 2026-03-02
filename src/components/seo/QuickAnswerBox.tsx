/**
 * QuickAnswerBox — 40-60 word direct answer block for featured snippet capture.
 * Placed immediately after H1 for maximum snippet eligibility.
 */

interface Props {
  answer: string;
  keyword?: string;
  className?: string;
}

export function QuickAnswerBox({ answer, keyword, className = '' }: Props) {
  return (
    <div
      className={`bg-primary/5 border-l-4 border-primary rounded-r-xl p-4 md:p-5 mb-6 ${className}`}
      role="region"
      aria-label="Quick answer"
    >
      <p className="text-sm font-semibold text-primary mb-1 uppercase tracking-wide">
        Quick Answer
      </p>
      <p className="text-base md:text-lg leading-relaxed font-medium">
        {answer}
      </p>
      {keyword && (
        <p className="text-xs text-muted-foreground mt-2">
          Related: <em>{keyword}</em>
        </p>
      )}
    </div>
  );
}
