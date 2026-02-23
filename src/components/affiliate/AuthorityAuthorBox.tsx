import { Shield, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AUTHOR } from '@/lib/author-entity';

/** E-E-A-T author box for authority content hubs */
export function AuthorityAuthorBox() {
  return (
    <aside className="border border-primary/20 bg-primary/5 rounded-2xl p-6 md:p-8">
      <div className="flex items-start gap-4">
        <div className="shrink-0 w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
          <Shield className="w-7 h-7 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-sm mb-0.5">
            Reviewed by the GetPawsy Pet Wellness Research Team
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            Lead researcher: {AUTHOR.name} · {AUTHOR.jobTitle}
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            {AUTHOR.bio}
          </p>
          <div className="flex flex-wrap gap-3 text-xs">
            <Link to="/about-the-author" className="text-primary hover:underline font-medium inline-flex items-center gap-1">
              About the Author <ExternalLink className="w-3 h-3" />
            </Link>
            <Link to="/how-we-test-products" className="text-primary hover:underline font-medium inline-flex items-center gap-1">
              How We Evaluate Products <ExternalLink className="w-3 h-3" />
            </Link>
            <Link to="/editorial-guidelines" className="text-primary hover:underline font-medium inline-flex items-center gap-1">
              Editorial Standards <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>
    </aside>
  );
}
