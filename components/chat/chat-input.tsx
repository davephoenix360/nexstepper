'use client';

import { useRef, useState } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface ChatInputProps {
  onSend: (message: string) => void;
  isStreaming: boolean;
  disabled?: boolean;
  rateLimit?: { limit: number; used: number } | null;
}

export function ChatInput({ onSend, isStreaming, disabled, rateLimit }: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || isStreaming || disabled) return;
    onSend(trimmed);
    setValue('');
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  const remaining = rateLimit ? rateLimit.limit - rateLimit.used : null;
  const atLimit = remaining !== null && remaining <= 0;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      {/* Rate limit indicator */}
      {rateLimit && remaining !== null && (
        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
          <span>
            {atLimit ? (
              <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <span>⚠</span> Daily limit reached
              </span>
            ) : (
              <span>
                {remaining} / {rateLimit.limit} messages remaining today
              </span>
            )}
          </span>
        </div>
      )}

      <div className="flex items-end gap-2">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask to edit your resume, switch templates, or get suggestions…"
          rows={1}
          disabled={isStreaming || disabled || atLimit}
          className="resize-none min-h-[40px] max-h-[120px] py-2 flex-1"
          style={{ height: 'auto' as unknown as number }}
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = 'auto';
            el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
          }}
        />
        <Button
          type="submit"
          size="icon"
          disabled={!value.trim() || isStreaming || disabled || atLimit}
          className="shrink-0 h-10 w-10"
          aria-label="Send message"
        >
          {isStreaming ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground px-1">
        Press Enter to send · Shift+Enter for new line
      </p>
    </form>
  );
}
