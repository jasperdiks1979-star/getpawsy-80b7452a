import { Helmet } from 'react-helmet-async';

interface VideoSchemaProps {
  video: {
    name: string;
    description: string;
    thumbnailUrl: string;
    uploadDate: string;
    duration?: string; // ISO 8601 duration format, e.g., "PT5M30S"
    contentUrl?: string;
    embedUrl?: string;
  };
  pageUrl?: string;
  baseUrl?: string;
}

export function VideoSchema({ 
  video, 
  pageUrl,
  baseUrl = 'https://getpawsy.pet' 
}: VideoSchemaProps) {
  const videoSchema = {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: video.name,
    description: video.description,
    thumbnailUrl: video.thumbnailUrl,
    uploadDate: video.uploadDate,
    ...(video.duration && { duration: video.duration }),
    ...(video.contentUrl && { contentUrl: video.contentUrl }),
    ...(video.embedUrl && { embedUrl: video.embedUrl }),
    publisher: {
      '@type': 'Organization',
      name: 'GetPawsy',
      logo: {
        '@type': 'ImageObject',
        url: `${baseUrl}/favicon.png`,
      },
    },
    ...(pageUrl && {
      potentialAction: {
        '@type': 'WatchAction',
        target: pageUrl,
      },
    }),
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(videoSchema)}
      </script>
    </Helmet>
  );
}

// Helper to convert seconds to ISO 8601 duration
export function secondsToIsoDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  let duration = 'PT';
  if (hours > 0) duration += `${hours}H`;
  if (minutes > 0) duration += `${minutes}M`;
  if (secs > 0 || duration === 'PT') duration += `${secs}S`;

  return duration;
}
