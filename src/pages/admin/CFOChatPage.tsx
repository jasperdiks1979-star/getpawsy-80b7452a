import { useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, Sparkles, ShieldCheck, RotateCcw } from "lucide-react";
import { useAuthenticatedFetch } from "@/hooks/useAuthenticatedFetch";
import { toast } from "sonner";

type Turn = { role: "user" | "assistant"; content: string; sources?: any[] };

const SUGGESTIONS = [
  "How much have I spent on Lovable in total?",
  "Show every Apple invoice with amount and date.",
  "Which subscriptions renew in the next 30 days?",
  "How much recoverable VAT is still outstanding?",
  "Which suppliers had the largest price increases?",
  "What is my largest recurring expense right now?",
  "Show all hardware assets above €450 and their book value.",
  "Which invoices are missing (unlinked payments)?",
];

export default function CFOChatPage() {
  const { invokeFunction } = useAuthenticatedFetch();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [certifying, setCertifying] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, loading]);

  useEffect(() => { textareaRef.current?.focus(); }, []);

  const history = useMemo(
    () => turns.map((t) => ({ role: t.role, content: t.content })),
    [turns],
  );

  async function send(text?: string) {
    const q = (text ?? input).trim();
    if (!q || loading) return;
    setInput("");
    setTurns((prev) => [...prev, { role: "user", content: q }]);
    setLoading(true);
    const { data, error } = await invokeFunction<{ answer: string; sources: any[]; error?: string }>(
      "finance-cfo-chat",
      { body: { question: q, history } },
    );
    setLoading(false);
    if (error || !data || data.error) {
      const msg = data?.error || error?.message || "The Digital CFO is temporarily unreachable.";
      setTurns((prev) => [...prev, { role: "assistant", content: `⚠️ ${msg}` }]);
      return;
    }
    setTurns((prev) => [...prev, { role: "assistant", content: data.answer, sources: data.sources }]);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  async function runCertify() {
    setCertifying(true);
    const { data, error } = await invokeFunction<{ overall: number; scores: Record<string, number>; storage_path: string }>(
      "finance-v14-1-certify",
      { body: {} },
    );
    setCertifying(false);
    if (error || !data) { toast.error("Certification failed"); return; }
    toast.success(`V14.1 Certification generated — Overall ${data.overall}/100`);
    const summary = [
      `**V14.1 Certification issued.** Overall CFO Intelligence: **${data.overall}/100**.`,
      "",
      ...Object.entries(data.scores).map(([k, v]) => `- ${k.replace(/_/g, " ")}: ${v}/100`),
      "",
      `Archived to Evidence Vault at \`${data.storage_path}\`.`,
    ].join("\n");
    setTurns((prev) => [...prev, { role: "assistant", content: summary }]);
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Helmet><title>Digital CFO — Genesis V14.1</title></Helmet>

      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" /> Digital CFO
          </h1>
          <p className="text-sm text-muted-foreground">Genesis V14.1 · Financial Time Machine · every answer is grounded in your Evidence Vault.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setTurns([])} disabled={loading}>
            <RotateCcw className="h-4 w-4" /> New chat
          </Button>
          <Button size="sm" onClick={runCertify} disabled={certifying}>
            {certifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Certify V14.1
          </Button>
        </div>
      </div>

      <Card className="mb-4">
        <CardContent className="p-0">
          <div ref={scrollRef} className="h-[55vh] overflow-y-auto p-4 space-y-4">
            {turns.length === 0 && !loading ? (
              <div className="text-center py-10 space-y-4">
                <p className="text-sm text-muted-foreground">Ask any question about GetPawsy's financial history.</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {SUGGESTIONS.map((s) => (
                    <Button key={s} variant="secondary" size="sm" className="text-xs h-auto py-1.5" onClick={() => send(s)}>
                      {s}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}

            {turns.map((t, i) => (
              <div key={i} className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-lg px-4 py-3 ${t.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  {t.role === "assistant" ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-ul:my-2 prose-table:text-xs">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{t.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap text-sm">{t.content}</div>
                  )}
                  {t.sources && t.sources.length > 0 ? (
                    <div className="mt-3 pt-3 border-t border-border/50 flex flex-wrap gap-1">
                      {t.sources.slice(0, 8).map((s, j) => (
                        <Badge key={j} variant="outline" className="text-[10px]">{s.type}: {s.title?.slice(0, 40)}</Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}

            {loading ? (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-4 py-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Consulting the Financial Evidence Vault…
                </div>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2 items-end">
        <Textarea
          ref={textareaRef}
          placeholder="Ask the CFO anything… (Shift+Enter for newline)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
          }}
          className="min-h-[60px] resize-none"
          disabled={loading}
        />
        <Button onClick={() => send()} disabled={loading || !input.trim()} className="h-[60px] px-5">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
