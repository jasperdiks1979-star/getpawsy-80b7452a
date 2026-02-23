import { Info } from 'lucide-react';

/** Medical/editorial disclaimer for authority content pages */
export function MedicalDisclaimer() {
  return (
    <aside className="my-8 border border-muted rounded-xl p-4 text-xs text-muted-foreground flex items-start gap-3">
      <Info className="w-4 h-4 shrink-0 mt-0.5" />
      <p>
        <strong>Disclaimer:</strong> The information provided on this page is for educational purposes only and is not intended as veterinary medical advice. Always consult a licensed veterinarian for your dog's specific health needs. Product recommendations are based on publicly available specifications, customer reviews, and our editorial research team's evaluation — not clinical trials.
      </p>
    </aside>
  );
}
