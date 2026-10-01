import { memo } from 'react';
import Markdown from 'react-markdown';
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

/**
 * Assistant reply body.
 *
 * The model writes Markdown, and users read it as Markdown — it keeps coming
 * back with `**bold**` for skill names and `*italic*` for emphasis. Printing
 * that raw inside a `whitespace-pre-wrap <p>` showed literal asterisks, which
 * reads as broken output rather than formatting.
 *
 * The component list is deliberately small and explicit rather than using
 * Tailwind's typography plugin: the chat bubble has its own compact scale, and
 * a prose reset would blow the padding and margins out of a 34rem sidebar
 * panel. Anything not listed falls back to a `<span>`, so an unexpected tag
 * can never inject unstyled block layout into the bubble.
 */
function AssistantContent({ content }: { content: string }) {
  if (!content) return <em className="text-muted-foreground">…</em>;

  return (
    <div className="max-w-full break-words">
      <Markdown
        components={{
          p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => (
            <ul className="mb-1.5 ml-4 list-disc last:mb-0">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-1.5 ml-4 list-decimal last:mb-0">{children}</ol>
          ),
          li: ({ children }) => <li className="mb-0.5">{children}</li>,
          // Headings inside a chat bubble would be visually absurd, so cap
          // them at bold text rather than letting an `h1` blow out the panel.
          h1: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          h2: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          h3: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          code: ({ children }) => (
            <code className="rounded bg-background/60 px-1 py-0.5 font-mono text-[0.85em]">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="mb-1.5 overflow-x-auto rounded bg-background/60 p-2 text-xs">
              {children}
            </pre>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="mb-1.5 border-l-2 border-border pl-2 italic">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-2 border-border" />
        }}
      >
        {content}
      </Markdown>
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
        ) : isUser ? (
          // User text stays plain — it is literal input, and rendering it as
          // markdown would mangle anything that looks like markup.
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : (
          <AssistantContent content={message.content} />
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
