import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Job = {
  id: string;
  product_slug: string;
  final_mp4_url: string;
  created_at: string;
  status: string;
  duration_seconds: number | null;
};

export default function CinematicV3Library() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [checks, setChecks] = useState<Record<string, "ok" | "bad" | "pending">>({});

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("cinematic_v3_jobs")
        .select("id, product_slug, final_mp4_url, created_at, status, duration_seconds")
        .eq("status", "approved")
        .not("final_mp4_url", "is", null)
        .order("created_at", { ascending: false });
      if (!error && data) {
        setJobs(data as Job[]);
        const initial: Record<string, "ok" | "bad" | "pending"> = {};
        data.forEach((j: any) => (initial[j.id] = "pending"));
        setChecks(initial);
        // Probe each url with HEAD
        (data as Job[]).forEach(async (j) => {
          try {
            const r = await fetch(j.final_mp4_url, { method: "HEAD" });
            setChecks((c) => ({ ...c, [j.id]: r.ok ? "ok" : "bad" }));
          } catch {
            setChecks((c) => ({ ...c, [j.id]: "bad" }));
          }
        });
      }
      setLoading(false);
    })();
  }, []);

  const okCount = Object.values(checks).filter((v) => v === "ok").length;
  const badCount = Object.values(checks).filter((v) => v === "bad").length;
  const missingCount = jobs.filter((j) => !j.final_mp4_url).length;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Cinematic V3 Library</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Read-only view of approved V3 videos with verified signed URLs.
      </p>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <Stat label="Total approved" value={jobs.length} />
        <Stat label="Playable (200)" value={okCount} tone="ok" />
        <Stat label="Broken" value={badCount} tone="bad" />
        <Stat label="Missing URL" value={missingCount} tone="bad" />
      </div>

      {loading ? (
        <div>Loading…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {jobs.map((j) => (
            <div key={j.id} className="border rounded-lg p-4 bg-card">
              <video
                src={j.final_mp4_url}
                controls
                playsInline
                preload="metadata"
                className="w-full aspect-[9/16] bg-black rounded mb-3 object-cover"
              />
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-800">
                  {j.status}
                </span>
                <Badge state={checks[j.id]} />
              </div>
              <div className="font-medium text-sm truncate" title={j.product_slug}>
                {j.product_slug}
              </div>
              <div className="text-xs text-muted-foreground mb-2">
                {new Date(j.created_at).toLocaleString()}{" "}
                {j.duration_seconds ? `· ${j.duration_seconds}s` : ""}
              </div>
              <div className="flex gap-2 text-xs">
                <a
                  href={j.final_mp4_url}
                  download={`${j.product_slug}.mp4`}
                  className="px-2 py-1 rounded bg-primary text-primary-foreground"
                >
                  Download
                </a>
                <a
                  href={j.final_mp4_url}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2 py-1 rounded border"
                >
                  Direct URL
                </a>
              </div>
              <div className="text-[10px] text-muted-foreground mt-2 break-all">
                cinematic-v3/jobs/{j.id}/final.mp4
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "ok" | "bad" }) {
  return (
    <div className="border rounded-lg p-4 bg-card">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`text-2xl font-bold ${
          tone === "ok" ? "text-green-600" : tone === "bad" ? "text-red-600" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Badge({ state }: { state: "ok" | "bad" | "pending" }) {
  const map = {
    ok: "bg-green-100 text-green-800",
    bad: "bg-red-100 text-red-800",
    pending: "bg-gray-100 text-gray-600",
  } as const;
  const label = state === "ok" ? "200 OK" : state === "bad" ? "BROKEN" : "checking…";
  return <span className={`text-xs px-2 py-0.5 rounded ${map[state]}`}>{label}</span>;
}