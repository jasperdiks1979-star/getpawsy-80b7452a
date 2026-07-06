import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Info } from "lucide-react";

/** Renders an inline info icon that reveals a plain-English explanation. */
export function ExplainPopover({
  title,
  explanation,
  bullets,
}: {
  title: string;
  explanation: string;
  bullets?: string[];
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Explain ${title}`}
          className="inline-flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:text-foreground"
        >
          <Info className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 text-xs space-y-2">
        <div className="font-medium text-sm">{title}</div>
        <p className="text-muted-foreground">{explanation}</p>
        {bullets && bullets.length > 0 && (
          <ul className="space-y-0.5">
            {bullets.map((b, i) => (
              <li key={i}>• {b}</li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
