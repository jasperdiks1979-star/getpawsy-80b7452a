import { CrawlHealthMonitor } from '@/components/admin/CrawlHealthMonitor';
import { Helmet } from 'react-helmet-async';

const CrawlHealthDashboard = () => {
  return (
    <>
      <Helmet>
        <title>Crawl Health Monitor | GetPawsy Admin</title>
      </Helmet>
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <CrawlHealthMonitor />
      </div>
    </>
  );
};

export default CrawlHealthDashboard;
