import { AUTHOR } from '@/lib/author-entity';
import { CheckCircle } from 'lucide-react';

export function ClusterAuthorBox() {
  return (
    <div className="bg-card border rounded-2xl p-6 flex flex-col sm:flex-row gap-4 items-start">
      <div className="flex-shrink-0 w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xl">
        {AUTHOR.name.split(' ').map(n => n[0]).join('')}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-semibold text-sm">{AUTHOR.name}</h3>
          <span className="inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary font-medium px-2 py-0.5 rounded-full">
            <CheckCircle className="w-3 h-3" /> Verified Expert
          </span>
        </div>
        <p className="text-xs text-muted-foreground mb-2">{AUTHOR.jobTitle}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{AUTHOR.shortBio}</p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {AUTHOR.expertise.map(e => (
            <span key={e} className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{e}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
