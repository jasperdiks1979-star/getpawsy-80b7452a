/**
 * GuaranteeBlock — Large centered trust section for homepage conversion.
 * Zero JS, pure static rendering.
 */

export function GuaranteeBlock() {
  return (
    <section className="py-14 md:py-16">
      <div className="container px-4 md:px-6">
        <div className="max-w-2xl mx-auto text-center bg-secondary/30 border border-secondary/50 rounded-3xl p-10 md:p-14">
          <span className="text-4xl mb-4 block">🛡️</span>
          <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground mb-4">
            30-Day Return Policy
          </h2>
          <p className="text-base text-muted-foreground leading-relaxed max-w-lg mx-auto">
            Not the right fit? Return eligible items within 30 days. 
            Every order is backed by our return policy and dedicated customer support.
          </p>
        </div>
      </div>
    </section>
  );
}

export default GuaranteeBlock;
