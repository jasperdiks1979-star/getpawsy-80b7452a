import { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { MessageCircle, X, Send, Loader2, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useChatbot } from '@/hooks/useChatbot';
import { useLocation } from 'react-router-dom';

interface ChatWidgetProps {
  productContext?: Array<{
    id: string;
    name: string;
    price: number;
    category?: string | null;
    description?: string | null;
  }>;
}

const WELCOME_MESSAGE = {
  id: 'welcome',
  role: 'assistant' as const,
  content: "Hi! 👋 I'm Pawsy, your shopping assistant. I can help you find the perfect products for your furry friend, answer shipping questions, or check on an order. What can I help you with?",
  timestamp: new Date(),
};

export function ChatWidget({ productContext = [] }: ChatWidgetProps) {
  const location = useLocation();
  const [inputValue, setInputValue] = useState('');
  const [hasInteracted, setHasInteracted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { messages, isLoading, isOpen, setIsOpen, sendMessage } = useChatbot({
    productContext,
    onError: (error) => console.error('Chatbot error:', error),
  });

  // Determine if we should show the widget based on route
  const shouldShow = 
    location.pathname.startsWith('/product/') ||
    location.pathname.startsWith('/bestseller/') ||
    location.pathname === '/bestsellers' ||
    location.pathname === '/shop';

  // Chat is click-to-open only — no auto-open behavior
  // This prevents viewport obstruction on mobile and desktop

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;
    sendMessage(inputValue);
    setInputValue('');
  };

  const handleOpen = () => {
    setIsOpen(true);
    setHasInteracted(true);
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
  };

  if (!shouldShow) return null;

  const displayMessages = messages.length === 0 
    ? [WELCOME_MESSAGE] 
    : [WELCOME_MESSAGE, ...messages];

  return (
    <>
      {/* Chat bubble button */}
      <button
        onClick={handleOpen}
        className={cn(
          "fixed bottom-4 right-4 z-50 flex items-center justify-center",
          "w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg",
          "hover:scale-105 transition-all duration-200",
          "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
          isOpen && "hidden"
        )}
        aria-label="Open chat assistant"
      >
        <MessageCircle className="w-6 h-6" />
        {!hasInteracted && (
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-destructive rounded-full animate-pulse" />
        )}
      </button>

      {/* Chat window */}
      <div
        className={cn(
          "fixed bottom-4 right-4 z-50 w-[360px] max-w-[calc(100vw-2rem)]",
          "bg-background border border-border rounded-2xl shadow-2xl",
          "flex flex-col overflow-hidden transition-all duration-300",
          isOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none",
          "max-h-[500px] md:max-h-[600px]"
        )}
        role="dialog"
        aria-label="Chat with Pawsy"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-lg">🐕</span>
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Pawsy</h3>
              <p className="text-xs text-muted-foreground">Shopping Assistant</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsOpen(false)}
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          <div className="space-y-4">
            {displayMessages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex",
                  message.role === 'user' ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                    message.role === 'user'
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-muted text-foreground rounded-bl-md"
                  )}
                >
                  {message.content || (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Thinking...
                    </span>
                  )}
                </div>
              </div>
            ))}
            {isLoading && messages[messages.length - 1]?.role === 'user' && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-2.5 text-sm">
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Thinking...
                  </span>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Quick actions */}
        {messages.length === 0 && (
          <div className="px-4 pb-2">
            <div className="flex flex-wrap gap-2">
              {[
                "Help me choose a product",
                "Shipping info",
                "Track my order",
              ].map((action) => (
                <button
                  key={action}
                  onClick={() => {
                    setInputValue(action);
                    sendMessage(action);
                  }}
                  className="text-xs px-3 py-1.5 rounded-full bg-muted hover:bg-muted/80 text-muted-foreground transition-colors"
                >
                  {action}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <form onSubmit={handleSubmit} className="p-4 border-t border-border">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Type your message..."
              disabled={isLoading}
              className="flex-1 rounded-full"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!inputValue.trim() || isLoading}
              className="rounded-full shrink-0"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            AI assistant • For urgent issues, email support@getpawsy.pet
          </p>
        </form>
      </div>
    </>
  );
}
