import { useState, useMemo } from 'react';
import { Download, FileSpreadsheet, Check, Archive, Loader2, Eye, Mail, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  generateCampaignStructureCSV,
  generateResponsiveAdsCSV,
  generateKeywordsCSV,
  generateSitelinksCSV,
  generateImageAssetsCSV,
  downloadCSV,
  getCampaignStats,
  exportAllGoogleAds,
  exportAllAsZip
} from '@/utils/googleAdsExport';

type FileType = 'campaigns' | 'ads' | 'keywords' | 'sitelinks' | 'images';

const DownloadAds = () => {
  const [downloaded, setDownloaded] = useState<string[]>([]);
  const [isZipping, setIsZipping] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileType | null>(null);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [email, setEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const stats = getCampaignStats();

  const getCSVContent = (type: FileType): string => {
    switch (type) {
      case 'campaigns':
        return generateCampaignStructureCSV();
      case 'ads':
        return generateResponsiveAdsCSV();
      case 'keywords':
        return generateKeywordsCSV();
      case 'sitelinks':
        return generateSitelinksCSV();
      case 'images':
        return generateImageAssetsCSV();
    }
  };

  const parseCSV = (csv: string): { headers: string[]; rows: string[][] } => {
    const lines = csv.trim().split('\n');
    if (lines.length === 0) return { headers: [], rows: [] };
    
    const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
    const rows = lines.slice(1).map(line => {
      // Handle quoted values with commas
      const matches = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g) || [];
      return matches.map(m => m.replace(/,\s*$/, '').replace(/^"|"$/g, '').replace(/""/g, '"').trim());
    });
    
    return { headers, rows };
  };

  const previewData = useMemo(() => {
    if (!previewFile) return null;
    const csv = getCSVContent(previewFile);
    return parseCSV(csv);
  }, [previewFile]);

  const handleDownload = (type: FileType) => {
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `getpawsy_${type}_${timestamp}.csv`;
    downloadCSV(getCSVContent(type), filename);
    setDownloaded(prev => [...prev, type]);
  };

  const handleDownloadAll = () => {
    exportAllGoogleAds();
    setDownloaded(['campaigns', 'ads', 'keywords', 'sitelinks', 'images']);
  };

  const handleDownloadZip = async () => {
    setIsZipping(true);
    try {
      await exportAllAsZip();
      setDownloaded(['campaigns', 'ads', 'keywords', 'sitelinks', 'images', 'zip']);
    } finally {
      setIsZipping(false);
    }
  };

  const handleSendEmail = async () => {
    if (!email || !email.includes('@')) {
      toast.error('Voer een geldig e-mailadres in');
      return;
    }

    setIsSending(true);
    const timestamp = new Date().toISOString().split('T')[0];

    try {
      const csvFiles = [
        { filename: `getpawsy_campaigns_${timestamp}.csv`, content: generateCampaignStructureCSV() },
        { filename: `getpawsy_ads_${timestamp}.csv`, content: generateResponsiveAdsCSV() },
        { filename: `getpawsy_keywords_${timestamp}.csv`, content: generateKeywordsCSV() },
        { filename: `getpawsy_sitelinks_${timestamp}.csv`, content: generateSitelinksCSV() },
        { filename: `getpawsy_images_${timestamp}.csv`, content: generateImageAssetsCSV() },
      ];

      const { data, error } = await supabase.functions.invoke('send-ads-csv-email', {
        body: { email, csvFiles },
      });

      if (error) throw error;

      toast.success(`CSV bestanden verzonden naar ${email}`);
      setShowEmailDialog(false);
      setEmail('');
    } catch (error: any) {
      console.error('Error sending email:', error);
      toast.error('Fout bij het verzenden van de email');
    } finally {
      setIsSending(false);
    }
  };

  const files: { id: FileType; name: string; desc: string }[] = [
    { id: 'campaigns', name: 'Campaign Structure', desc: `${stats.campaigns} campaigns - US only targeting` },
    { id: 'ads', name: 'Responsive Search Ads', desc: `${stats.adGroups} ad groups, ${stats.headlines} headlines` },
    { id: 'keywords', name: 'Keywords', desc: `${stats.keywords} keywords (phrase + exact match)` },
    { id: 'sitelinks', name: 'Sitelinks', desc: '4 sitelinks per campaign' },
    { id: 'images', name: 'Image Assets', desc: '4 image URLs (logos + banners)' },
  ];

  const getFileName = (id: FileType) => {
    return files.find(f => f.id === id)?.name || id;
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl md:text-3xl font-bold">Google Ads CSV Export</h1>
          <p className="text-muted-foreground">
            Download CSV bestanden voor Google Ads Editor import
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Campagne Overzicht
            </CardTitle>
            <CardDescription>
              Target: Verenigde Staten | Taal: Engels
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>📊 <strong>{stats.campaigns}</strong> campagnes</p>
            <p>📁 <strong>{stats.adGroups}</strong> ad groups</p>
            <p>🔤 <strong>{stats.headlines}</strong> headlines</p>
            <p>🔍 <strong>{stats.keywords}</strong> keywords</p>
          </CardContent>
        </Card>

        <div className="grid gap-3 sm:grid-cols-3">
          <Button 
            onClick={handleDownloadZip}
            size="lg"
            className="gap-2"
            disabled={isZipping}
          >
            {isZipping ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Archive className="h-5 w-5" />
            )}
            {isZipping ? 'Creating...' : 'ZIP'}
          </Button>
          
          <Button 
            onClick={() => setShowEmailDialog(true)}
            size="lg"
            variant="secondary"
            className="gap-2"
          >
            <Mail className="h-5 w-5" />
            Email
          </Button>
          
          <Button 
            onClick={handleDownloadAll}
            size="lg"
            variant="outline"
            className="gap-2"
          >
            <Download className="h-5 w-5" />
            Losse CSVs
          </Button>
        </div>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground text-center">Of bekijk en download individueel:</p>
          
          {files.map((file) => (
            <Card key={file.id} className="overflow-hidden">
              <div className="flex items-center justify-between p-4 gap-2">
                <div className="space-y-1 flex-1 min-w-0">
                  <p className="font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{file.desc}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPreviewFile(file.id)}
                    className="gap-1"
                  >
                    <Eye className="h-4 w-4" />
                    <span className="hidden sm:inline">Preview</span>
                  </Button>
                  <Button
                    variant={downloaded.includes(file.id) ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => handleDownload(file.id)}
                    className="gap-1"
                  >
                    {downloaded.includes(file.id) ? (
                      <>
                        <Check className="h-4 w-4" />
                        <span className="hidden sm:inline">Done</span>
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4" />
                        <span className="hidden sm:inline">CSV</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <Card className="bg-muted/50">
          <CardContent className="p-4 text-sm space-y-2">
            <p className="font-medium">📱 iPhone tip:</p>
            <p className="text-muted-foreground">
              Bestanden komen in je Downloads map. Gebruik iCloud of mail om ze naar je desktop te sturen voor import in Google Ads Editor.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Preview Dialog */}
      <Dialog open={!!previewFile} onOpenChange={(open) => !open && setPreviewFile(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] p-0">
          <DialogHeader className="p-4 pb-2 border-b">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                {previewFile && getFileName(previewFile)}
              </DialogTitle>
            </div>
          </DialogHeader>
          
          <ScrollArea className="max-h-[60vh]">
            {previewData && (
              <div className="p-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {previewData.headers.map((header, i) => (
                        <TableHead key={i} className="whitespace-nowrap text-xs font-semibold">
                          {header}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewData.rows.slice(0, 50).map((row, rowIndex) => (
                      <TableRow key={rowIndex}>
                        {row.map((cell, cellIndex) => (
                          <TableCell key={cellIndex} className="text-xs max-w-[200px] truncate" title={cell}>
                            {cell || '-'}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {previewData.rows.length > 50 && (
                  <p className="text-xs text-muted-foreground text-center mt-4">
                    Showing first 50 of {previewData.rows.length} rows
                  </p>
                )}
              </div>
            )}
          </ScrollArea>
          
          <div className="p-4 border-t flex justify-between items-center">
            <p className="text-xs text-muted-foreground">
              {previewData?.rows.length || 0} rows total
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setPreviewFile(null)}>
                Sluiten
              </Button>
              {previewFile && (
                <Button onClick={() => {
                  handleDownload(previewFile);
                  setPreviewFile(null);
                }} className="gap-2">
                  <Download className="h-4 w-4" />
                  Download CSV
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Email Dialog */}
      <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              CSV bestanden per email versturen
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mailadres</Label>
              <Input
                id="email"
                type="email"
                placeholder="jouw@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSending}
              />
            </div>
            
            <p className="text-sm text-muted-foreground">
              Alle 5 CSV bestanden worden als bijlage verzonden met import instructies.
            </p>
          </div>
          
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowEmailDialog(false)} disabled={isSending}>
              Annuleren
            </Button>
            <Button onClick={handleSendEmail} disabled={isSending} className="gap-2">
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {isSending ? 'Verzenden...' : 'Verstuur'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DownloadAds;
