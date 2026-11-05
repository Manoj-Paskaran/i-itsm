import type { ServiceSummary } from '@itsm/contracts';
import { Bot, SendHorizontal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { priorityPreview, quickRepliesFor, replyTo, type IntakeState } from '@/lib/chat-intake';
import { LEVEL_LABEL } from '@/lib/incidents';
import type { ReportForm } from '@/lib/report';

/** INV-3 view: renders the IntakeState conversation and hands the filled form back to /report. */
export function ReportChat({
  state,
  onState,
  form,
  onForm,
  services,
  onSubmit,
  onEditInForm,
  pending,
  error,
}: {
  /** Kept by /report so switching to the form and back keeps the conversation. */
  state: IntakeState;
  onState: (state: IntakeState) => void;
  form: ReportForm;
  onForm: (form: ReportForm) => void;
  services: readonly ServiceSummary[];
  onSubmit: () => void;
  onEditInForm: () => void;
  pending: boolean;
  error: string | null;
}) {
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [state.messages.length]);
  function send(value: string, shown = value) {
    // The parent form wins: answers edited in the form are kept if the chat continues.
    const next = replyTo({ ...state, form }, value, services, shown);
    onState(next);
    onForm(next.form);
    setText('');
  }
  const service = services.find((s) => s.id === form.serviceId);
  const replies = quickRepliesFor({ ...state, form }, services);
  return (
    <div className="rounded-lg border border-border">
      <ol aria-live="polite" className="max-h-[420px] space-y-3 overflow-y-auto p-4">
        {state.messages.map((m, i) => (
          <li key={i} className={`flex gap-2 ${m.from === 'user' ? 'justify-end' : ''}`}>
            {m.from === 'bot' && (
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary-subtle text-primary">
                <Bot size={15} aria-hidden />
              </span>
            )}
            <p
              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${m.from === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
            >
              {m.text}
            </p>
          </li>
        ))}
        <div ref={end} />
      </ol>
      {state.step === 'review' ? (
        <div className="space-y-4 border-t border-border p-4">
          <dl className="grid grid-cols-[120px_1fr] gap-y-1.5 text-sm">
            {[
              ['Problem', form.title],
              ['Details', form.description],
              ['Service', service?.name ?? '—'],
              ['Impact', form.impact ? LEVEL_LABEL[form.impact] : '—'],
              ['Urgency', form.urgency ? LEVEL_LABEL[form.urgency] : '—'],
              ['People affected', Number(form.affectedUsers).toLocaleString('en-IN')],
            ].map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <p className="rounded-md bg-panel p-3 text-sm text-muted-foreground">
            {priorityPreview(form, service)}
          </p>
          {error && (
            <p role="alert" className="text-sm text-critical-foreground">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={onSubmit}
              disabled={pending}
              className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-base font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
            >
              {pending ? 'Sending…' : 'Send report'}
            </button>
            <button
              onClick={onEditInForm}
              className="inline-flex h-10 items-center rounded-md border border-border px-4 text-base hover:bg-hover"
            >
              Edit in the form
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2 border-t border-border p-3">
          {!!replies.length && (
            <div className="flex flex-wrap gap-1.5">
              {replies.map((r) => (
                <button
                  key={r.value}
                  onClick={() => send(r.value, r.label)}
                  className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-hover"
                >
                  {r.label}
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
              onChange={(e) => setText(e.target.value)}
              aria-label="Your reply"
              placeholder="Type your answer…"
              className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-base"
            />
            <button
              aria-label="Send reply"
              disabled={!text.trim()}
              className="grid size-10 place-items-center rounded-md bg-primary text-primary-foreground disabled:opacity-50"
            >
              <SendHorizontal size={16} aria-hidden />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
