'use client';

type StatusBarProps = {
  connected: boolean;
  relayUrl: string;
  activeModel?: string;
  lastTool?: string | null;
  statusMessage?: string;
  tokenTotal?: number;
};

export default function StatusBar({
  connected,
  relayUrl,
  activeModel = 'gemini-2.0-flash',
  lastTool,
  statusMessage = 'Idle',
  tokenTotal = 0,
}: StatusBarProps) {
  return (
    <footer className="flex h-8 shrink-0 items-center gap-4 border-t border-zinc-800 bg-black/70 px-4 text-[11px] text-zinc-500">
      <span className="flex items-center gap-1.5">
        <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-500'}`} />
        Unity bridge: {connected ? 'connected' : 'disconnected'}
      </span>
      <span className="truncate">Relay: {relayUrl}</span>
      <span>Model: {activeModel}</span>
      <span>Tokens: {tokenTotal.toLocaleString()}</span>
      <span className="truncate text-[#00E5FF]">{statusMessage}</span>
      <span className="ml-auto truncate">Last tool: {lastTool ?? 'none'}</span>
    </footer>
  );
}
