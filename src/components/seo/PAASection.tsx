/**
 * PAASection — People Also Ask expansion with targeted subheadings.
 * Each question is an H2/H3 with 2-3 paragraph answer + internal link.
 * Increases dwell time, targets PAA inclusions.
 */

import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { PAAQuestion } from '@/data/domination-config';

interface Props {
  questions: PAAQuestion[];
  title?: string;
}

export function PAASection({ questions, title = 'People Also Ask' }: Props) {
  if (!questions.length) return null;

  return (
    <section id="paa" className="mb-16">
      <h2 className="text-2xl md:text-3xl font-display font-bold mb-8">{title}</h2>
      <div className="space-y-10">
        {questions.map((q, i) => (
          <div key={i} className="max-w-4xl">
            <h3 className="text-lg md:text-xl font-semibold text-foreground mb-3">
              {q.question}
            </h3>
            <div className="space-y-3 text-sm md:text-base text-muted-foreground leading-relaxed">
              {q.answer.split('\n\n').map((paragraph, j) => (
                <p key={j} dangerouslySetInnerHTML={{ __html: paragraph.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }} />
              ))}
            </div>
            {q.internalLink && (
              <Link
                to={q.internalLink.href}
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline font-medium mt-3"
              >
                {q.internalLink.label} <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
