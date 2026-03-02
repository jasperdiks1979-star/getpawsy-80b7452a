/**
 * NumberedStepsList — Ordered step list optimized for "how to" featured snippets.
 * Uses semantic <ol> with HowTo schema-ready structure.
 */

interface Step {
  title: string;
  description?: string;
}

interface Props {
  heading: string;
  steps: Step[];
  className?: string;
}

export function NumberedStepsList({ heading, steps, className = '' }: Props) {
  return (
    <div className={`mb-8 ${className}`}>
      <h3 className="text-lg font-semibold mb-4">{heading}</h3>
      <ol className="space-y-3 list-none pl-0">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-3 items-start">
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
              {i + 1}
            </span>
            <div>
              <p className="font-medium">{step.title}</p>
              {step.description && (
                <p className="text-sm text-muted-foreground mt-0.5">{step.description}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
