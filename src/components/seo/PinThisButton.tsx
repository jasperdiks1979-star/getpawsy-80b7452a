import { SITE_URL } from '@/lib/constants';

interface PinThisButtonProps {
  imageUrl: string;
  pageUrl: string;
  description: string;
  className?: string;
}

/**
 * Pinterest "Pin This" share button — opens Pinterest save dialog
 * with keyword-rich description and image.
 */
export function PinThisButton({ imageUrl, pageUrl, description, className = '' }: PinThisButtonProps) {
  const fullUrl = pageUrl.startsWith('http') ? pageUrl : `${SITE_URL}${pageUrl}`;
  const pinUrl = `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(fullUrl)}&media=${encodeURIComponent(imageUrl)}&description=${encodeURIComponent(description)}`;

  return (
    <a
      href={pinUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold bg-[hsl(0,80%,45%)] text-white hover:bg-[hsl(0,80%,40%)] transition-colors ${className}`}
      aria-label="Save to Pinterest"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
        <path d="M12 0a12 12 0 0 0-4.373 23.178c-.07-.937-.133-2.377.028-3.4.145-.924 1.048-4.444 1.048-4.444s-.267-.536-.267-1.328c0-1.244.722-2.173 1.62-2.173.765 0 1.133.573 1.133 1.26 0 .768-.489 1.916-.74 2.98-.21.89.447 1.615 1.326 1.615 1.592 0 2.814-1.678 2.814-4.1 0-2.143-1.54-3.642-3.742-3.642-2.548 0-4.044 1.91-4.044 3.886 0 .77.297 1.596.667 2.045a.268.268 0 0 1 .062.258c-.068.283-.219.89-.249 1.014-.039.166-.13.2-.3.12-1.12-.521-1.82-2.157-1.82-3.472 0-2.825 2.053-5.42 5.922-5.42 3.11 0 5.527 2.216 5.527 5.178 0 3.09-1.949 5.577-4.652 5.577-.908 0-1.763-.472-2.056-.03 0 0-.45 1.71-.56 2.134-.202.78-.75 1.756-1.117 2.352A12 12 0 1 0 12 0"/>
      </svg>
      Pin This
    </a>
  );
}
