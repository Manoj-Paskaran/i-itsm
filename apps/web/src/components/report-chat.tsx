import type { ServiceSummary } from '@itsm/contracts';
import { Bot, Check, SendHorizontal } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ReportContext, ReportPriorityPreview } from '@/components/report-context';
import { formatPeopleAffected, quickRepliesFor, type IntakeState } from '@/lib/chat-intake';
import { LEVEL_LABEL } from '@/lib/incidents';
import { IMPACT_OPTIONS, URGENCY_OPTIONS, type ReportForm } from '@/lib/report';
import { useReveal } from '@/lib/reveal';

const unanswered = <span className="text-muted-foreground">Not yet</span>;
const botAvatar = (
  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-foreground text-background">
    <Bot size={15} aria-hidden />
  </span>
);
const botBubble = 'rounded-lg rounded-bl-sm bg-muted px-3 py-2';

function TypingIndicator() {
  return (
    <div className="flex gap-2">
      {botAvatar}
      <div
        role="status"
        aria-label="IT assistant is typing"
        className={`${botBubble} flex items-center gap-1`}
      >
        {[-300, -150, 0].map((delay) => (
          <span
            aria-hidden="true"
            key={delay}
            style={{ animationDelay: `${delay}ms` }}
            className="size-1.5 rounded-full bg-muted-foreground motion-safe:animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}

export function additionalProblemDetails(title: string, description: string) {
  const trimSentence = (text: string) =>
    text
      .trim()
      .replace(/[.!?]+$/, '')
      .trimEnd();
  const cleanTitle = trimSentence(title);
  const details = description.trim();
  if (trimSentence(details) === cleanTitle) return '';
  if (cleanTitle && details.startsWith(cleanTitle)) {
    const afterTitle = details.slice(cleanTitle.length);
    const sentenceEnd = /^\s*[.!?]+(?:\s+|$)/.exec(afterTitle);
    if (sentenceEnd) return afterTitle.slice(sentenceEnd[0].length);
  }
  return details;
}

function ReviewLevel({
  level,
  options,
}: {
  level: number | null;
  options: readonly { value: number; label: string }[];
}) {
  if (!level) return unanswered;
  const answer = options.find((option) => option.value === level)?.label;
  return (
    <>
      <span className="font-medium">{LEVEL_LABEL[level]}</span>
      {answer && <span className="text-muted-foreground"> · {answer}</span>}
    </>
  );
}

/** INV-3 view: renders the IntakeState conversation and hands the filled form back to /report. */
export function ReportChat({
  state,
  form,
  onReply,
  pendingReply,
  reducedMotion,
  services,
  onSubmit,
  onEditInForm,
  pending,
  error,
  submitDisabled,
  advisory,
}: {
  /** Kept by /report so switching to the form and back keeps the conversation. */
  state: IntakeState;
  form: ReportForm;
  onReply: (value: string, shown: string) => void;
  pendingReply: string | null;
  reducedMotion: boolean;
  services: readonly ServiceSummary[];
  onSubmit: () => void;
  onEditInForm: () => void;
  pending: boolean;
  error: React.ReactNode;
  submitDisabled: boolean;
  advisory: { content: React.ReactNode; hasMatches: boolean };
}) {
  const [text, setText] = useState('');
  const [isScrolled, setIsScrolled] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const [initialCount] = useState(() => state.messages.length);
  const latest = state.messages.at(-1);
  const reveal = useReveal(latest, !reducedMotion && state.messages.length > initialCount);
  const busy = pendingReply !== null || !reveal.done;
  const isReview = state.step === 'review' && !busy;
  const messages =
    pendingReply === null
      ? state.messages
      : [...state.messages, { from: 'user' as const, text: pendingReply }];
  const { content: advisoryContent, hasMatches } = advisory;
  useLayoutEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages.length, pendingReply, reveal.text, isReview]);
  // On narrow screens, keep review in view when matching incidents add height below the log.
  useEffect(() => {
    if (isReview && !window.matchMedia('(min-width: 64rem)').matches) {
      reviewHeading.current?.scrollIntoView({
        block: 'start',
        behavior: reducedMotion ? 'instant' : 'smooth',
      });
    }
  }, [isReview, hasMatches, reducedMotion]);
  function send(value: string, shown = value) {
    if (busy || !value.trim()) return;
    onReply(value, shown);
    setText('');
  }
  const service = services.find((s) => s.id === form.serviceId);
  const replies = quickRepliesFor({ ...state, form }, services);
  const details = additionalProblemDetails(form.title, form.description);
  // Before review, only a count the first-message reading supplied is an answer (the empty
  // form's default of one person is not).
  const people = isReview || state.suggestions ? Number(form.affectedUsers) : 0;
  return (
    <>
      <div
        className={`flex min-w-0 max-w-[680px] flex-col rounded-lg border border-border lg:h-[calc(100dvh-220px)] lg:min-h-[420px] ${isReview ? 'max-lg:rounded-b-none' : ''}`}
      >
        <div
          ref={log}
          role="log"
          aria-label="Report conversation"
          aria-live="polite"
          aria-relevant="additions"
          tabIndex={0}
          onScroll={(event) => setIsScrolled(event.currentTarget.scrollTop > 0)}
          className={`overflow-y-auto p-4 lg:min-h-0 lg:flex-1 lg:overscroll-y-contain ${isReview ? 'max-lg:max-h-60' : 'max-lg:max-h-[420px]'} ${isScrolled ? '[mask-image:linear-gradient(to_bottom,transparent,black_16px)]' : ''}`}
        >
          <div
            className={`flex min-h-full flex-col justify-end gap-3 ${isReview ? '' : 'max-lg:min-h-[248px]'}`}
          >
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-2 ${m.from === 'user' ? 'justify-end' : ''}`}>
                {m.from === 'bot' ? (
                  <>
                    {botAvatar}
                    <div className="min-w-0 max-w-[85%]">
                      <p className={`${botBubble} text-sm whitespace-pre-wrap break-words`}>
                        <span className="sr-only">IT assistant: {m.text}</span>
                        <span aria-hidden="true">{m === latest ? reveal.text : m.text}</span>
                      </p>
                      {(m.source === 'gemini' || m.source === 'cache') && (
                        <p
                          className="mt-1 px-3 text-xs text-muted-foreground"
                          title={
                            m.source === 'gemini'
                              ? 'Written by Gemini from your message'
                              : 'Replayed from the AI response cache'
                          }
                        >
                          AI-assisted
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="min-w-0 max-w-[85%] rounded-lg rounded-br-sm bg-fill-done px-3 py-2 text-sm whitespace-pre-wrap break-words text-fill-foreground">
                    <span className="sr-only">You: </span>
                    {m.text}
                  </p>
                )}
              </div>
            ))}
            {pendingReply !== null && <TypingIndicator />}
          </div>
        </div>
        {isReview ? (
          <p className="flex shrink-0 items-center gap-2 border-t border-border px-4 py-3 text-sm">
            <Check size={16} className="shrink-0 text-success-foreground" aria-hidden />
            <span className="hidden lg:inline">
              Draft ready. Review it on the right, then send it.
            </span>
            <span className="lg:hidden">Draft ready. Review it below, then send it.</span>
          </p>
        ) : (
          <div className="shrink-0 space-y-2 border-t border-border p-3">
            {reveal.done && !!replies.length && (
              <div className="flex flex-wrap gap-1.5">
                {replies.map((r) => (
                  <button
                    key={r.value}
                    disabled={busy}
                    onClick={() => send(r.value, r.label)}
                    className={`inline-flex min-h-10 max-w-full items-center rounded-md border px-3 py-2 text-left text-sm enabled:hover:bg-hover disabled:opacity-50 ${r.suggested ? 'border-border-strong font-semibold' : 'border-border font-medium'}`}
                  >
                    <span className="min-w-0 break-words">{r.label}</span>
                  </button>
                ))}
              </div>
            )}
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                send(text);
              }}
            >
              <input
                value={text}
                disabled={busy}
                onChange={(e) => setText(e.target.value)}
                aria-label="Your reply"
                placeholder={
                  state.step === 'problem' ? 'e.g. Payments fail at checkout' : 'Type your answer…'
                }
                className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-base placeholder:text-muted-foreground"
              />
              <button
                aria-label="Send reply"
                disabled={busy || !text.trim()}
                className="grid size-10 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground enabled:hover:bg-primary-hover disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
              >
                <SendHorizontal size={16} aria-hidden />
              </button>
            </form>
          </div>
        )}
      </div>
      <ReportContext
        reviewHeadingRef={isReview ? reviewHeading : undefined}
        footer={
          <>
            {error}
            {isReview ? (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={onSubmit}
                  disabled={pending || submitDisabled}
                  className="inline-flex min-h-10 items-center justify-center rounded-md bg-primary px-4 text-base font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50 max-sm:w-full"
                >
                  {pending ? 'Sending…' : 'Send report'}
                </button>
                <button
                  onClick={onEditInForm}
                  disabled={pending}
                  className="inline-flex min-h-10 items-center justify-center rounded-md border border-border bg-background px-4 text-base hover:bg-hover disabled:opacity-50 max-sm:w-full"
                >
                  Edit in the form
                </button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Answer the questions to finish your draft.
              </p>
            )}
          </>
        }
      >
        <dl className="space-y-2 text-sm">
          {(
            [
              [
                'Problem',
                <>
                  {form.title.trim() ? <p className="font-medium">{form.title}</p> : unanswered}
                  {details && <p className="mt-1 text-muted-foreground">{details}</p>}
                </>,
              ],
              ['Service', service?.name ?? unanswered],
              ['Impact', <ReviewLevel level={form.impact} options={IMPACT_OPTIONS} />],
              ['Urgency', <ReviewLevel level={form.urgency} options={URGENCY_OPTIONS} />],
              [
                'People affected',
                people ? (
                  <span className="tabular">{formatPeopleAffected(people)}</span>
                ) : (
                  unanswered
                ),
              ],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="grid grid-cols-[112px_minmax(0,1fr)] gap-2">
              <dt className="text-xs leading-5 text-muted-foreground">{label}</dt>
              <dd className="min-w-0 text-pretty whitespace-pre-wrap break-words">{value}</dd>
            </div>
          ))}
        </dl>
        {advisoryContent}
        {isReview && <ReportPriorityPreview form={form} service={service} mode="chat" />}
      </ReportContext>
    </>
  );
}
