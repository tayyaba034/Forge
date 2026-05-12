'use client';

type StatusBarProps = {
  connected: boolean;
  relayUrl: string;
  activeModel?: string;
  lastTool?: string | null;
};

export default function StatusBar({
  connected,
  relayUrl,
  activeModel = 'gemini-2.0-flash',
  lastTool,
}: StatusBarProps) {
  return (
    <footer className="h-8 border-t border-zinc-800 bg-black/70 px-4 text-[11px] text-zinc-500 flex items-center gap-4 shrink-0">
      <span className="flex items-center gap-1.5">
        <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-500'}`} />
        Unity bridge: {connected ? 'connected' : 'disconnected'}
      </span>
      <span className="truncate">Relay: {relayUrl}</span>
      <span>Model: {activeModel}</span>
      <span className="ml-auto truncate">Last tool: {lastTool ?? 'none'}</span>
    </footer>
  );
}
