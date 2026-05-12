'use client';

import { useState } from 'react';
import ChatPanel from '@/components/ChatPanel';
import SceneTree, { type SceneState } from '@/components/SceneTree';
import StatusBar from '@/components/StatusBar';

export default function Home() {
  const [relayUrl, setRelayUrl] = useState('http://localhost:9902');
  const [connected, setConnected] = useState(false);
  const [sceneState, setSceneState] = useState<SceneState | null>(null);
  const [lastTool, setLastTool] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const connectToRelay = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnectionError(null);
    try {
      const res = await fetch(`${relayUrl}/status`);
      if (res.ok) {
        setConnected(true);
      } else {
        setConnectionError('Relay responded, but not with a healthy status.');
      }
    } catch {
      setConnectionError('Could not reach the relay. Start packages/relay and check the URL.');
    }
  };

  if (!connected) {
    return (
      <main className="min-h-screen bg-[#0d0d0f] flex items-center justify-center font-sans text-white">
        <div className="w-[420px] space-y-6">
          <div className="text-center">
            <h1 className="text-4xl font-mono font-bold text-[#00E5FF]">⬡ FORGE</h1>
            <p className="text-zinc-400 mt-2">The Cursor moment for Unity</p>
          </div>
          <form onSubmit={connectToRelay} className="flex flex-col gap-4 bg-zinc-900 p-6 rounded-lg border border-zinc-800 shadow-2xl">
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Relay Server URL</label>
              <input
                type="text"
                value={relayUrl}
                onChange={(e) => setRelayUrl(e.target.value)}
                className="w-full bg-black border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-[#00E5FF] transition-colors"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-[#00E5FF] hover:bg-[#00cce6] text-black font-semibold rounded py-2 transition-colors"
            >
              Connect to Unity
            </button>
            {connectionError && (
              <div className="border border-red-500/40 bg-red-950/30 text-red-200 text-sm rounded px-3 py-2">
                {connectionError}
              </div>
            )}
          </form>
          <p className="text-xs text-zinc-600 text-center">
            Start the relay: <code className="text-zinc-400 bg-zinc-900 px-1 py-0.5 rounded">cd packages/relay && npm run dev</code>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="h-screen bg-[#0d0d0f] text-white flex flex-col font-sans overflow-hidden">
      <header className="h-14 border-b border-zinc-800 flex items-center px-6 shrink-0 bg-black/50">
        <h1 className="text-xl font-mono font-bold text-[#00E5FF] flex items-center gap-2">
          ⬡ FORGE
        </h1>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="flex items-center gap-1.5 text-zinc-400">
            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
            Connected to Unity
          </span>
        </div>
      </header>
      
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar: Scene Tree */}
        <aside className="w-64 border-r border-zinc-800 bg-[#0a0a0c] overflow-y-auto flex flex-col">
          <div className="p-3 border-b border-zinc-800 sticky top-0 bg-[#0a0a0c] z-10 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            Scene Hierarchy
          </div>
          <div className="p-2 flex-1">
            <SceneTree sceneState={sceneState} />
          </div>
        </aside>

        {/* Main content: Chat Panel */}
        <section className="flex-1 flex flex-col bg-[#0d0d0f] relative shadow-[inset_20px_0_40px_rgba(0,0,0,0.3)]">
          <ChatPanel
            relayUrl={relayUrl}
            onSceneStateUpdate={setSceneState}
            onToolActivity={setLastTool}
          />
          <StatusBar connected={connected} relayUrl={relayUrl} lastTool={lastTool} />
        </section>
      </div>
    </main>
  );
}
