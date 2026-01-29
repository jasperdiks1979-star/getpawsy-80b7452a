import { Helmet } from 'react-helmet-async';

interface EventSchemaProps {
  event: {
    name: string;
    description: string;
    startDate: string; // ISO 8601 format
    endDate?: string; // ISO 8601 format
    image?: string;
    url?: string;
    location?: {
      type: 'online' | 'physical';
      name?: string;
      address?: string;
      url?: string;
    };
    offers?: {
      price?: number;
      priceCurrency?: string;
      availability?: 'InStock' | 'SoldOut' | 'PreOrder';
      validFrom?: string;
      url?: string;
    };
    organizer?: {
      name: string;
      url?: string;
    };
    eventStatus?: 'Scheduled' | 'Cancelled' | 'Postponed' | 'Rescheduled';
    eventAttendanceMode?: 'Online' | 'Offline' | 'Mixed';
  };
  baseUrl?: string;
}

export function EventSchema({ 
  event, 
  baseUrl = 'https://getpawsy.pet' 
}: EventSchemaProps) {
  const eventSchema = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.name,
    description: event.description,
    startDate: event.startDate,
    ...(event.endDate && { endDate: event.endDate }),
    ...(event.image && { image: event.image }),
    ...(event.url && { url: event.url }),
    eventStatus: `https://schema.org/Event${event.eventStatus || 'Scheduled'}`,
    eventAttendanceMode: event.eventAttendanceMode 
      ? `https://schema.org/${event.eventAttendanceMode}EventAttendanceMode`
      : 'https://schema.org/OnlineEventAttendanceMode',
    ...(event.location && {
      location: event.location.type === 'online' 
        ? {
            '@type': 'VirtualLocation',
            url: event.location.url || event.url || baseUrl,
          }
        : {
            '@type': 'Place',
            name: event.location.name,
            address: event.location.address,
          },
    }),
    ...(event.offers && {
      offers: {
        '@type': 'Offer',
        price: event.offers.price || 0,
        priceCurrency: event.offers.priceCurrency || 'USD',
        availability: `https://schema.org/${event.offers.availability || 'InStock'}`,
        ...(event.offers.validFrom && { validFrom: event.offers.validFrom }),
        url: event.offers.url || event.url || baseUrl,
      },
    }),
    organizer: {
      '@type': 'Organization',
      name: event.organizer?.name || 'GetPawsy',
      url: event.organizer?.url || baseUrl,
    },
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(eventSchema)}
      </script>
    </Helmet>
  );
}

// Helper to create sale events
export function createSaleEvent(
  saleName: string,
  description: string,
  startDate: Date,
  endDate: Date,
  discountPercentage?: number
): EventSchemaProps['event'] {
  return {
    name: saleName,
    description: discountPercentage 
      ? `${description} Save up to ${discountPercentage}% on select pet products!`
      : description,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    url: 'https://getpawsy.pet/products',
    location: {
      type: 'online',
      url: 'https://getpawsy.pet',
    },
    offers: {
      price: 0,
      priceCurrency: 'USD',
      availability: 'InStock',
      validFrom: startDate.toISOString(),
    },
    eventStatus: 'Scheduled',
    eventAttendanceMode: 'Online',
  };
}

// Pre-built sale events for common promotions
export const COMMON_SALE_EVENTS = {
  blackFriday: (year: number) => createSaleEvent(
    `GetPawsy Black Friday Sale ${year}`,
    'Massive savings on premium pet products during our Black Friday sale event.',
    new Date(year, 10, 24), // November 24
    new Date(year, 10, 28), // November 28
    50
  ),
  cyberMonday: (year: number) => createSaleEvent(
    `GetPawsy Cyber Monday Deals ${year}`,
    'Online-exclusive deals on pet supplies for Cyber Monday.',
    new Date(year, 10, 27), // November 27
    new Date(year, 10, 28), // November 28
    40
  ),
  springClearance: (year: number) => createSaleEvent(
    `Spring Pet Supplies Clearance ${year}`,
    'Spring cleaning sale with huge discounts on pet beds, toys, and accessories.',
    new Date(year, 2, 1), // March 1
    new Date(year, 2, 15), // March 15
    30
  ),
  petDay: (year: number) => createSaleEvent(
    `National Pet Day Sale ${year}`,
    'Celebrate National Pet Day with special discounts on everything for your furry friends!',
    new Date(year, 3, 11), // April 11
    new Date(year, 3, 12), // April 12
    25
  ),
};
