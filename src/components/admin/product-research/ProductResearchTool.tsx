import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useProductResearch, ProductData } from '@/hooks/useProductResearch';
import { 
  Search, 
  Loader2, 
  Package, 
  DollarSign, 
  Star, 
  Tag, 
  Copy, 
  Check,
  Image as ImageIcon,
  FileText,
  List,
  ExternalLink
} from 'lucide-react';

export function ProductResearchTool() {
  const [url, setUrl] = useState('');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const { isLoading, result, researchProduct, clearResult } = useProductResearch();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await researchProduct(url);
  };

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const formatPrice = (price: number | null, currency: string | null) => {
    if (price === null) return 'Onbekend';
    const currencySymbol = currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$';
    return `${currencySymbol}${price.toFixed(2)}`;
  };

  const product = result?.data;

  return (
    <div className="space-y-6">
      {/* Search Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Product Research
          </CardTitle>
          <CardDescription>
            Voer een product URL in om automatisch productinformatie, prijzen en beschrijvingen op te halen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex gap-3">
            <Input
              type="url"
              placeholder="https://www.amazon.com/product/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-1"
              disabled={isLoading}
            />
            <Button type="submit" disabled={isLoading || !url.trim()}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Ophalen...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Onderzoek
                </>
              )}
            </Button>
            {result && (
              <Button type="button" variant="outline" onClick={clearResult}>
                Wissen
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Error State */}
      {result && !result.success && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">{result.error || 'Er is een fout opgetreden.'}</p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {product && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Basic Info Card */}
          <Card className="md:col-span-2">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    {product.name || 'Onbekend product'}
                  </CardTitle>
                  {product.brand && (
                    <CardDescription>
                      Merk: {product.brand}
                    </CardDescription>
                  )}
                </div>
                {product.name && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(product.name!, 'name')}
                  >
                    {copiedField === 'name' ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                {/* Price */}
                <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-2">
                  <DollarSign className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-xs text-muted-foreground">Prijs</p>
                    <p className="font-semibold text-lg">
                      {formatPrice(product.price, product.currency)}
                    </p>
                  </div>
                </div>

                {/* Rating */}
                {product.rating !== null && (
                  <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-2">
                    <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                    <div>
                      <p className="text-xs text-muted-foreground">Beoordeling</p>
                      <p className="font-semibold">
                        {product.rating}/5
                        {product.reviewCount && (
                          <span className="text-sm font-normal text-muted-foreground ml-1">
                            ({product.reviewCount.toLocaleString()} reviews)
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                )}

                {/* Category */}
                {product.category && (
                  <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-2">
                    <Tag className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">Categorie</p>
                      <p className="font-medium">{product.category}</p>
                    </div>
                  </div>
                )}

                {/* Availability */}
                {product.availability && (
                  <Badge 
                    variant={product.availability === 'In Stock' ? 'default' : 'secondary'}
                    className="h-fit"
                  >
                    {product.availability === 'In Stock' ? 'Op voorraad' : 'Niet op voorraad'}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Description Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4" />
                Beschrijving
              </CardTitle>
            </CardHeader>
            <CardContent>
              {product.description ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {product.description}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(product.description!, 'description')}
                  >
                    {copiedField === 'description' ? (
                      <>
                        <Check className="mr-2 h-4 w-4 text-green-500" />
                        Gekopieerd!
                      </>
                    ) : (
                      <>
                        <Copy className="mr-2 h-4 w-4" />
                        Kopieer beschrijving
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  Geen beschrijving gevonden.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Specifications Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <List className="h-4 w-4" />
                Specificaties
              </CardTitle>
            </CardHeader>
            <CardContent>
              {Object.keys(product.specifications).length > 0 ? (
                <ScrollArea className="h-[200px]">
                  <div className="space-y-2">
                    {Object.entries(product.specifications).map(([key, value]) => (
                      <div key={key} className="flex justify-between text-sm border-b pb-2">
                        <span className="font-medium">{key}</span>
                        <span className="text-muted-foreground">{value}</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  Geen specificaties gevonden.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Images Card */}
          {product.images.length > 0 && (
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ImageIcon className="h-4 w-4" />
                  Afbeeldingen ({product.images.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {product.images.map((imageUrl, index) => (
                    <a
                      key={index}
                      href={imageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative aspect-square rounded-lg overflow-hidden border bg-muted hover:ring-2 hover:ring-primary transition-all"
                    >
                      <img
                        src={imageUrl}
                        alt={`Product afbeelding ${index + 1}`}
                        className="object-cover w-full h-full"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/placeholder.svg';
                        }}
                      />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <ExternalLink className="h-6 w-6 text-white" />
                      </div>
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Raw Data Card (collapsed by default) */}
          {result?.rawMarkdown && (
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Ruwe data</CardTitle>
                <CardDescription>De eerste 5000 tekens van de gescrapete content</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[200px]">
                  <pre className="text-xs whitespace-pre-wrap font-mono bg-muted p-4 rounded-lg">
                    {result.rawMarkdown}
                  </pre>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
