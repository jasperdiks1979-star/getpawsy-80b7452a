import { useState } from 'react';
import { Download, FileSpreadsheet, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  generateCampaignStructureCSV,
  generateResponsiveAdsCSV,
  generateKeywordsCSV,
  generateSitelinksCSV,
  generateImageAssetsCSV,
  downloadCSV,
  getCampaignStats,
  exportAllGoogleAds
} from '@/utils/googleAdsExport';

const DownloadAds = () => {
  const [downloaded, setDownloaded] = useState<string[]>([]);
  const stats = getCampaignStats();

  const handleDownload = (type: string) => {
    const timestamp = new Date().toISOString().split('T')[0];
    
    switch (type) {
      case 'campaigns':
        downloadCSV(generateCampaignStructureCSV(), `getpawsy_campaigns_${timestamp}.csv`);
        break;
      case 'ads':
        downloadCSV(generateResponsiveAdsCSV(), `getpawsy_ads_${timestamp}.csv`);
        break;
      case 'keywords':
        downloadCSV(generateKeywordsCSV(), `getpawsy_keywords_${timestamp}.csv`);
        break;
      case 'sitelinks':
        downloadCSV(generateSitelinksCSV(), `getpawsy_sitelinks_${timestamp}.csv`);
        break;
      case 'images':
        downloadCSV(generateImageAssetsCSV(), `getpawsy_images_${timestamp}.csv`);
        break;
    }
    
    setDownloaded(prev => [...prev, type]);
  };

  const handleDownloadAll = () => {
    exportAllGoogleAds();
    setDownloaded(['campaigns', 'ads', 'keywords', 'sitelinks', 'images']);
  };

  const files = [
    { id: 'campaigns', name: 'Campaign Structure', desc: `${stats.campaigns} campaigns - US only targeting` },
    { id: 'ads', name: 'Responsive Search Ads', desc: `${stats.adGroups} ad groups, ${stats.headlines} headlines` },
    { id: 'keywords', name: 'Keywords', desc: `${stats.keywords} keywords (phrase + exact match)` },
    { id: 'sitelinks', name: 'Sitelinks', desc: '4 sitelinks per campaign' },
    { id: 'images', name: 'Image Assets', desc: '4 image URLs (logos + banners)' },
  ];

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

        <Button 
          onClick={handleDownloadAll}
          size="lg"
          className="w-full gap-2"
        >
          <Download className="h-5 w-5" />
          Download Alle Bestanden
        </Button>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground text-center">Of download individueel:</p>
          
          {files.map((file) => (
            <Card key={file.id} className="overflow-hidden">
              <div className="flex items-center justify-between p-4">
                <div className="space-y-1">
                  <p className="font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{file.desc}</p>
                </div>
                <Button
                  variant={downloaded.includes(file.id) ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => handleDownload(file.id)}
                  className="gap-1"
                >
                  {downloaded.includes(file.id) ? (
                    <>
                      <Check className="h-4 w-4" />
                      Done
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      CSV
                    </>
                  )}
                </Button>
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
    </div>
  );
};

export default DownloadAds;
