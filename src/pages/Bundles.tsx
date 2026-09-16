import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { BundleCard } from "@/components/bundles/BundleCard";
import { supabase } from "@/integrations/supabase/client";
import { BUNDLE_DEFINITIONS, evaluateBundle, type BundleCatalogProduct } from "@/lib/bundles";

const COMPONENT_SLUGS = Array.from(new Set(BUNDLE_DEFINITIONS.flatMap((b) => b.componentSlugs)));

/**
 * Sets page. A set is shown only when every component passes the live gates
 * (active, merchandised, US warehouse, in stock, one supplier) — otherwise it
 * simply is not rendered, rather than being shown as unavailable.
 */
const Bundles = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["bundle-components", COMPONENT_SLUGS.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products_shop")
        .select(
          "id, slug, name, price, image_url, category, is_active, merch_hidden, supplier_name, supplier_warehouse, stock, variants",
        )
        .in("slug", COMPONENT_SLUGS);
      if (error) throw error;
      return (data ?? []) as unknown as BundleCatalogProduct[];
    },
    staleTime: 2 * 60 * 1000,
  });

  const catalog = new Map((data ?? []).map((p) => [p.slug, p]));
  const active = BUNDLE_DEFINITIONS.map((definition) => ({
    definition,
    status: evaluateBundle(definition, catalog),
  })).filter((b) => b.status.active);

  return (
    <Layout>
      <Helmet>
        <title>Cat Starter Sets & Bundles | GetPawsy</title>
        <meta
          name="description"
          content="Curated sets of indoor cat essentials that ship together from our US warehouse. Choose every option yourself — nothing is substituted."
        />
        <link rel="canonical" href="https://getpawsy.pet/bundles" />
      </Helmet>

      <div className="container mx-auto px-4 py-10 md:py-14">
        <header className="max-w-2xl space-y-3 mb-10">
          <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground">Sets that ship together</h1>
          <p className="text-muted-foreground">
            Each set is a small group of products that come from the same US warehouse, so they arrive together
            instead of in separate parcels. You pick every colour and size yourself — we never choose an option
            for you.
          </p>
        </header>

        {isLoading ? (
          <p className="text-muted-foreground">Loading sets…</p>
        ) : active.length === 0 ? (
          <div className="rounded-2xl border border-border p-8 text-muted-foreground">
            <p>
              No set is available right now, because at least one item in each set is out of stock.{" "}
              <Link to="/products" className="text-primary underline">
                Browse the full range
              </Link>
              .
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {active.map(({ definition, status }) => (
              <BundleCard
                key={definition.slug}
                definition={definition}
                components={status.active ? status.components : []}
              />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Bundles;
