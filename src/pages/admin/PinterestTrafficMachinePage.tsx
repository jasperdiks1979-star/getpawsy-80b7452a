import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, Copy, Check, Pin, Clock, Hash, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';

interface PinData {
  pinNumber: number;
  hookAngle: string;
  title: string;
  description: string;
  imagePrompt: string;
  suggestedOverlayText: string;
  bestPostingTime: string;
}

interface PinterestResult {
  productUrl: string;
  primaryKeyword: string;
  longTailKeywords: string[];
  pinterestPhrases: string[];
  pins: PinData[];
  postingSchedule: Record<string, string>;
  suggestedBoards: string[];
}

export default function PinterestTrafficMachinePage() {
  const [search, setSearch] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [generatedData, setGeneratedData] = useState<PinterestResult | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: products, isLoading: loadingProducts } = useQuery({
    queryKey: ['admin-products-pinterest', search],
    queryFn: async () => {
      let q = supabase.from('products').select('id, name, slug, price, category, image_url').eq('is_active', true).order('name');
      if (search) q = q.ilike('name', `%${search}%`);
      const { data, error } = await q.limit(20);
      if (error) throw error;
      return data;
    },
  });

  const { data: existingPins } = useQuery({
    queryKey: ['pinterest-pins-all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('pinterest_pins').select('product_id, product_name, generated_at').order('generated_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (productId: string) => {
      const { data, error } = await supabase.functions.invoke('pinterest-pin-generator', {
        body: { productId },
      });
      if (error) throw error;
      if (!data.ok) throw new Error(data.error || 'Generation failed');
      return data.data as PinterestResult;
    },
    onSuccess: (data) => {
      setGeneratedData(data);
      queryClient.invalidateQueries({ queryKey: ['pinterest-pins-all'] });
      toast.success('Pinterest pins generated!');
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const handleGenerate = (productId: string) => {
    setSelectedProductId(productId);
    setGeneratedData(null);
    generateMutation.mutate(productId);
  };

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success('Copied!');
    setTimeout(() => setCopiedField(null), 2000);
  };

  const CopyButton = ({ text, field }: { text: string; field: string }) => (
    <Button variant="ghost" size="sm" onClick={() => copyToClipboard(text, field)} className="h-6 w-6 p-0">
      {copiedField === field ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
    </Button>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Pin className="h-6 w-6 text-red-500" />
          Pinterest Traffic Machine
        </h1>
        <p className="text-muted-foreground mt-1">Generate high-CTR Pinterest pins for any product</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{existingPins?.length || 0}</div>
            <div className="text-sm text-muted-foreground">Products with pins</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{(existingPins?.length || 0) * 3}</div>
            <div className="text-sm text-muted-foreground">Total pins generated</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{products?.length || 0}</div>
            <div className="text-sm text-muted-foreground">Products available</div>
          </CardContent>
        </Card>
      </div>

      {/* Product Search */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Select Product</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {loadingProducts ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div>
          ) : (
            <div className="grid gap-2 max-h-64 overflow-y-auto">
              {products?.map((p) => {
                const hasPin = existingPins?.some((pin) => pin.product_id === p.id);
                return (
                  <div key={p.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      {p.image_url && <img src={p.image_url} alt="" className="w-10 h-10 rounded object-cover" />}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground">${p.price} · {p.category || 'Uncategorized'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {hasPin && <Badge variant="secondary" className="text-xs">Has pins</Badge>}
                      <Button
                        size="sm"
                        onClick={() => handleGenerate(p.id)}
                        disabled={generateMutation.isPending && selectedProductId === p.id}
                      >
                        {generateMutation.isPending && selectedProductId === p.id ? (
                          <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Generating...</>
                        ) : (
                          <><Sparkles className="h-3 w-3 mr-1" /> Generate Pins</>
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Generated Results */}
      {generatedData && (
        <div className="space-y-4">
          {/* Keywords & SEO */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Hash className="h-5 w-5" /> Keywords & SEO
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm font-medium">Primary Keyword</p>
                <div className="flex items-center gap-2">
                  <Badge>{generatedData.primaryKeyword}</Badge>
                  <CopyButton text={generatedData.primaryKeyword} field="pk" />
                </div>
              </div>
              <div>
                <p className="text-sm font-medium">Long-tail Keywords</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {generatedData.longTailKeywords?.map((kw, i) => (
                    <Badge key={i} variant="outline" className="text-xs">{kw}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium">Pinterest Phrases</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {generatedData.pinterestPhrases?.map((ph, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">{ph}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium">Suggested Boards</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {generatedData.suggestedBoards?.map((b, i) => (
                    <Badge key={i} className="bg-red-100 text-red-700 text-xs">{b}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium">Product URL (for pin link field)</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs bg-muted px-2 py-1 rounded">{generatedData.productUrl}</code>
                  <CopyButton text={generatedData.productUrl} field="url" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Posting Schedule */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5" /> Posting Schedule
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {Object.entries(generatedData.postingSchedule || {}).map(([key, val]) => (
                  <div key={key} className="p-3 bg-accent/30 rounded-lg">
                    <p className="text-xs font-medium uppercase text-muted-foreground">{key}</p>
                    <p className="text-sm">{val}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Pins */}
          {generatedData.pins?.map((pin, idx) => (
            <Card key={idx} className="border-l-4 border-l-red-500">
              <CardHeader>
                <CardTitle className="text-lg flex items-center justify-between">
                  <span>PIN {pin.pinNumber || idx + 1}</span>
                  <Badge variant="outline">{pin.hookAngle}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Title */}
                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-muted-foreground">Title ({pin.title?.length || 0}/100 chars)</p>
                    <CopyButton text={pin.title} field={`title-${idx}`} />
                  </div>
                  <p className="text-base font-semibold mt-1">{pin.title}</p>
                </div>

                {/* Description */}
                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-muted-foreground">Description ({pin.description?.length || 0} chars)</p>
                    <CopyButton text={pin.description} field={`desc-${idx}`} />
                  </div>
                  <p className="text-sm mt-1 whitespace-pre-wrap bg-muted/50 p-3 rounded-lg">{pin.description}</p>
                </div>

                {/* Overlay Text */}
                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-muted-foreground">Overlay Text Suggestion</p>
                    <CopyButton text={pin.suggestedOverlayText} field={`overlay-${idx}`} />
                  </div>
                  <p className="text-sm font-bold mt-1 bg-red-50 text-red-800 p-2 rounded">{pin.suggestedOverlayText}</p>
                </div>

                {/* Image Prompt */}
                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-muted-foreground flex items-center gap-1"><ImageIcon className="h-3 w-3" /> Image Prompt</p>
                    <CopyButton text={pin.imagePrompt} field={`img-${idx}`} />
                  </div>
                  <p className="text-xs mt-1 bg-blue-50 text-blue-800 p-3 rounded-lg font-mono">{pin.imagePrompt}</p>
                </div>

                {/* Best Time */}
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Best posting time: {pin.bestPostingTime}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
