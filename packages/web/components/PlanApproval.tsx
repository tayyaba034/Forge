'use client';

export type PlanStepState = 'pending' | 'active' | 'done';

export default function PlanApproval({
  prompt,
  steps,
  states,
  onApprove,
  onReject,
  disabled = false,
}: {
  prompt: string;
  steps: string[];
  states: PlanStepState[];
  onApprove: () => void;
  onReject: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="my-2 max-w-2xl rounded-lg border border-[#00E5FF]/40 bg-[#111113] p-4 shadow-[0_0_15px_rgba(0,229,255,0.1)]">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#00E5FF]">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        Action Plan Proposed
      </div>

      <div className="mb-3 rounded border border-zinc-800 bg-black/40 p-3 text-sm text-zinc-300">
        Request: {prompt}
      </div>

      <div className="mb-4 grid gap-2">
        {steps.map((step, index) => (
          <div
            key={`${step}-${index}`}
            className={`flex items-center gap-3 rounded-lg border p-3 transition-all duration-300 ${
              states[index] === 'done'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
                : states[index] === 'active'
                  ? 'border-[#00E5FF]/60 bg-[#00E5FF]/10 text-zinc-100 shadow-[0_0_12px_rgba(0,229,255,0.14)]'
                  : 'border-zinc-800 bg-black/30 text-zinc-400'
            }`}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] transition-all ${
                states[index] === 'done'
                  ? 'scale-110 border-emerald-400 bg-emerald-400 text-black'
                  : states[index] === 'active'
                    ? 'border-[#00E5FF] text-[#00E5FF]'
                    : 'border-zinc-700 text-zinc-500'
              }`}
            >
              {states[index] === 'done' ? (
                <svg className="h-3.5 w-3.5 animate-[ping_0.35s_ease-out_1]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              ) : states[index] === 'active' ? (
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#00E5FF]" />
              ) : (
                index + 1
              )}
            </span>
            <span className="text-sm leading-snug">{step}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          onClick={onApprove}
          disabled={disabled}
          className="rounded bg-[#00E5FF] px-4 py-1.5 text-sm font-semibold text-black transition-colors hover:bg-[#00cce6] disabled:bg-zinc-700 disabled:text-zinc-400"
        >
          Approve & Execute
        </button>
        <button
          onClick={onReject}
          disabled={disabled}
          className="rounded bg-zinc-800 px-4 py-1.5 text-sm font-semibold text-zinc-300 transition-colors hover:bg-zinc-700 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
