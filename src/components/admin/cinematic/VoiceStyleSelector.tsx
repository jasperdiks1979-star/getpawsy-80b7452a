import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const VOICE_STYLE_OPTIONS = [
  { id: "lifestyle_female", label: "Premium Lifestyle (Female)", description: "Polished US female — Pinterest-native, warm + aspirational." },
  { id: "pet_parent",       label: "Friendly Pet Parent",         description: "Genuine, conversational, like a friend." },
  { id: "narrator",         label: "Calm Trustworthy Narrator",   description: "Documentary cadence, premium authority." },
  { id: "social_energetic", label: "Energetic Social Ad",         description: "Punchy, high-energy hook delivery." },
] as const;

export type VoiceStyleId = typeof VOICE_STYLE_OPTIONS[number]["id"];

type Props = {
  value: VoiceStyleId;
  onChange: (v: VoiceStyleId) => void;
};

export default function VoiceStyleSelector({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {VOICE_STYLE_OPTIONS.map((s) => {
        const active = s.id === value;
        return (
          <button key={s.id} type="button" onClick={() => onChange(s.id)} className="text-left">
            <Card className={`p-3 transition ${active ? "border-primary ring-1 ring-primary" : "hover:border-foreground/30"}`}>
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">{s.label}</div>
                {active && <Badge>Selected</Badge>}
              </div>
              <div className="text-xs text-muted-foreground mt-1">{s.description}</div>
            </Card>
          </button>
        );
      })}
    </div>
  );
}
