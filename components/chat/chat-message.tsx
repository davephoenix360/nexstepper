import { memo } from 'react';
import { CheckCircle, Loader2, Bot, User, AlertTriangle, Wand2 } from 'lucide-react';
import type { ChatMessageRow } from './use-chat-stream';

interface ChatMessageProps {
  message: ChatMessageRow;
  isLoading?: boolean;
}

function ToolCallBadge({ name, args }: { name: string; args: unknown }) {
  const summary = (() => {
    const a = args as Record<string, unknown>;
    if (name === 'editResume') {
      const partial = a as { summary?: string; sections?: unknown };
      return partial.summary
        ? `Edited: ${partial.summary}`
        : 'Applied resume changes';
    }
    if (name === 'switchTemplate') {
      const a2 = a as { templateId?: string };
      return `Switched to template: ${a2.templateId ?? 'unknown'}`;
    }
    return `Called ${name}`;
  })();

  return (
    <div className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground">
      <Wand2 className="h-3 w-3 shrink-0" />
      <span className="italic">{summary}</span>
    </div>
  );
}

function ChatMessageComponent({ message, isLoading }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div
        className={`shrink-0 mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-xs
          ${isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
      >
        {isLoading && !isUser ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : isUser ? (
          <User className="h-3.5 w-3.5" />
        ) : (
          <Bot className="h-3.5 w-3.5" />
        )}
      </div>

      {/* Bubble */}
      <div
        className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm leading-relaxed
          ${isUser
            ? 'bg-primary text-primary-foreground rounded-tr-sm'
            : 'bg-muted rounded-tl-sm'
          }`}
      >
        {isLoading && !isUser ? (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Thinking…
          </span>
        ) : (
          <p className="whitespace-pre-wrap break-words">{message.content || <em className="text-muted-foreground">…</em>}</p>
        )}

        {/* Tool calls display */}
        {!isUser && Array.isArray(message.toolCalls) && message.toolCalls.length > 0 ? (
          <div className="mt-2 pt-2 border-t border-border/50">
            {(message.toolCalls as Array<{ name: string; args: unknown }>).map((tc, i) => (
              <ToolCallBadge key={i} name={tc.name} args={tc.args} />
            ))}
          </div>
        ) : null}

        {/* Tool result feedback */}
        {!isUser && message.toolResult ? (
          <div className="mt-1.5 flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle className="h-3 w-3 shrink-0" />
            <span>Changes applied</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export const ChatMessage = memo(ChatMessageComponent);
