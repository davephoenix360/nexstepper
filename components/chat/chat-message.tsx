import { memo } from 'react';
import { CheckCircle, Loader2, Bot, User, AlertTriangle, Wand2 } from 'lucide-react';
import type { ChatMessageRow } from './use-chat-stream';

interface ChatMessageProps {
  message: ChatMessageRow;
  isLoading?: boolean;
}

function ToolCallBadge({ name, args }: { name: string; args: unknown }) {
  const summary = (() => {
    const a = (args ?? {}) as Record<string, unknown>;

    if (name === 'editResume') {
      // `setBasics.summary` carries the whole replacement summary, which is
      // far too long to render in a badge. The old code read a top-level
      // `summary` key that the new surgical schema doesn't have, so this
      // always fell through to the generic string. Summarise the operations
      // that actually ran instead.
      const changes: string[] = [];
      const setBasics = a.setBasics as Record<string, unknown> | undefined;
      if (setBasics?.summary) changes.push('summary');
      if (setBasics?.headline) changes.push('headline');
      if (setBasics?.email) changes.push('email');
      if (setBasics?.phone) changes.push('phone');
      if (setBasics?.name) changes.push('name');
      if (setBasics?.location) changes.push('location');
      if (setBasics?.linkedin) changes.push('LinkedIn');
      if (setBasics?.github) changes.push('GitHub');
      if (setBasics?.website) changes.push('website');

      const count = (key: string, verb: string) => {
        const arr = a[key];
        if (Array.isArray(arr) && arr.length > 0) changes.push(`${verb} ${arr.length}`);
      };
      count('addWork', 'job');
      count('updateWork', 'updated');
      count('removeWork', 'removed job');
      count('addEducation', 'education');
      count('removeEducation', 'removed education');
      count('addSkills', 'skill');
      count('removeSkills', 'removed skill');
      count('addProject', 'project');
      count('updateProject', 'updated project');
      count('removeProject', 'removed project');
      count('addCertificates', 'certificate');
      count('addLanguages', 'language');
      count('addInterests', 'interest');
      count('addAwards', 'award');
      if (Array.isArray(a.clearSection) && a.clearSection.length > 0) {
        changes.push(`cleared ${a.clearSection.join(', ')}`);
      }

      return changes.length > 0
        ? `Updated: ${changes.join(', ')}`
        : 'Applied resume changes';
    }

    if (name === 'switchTemplate') {
      return `Switched to template: ${(a.templateId as string) ?? 'unknown'}`;
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
        {!isUser && message.toolResult ? (() => {
          // `toolResult` is now a persisted `Array<{ id, result }>` (one per
          // tool call in a possibly multi-step turn). Only claim success if
          // at least one result actually reported `ok: true` — previously
          // this rendered on the mere presence of the field, so a failed
          // edit still showed a green "Changes applied".
          const results = Array.isArray(message.toolResult)
            ? (message.toolResult as Array<{ result?: unknown }>)
            : [];
          const anyOk = results.some((r) => {
            const inner = r?.result as { ok?: boolean } | undefined;
            return inner?.ok === true;
          });
          if (!anyOk) return null;
          return (
            <div className="mt-1.5 flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle className="h-3 w-3 shrink-0" />
              <span>Changes applied</span>
            </div>
          );
        })() : null}
      </div>
    </div>
  );
}

export const ChatMessage = memo(ChatMessageComponent);
