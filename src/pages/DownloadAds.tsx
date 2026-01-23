import { useState, useMemo } from 'react';
import { Download, FileSpreadsheet, Check, Archive, Loader2, Eye, Mail, Send, Copy, ClipboardCheck, Sheet, ExternalLink, Search, X } from 'lucide-react';
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
  const [copied, setCopied] = useState<string[]>([]);
  const [isZipping, setIsZipping] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileType | null>(null);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [email, setEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isExportingSheets, setIsExportingSheets] = useState(false);
  const [previewSearch, setPreviewSearch] = useState('');
  const [previewColumnFilter, setPreviewColumnFilter] = useState<number | null>(null);
  const stats = getCampaignStats();

  // Reset search when preview file changes
  const handlePreviewOpen = (fileId: FileType) => {
    setPreviewSearch('');
    setPreviewColumnFilter(null);
    setPreviewFile(fileId);
  };

  const handleCopyToClipboard = async (type: FileType) => {
    const content = getCSVContent(type);
    try {
      await navigator.clipboard.writeText(content);
      setCopied(prev => [...prev, type]);
      toast.success(`${type} gekopieerd naar clipboard`);
      
      // Reset copied state after 3 seconds
      setTimeout(() => {
        setCopied(prev => prev.filter(id => id !== type));
      }, 3000);
    } catch (error) {
      toast.error('Kopiëren mislukt');
    }
  };

  const handleCopyAll = async () => {
    const timestamp = new Date().toISOString().split('T')[0];
    const allContent = [
      `=== CAMPAIGNS (${timestamp}) ===\n${generateCampaignStructureCSV()}`,
      `\n\n=== ADS ===\n${generateResponsiveAdsCSV()}`,
      `\n\n=== KEYWORDS ===\n${generateKeywordsCSV()}`,
      `\n\n=== SITELINKS ===\n${generateSitelinksCSV()}`,
      `\n\n=== IMAGES ===\n${generateImageAssetsCSV()}`,
    ].join('');
    
    try {
      await navigator.clipboard.writeText(allContent);
      setCopied(['campaigns', 'ads', 'keywords', 'sitelinks', 'images']);
      toast.success('Alle data gekopieerd naar clipboard');
      
      setTimeout(() => {
        setCopied([]);
      }, 3000);
    } catch (error) {
      toast.error('Kopiëren mislukt');
    }
  };

  const handleExportToSheets = async () => {
    setIsExportingSheets(true);
    const timestamp = new Date().toISOString().split('T')[0];
    
    try {
      const sheets = [
        { title: 'Campaigns', csvContent: generateCampaignStructureCSV() },
        { title: 'Ads', csvContent: generateResponsiveAdsCSV() },
        { title: 'Keywords', csvContent: generateKeywordsCSV() },
        { title: 'Sitelinks', csvContent: generateSitelinksCSV() },
        { title: 'Images', csvContent: generateImageAssetsCSV() },
      ];

      const { data, error } = await supabase.functions.invoke('export-to-sheets', {
        body: { 
          sheets, 
          spreadsheetTitle: `GetPawsy Google Ads - ${timestamp}` 
        },
      });

      if (error) throw error;

      if (data?.url) {
        toast.success('Google Sheet aangemaakt!', {
          action: {
            label: 'Openen',
            onClick: () => window.open(data.url, '_blank'),
          },
        });
        window.open(data.url, '_blank');
      }
    } catch (error: any) {
      console.error('Error exporting to sheets:', error);
      toast.error('Export naar Google Sheets mislukt');
    } finally {
      setIsExportingSheets(false);
    }
  };

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

  const filteredPreviewData = useMemo(() => {
    if (!previewData) return null;
    if (!previewSearch.trim()) return previewData;
    
    const searchLower = previewSearch.toLowerCase();
    const filteredRows = previewData.rows.filter(row => {
      if (previewColumnFilter !== null) {
        // Filter only specific column
        return row[previewColumnFilter]?.toLowerCase().includes(searchLower);
      }
      // Filter all columns
      return row.some(cell => cell?.toLowerCase().includes(searchLower));
    });
    
    return { headers: previewData.headers, rows: filteredRows };
  }, [previewData, previewSearch, previewColumnFilter]);

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

        <div className="grid gap-3 grid-cols-2 sm:grid-cols-5">
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
            ZIP
          </Button>
          
          <Button 
            onClick={handleExportToSheets}
            size="lg"
            variant="secondary"
            className="gap-2"
            disabled={isExportingSheets}
          >
            {isExportingSheets ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Sheet className="h-5 w-5" />
            )}
            Sheets
          </Button>
          
          <Button 
            onClick={handleCopyAll}
            size="lg"
            variant="secondary"
            className="gap-2"
          >
            {copied.length === 5 ? (
              <ClipboardCheck className="h-5 w-5" />
            ) : (
              <Copy className="h-5 w-5" />
            )}
            Copy
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
            CSVs
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
                <div className="flex gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handlePreviewOpen(file.id)}
                    className="gap-1 px-2"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={copied.includes(file.id) ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => handleCopyToClipboard(file.id)}
                    className="gap-1 px-2"
                  >
                    {copied.includes(file.id) ? (
                      <ClipboardCheck className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant={downloaded.includes(file.id) ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => handleDownload(file.id)}
                    className="gap-1 px-2"
                  >
                    {downloaded.includes(file.id) ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Download className="h-4 w-4" />
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
          <DialogHeader className="p-4 pb-2 border-b space-y-3">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                {previewFile && getFileName(previewFile)}
              </DialogTitle>
            </div>
            
            {/* Search and Filter */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Zoeken in alle kolommen..."
                  value={previewSearch}
                  onChange={(e) => setPreviewSearch(e.target.value)}
                  className="pl-9 pr-9"
                />
                {previewSearch && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                    onClick={() => setPreviewSearch('')}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              
              {previewData && previewData.headers.length > 0 && (
                <select
                  value={previewColumnFilter ?? ''}
                  onChange={(e) => setPreviewColumnFilter(e.target.value === '' ? null : Number(e.target.value))}
                  className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Alle kolommen</option>
                  {previewData.headers.map((header, i) => (
                    <option key={i} value={i}>{header}</option>
                  ))}
                </select>
              )}
            </div>
          </DialogHeader>
          
          <ScrollArea className="max-h-[55vh]">
            {filteredPreviewData && (
              <div className="p-4">
                {filteredPreviewData.rows.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Geen resultaten gevonden voor "{previewSearch}"</p>
                  </div>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {filteredPreviewData.headers.map((header, i) => (
                            <TableHead 
                              key={i} 
                              className={`whitespace-nowrap text-xs font-semibold cursor-pointer hover:bg-muted/50 ${previewColumnFilter === i ? 'bg-primary/10' : ''}`}
                              onClick={() => setPreviewColumnFilter(previewColumnFilter === i ? null : i)}
                            >
                              {header}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredPreviewData.rows.slice(0, 100).map((row, rowIndex) => (
                          <TableRow key={rowIndex}>
                            {row.map((cell, cellIndex) => (
                              <TableCell 
                                key={cellIndex} 
                                className={`text-xs max-w-[200px] truncate ${previewColumnFilter === cellIndex ? 'bg-primary/5' : ''}`} 
                                title={cell}
                              >
                                {previewSearch && cell?.toLowerCase().includes(previewSearch.toLowerCase()) ? (
                                  <span dangerouslySetInnerHTML={{
                                    __html: cell.replace(
                                      new RegExp(`(${previewSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
                                      '<mark class="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5">$1</mark>'
                                    )
                                  }} />
                                ) : (
                                  cell || '-'
                                )}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {filteredPreviewData.rows.length > 100 && (
                      <p className="text-xs text-muted-foreground text-center mt-4">
                        Showing first 100 of {filteredPreviewData.rows.length} matching rows
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </ScrollArea>
          
          <div className="p-4 border-t flex justify-between items-center">
            <p className="text-xs text-muted-foreground">
              {filteredPreviewData?.rows.length || 0} {previewSearch ? 'matching' : 'total'} rows
              {previewSearch && previewData && ` (of ${previewData.rows.length})`}
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
