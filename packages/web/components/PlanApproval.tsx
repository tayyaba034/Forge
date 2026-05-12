'use client';

export default function PlanApproval({
  plan,
  onApprove,
  onReject,
  disabled = false,
}: {
  plan: string;
  onApprove: () => void;
  onReject: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="bg-[#111113] border border-[#00E5FF]/40 rounded-lg p-4 my-2 shadow-[0_0_15px_rgba(0,229,255,0.1)]">
      <div className="flex items-center gap-2 text-[#00E5FF] font-semibold mb-2 text-sm">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
        Action Plan Proposed
      </div>
      <div className="text-zinc-300 text-sm whitespace-pre-wrap mb-4 bg-black/50 p-3 rounded border border-zinc-800">
        {plan}
      </div>
      <div className="flex gap-3">
        <button
          onClick={onApprove}
          disabled={disabled}
          className="bg-[#00E5FF] text-black px-4 py-1.5 rounded text-sm font-semibold hover:bg-[#00cce6] transition-colors disabled:bg-zinc-700 disabled:text-zinc-400"
        >
          Approve & Execute
        </button>
        <button
          onClick={onReject}
          disabled={disabled}
          className="bg-zinc-800 text-zinc-300 px-4 py-1.5 rounded text-sm font-semibold hover:bg-zinc-700 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
