import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import { Pin } from "lucide-react";

type Props = { slug: string };

/** Admin-only floating chip on PDPs that jumps to Pinterest Ad Studio with the slug preloaded. */
export default function CreatePinterestAdButton({ slug }: Props) {
  const { isAdmin } = useAuth();
  if (!isAdmin || !slug) return null;
  return (
    <Link
      to={`/admin/pinterest-ad-studio?slug=${encodeURIComponent(slug)}`}
      className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold shadow-lg hover:bg-primary/90 transition-colors no-print"
      aria-label="Create Pinterest Ad for this product"
    >
      <Pin className="w-4 h-4" />
      📌 Create Pinterest Ad
    </Link>
  );
}
