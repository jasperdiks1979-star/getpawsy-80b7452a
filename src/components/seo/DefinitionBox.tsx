/**
 * DefinitionBox — Structured definition block for "what is" queries.
 * Optimized for Google's definition snippet format.
 */

interface Props {
  term: string;
  definition: string;
  className?: string;
}

export function DefinitionBox({ term, definition, className = '' }: Props) {
  return (
    <div
      className={`border rounded-xl p-4 md:p-5 mb-6 bg-card ${className}`}
      role="definition"
    >
      <dl>
        <dt className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-1">
          Definition
        </dt>
        <dd>
          <p className="text-base md:text-lg leading-relaxed">
            <strong>{term}</strong> — {definition}
          </p>
        </dd>
      </dl>
    </div>
  );
}
