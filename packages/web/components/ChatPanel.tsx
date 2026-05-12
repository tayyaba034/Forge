'use client';

import { useState, useRef, useEffect } from 'react';
import DiffViewer from './DiffViewer';
import PlanApproval from './PlanApproval';
import type { SceneState } from './SceneTree';

type Message = {
  role: 'user' | 'assistant';
  content: string;
  type?: 'text' | 'tool_call' | 'tool_result' | 'plan' | 'error';
};

type ChatPanelProps = {
  relayUrl: string;
  onSceneStateUpdate: (state: SceneState) => void;
  onToolActivity?: (tool: string) => void;
};

type ForgeStreamEvent =
  | { event: 'text'; data: string }
  | { event: 'plan'; data: { prompt: string; steps: string[] } }
  | { event: 'tool_call'; data: { name: string; input: Record<string, unknown> } }
  | { event: 'tool_result'; data: { name: string; result?: unknown; error?: string } }
  | { event: 'error'; data: string }
  | { event: 'done'; data: unknown };

type ToolCallData = {
  name: string;
  input: {
    code?: string;
    diff?: string;
    fileName?: string;
    filePath?: string;
    [key: string]: unknown;
  };
};

export default function ChatPanel({ relayUrl, onSceneStateUpdate, onToolActivity }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingExecution, setPendingExecution] = useState<Message[] | null>(null);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const runAgent = async (agentMessages: Message[], approved: boolean) => {
    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: agentMessages, relayUrl, approved })
      });

      if (!res.body) throw new Error('No response body');
      
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      
      let currentAssistantMessage = '';
      let pendingChunk = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        pendingChunk += decoder.decode(value, { stream: true });
        const lines = pendingChunk.split('\n\n');
        pendingChunk = lines.pop() ?? '';
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const { event, data } = JSON.parse(line.slice(6)) as ForgeStreamEvent;
              
              if (event === 'text') {
                currentAssistantMessage += data;
                setMessages(prev => {
                  const last = prev[prev.length - 1];
                  if (last && last.role === 'assistant' && last.type === 'text') {
                    const newArr = [...prev];
                    newArr[newArr.length - 1] = { ...last, content: currentAssistantMessage };
                    return newArr;
                  } else {
                    return [...prev, { role: 'assistant', content: currentAssistantMessage, type: 'text' }];
                  }
                });
              } else if (event === 'plan') {
                setPendingExecution(agentMessages);
                setMessages(prev => [...prev, { role: 'assistant', type: 'plan', content: JSON.stringify(data) }]);
              } else if (event === 'tool_call') {
                onToolActivity?.(data.name);
                setMessages(prev => [...prev, { role: 'assistant', type: 'tool_call', content: JSON.stringify(data) }]);
              } else if (event === 'tool_result') {
                onToolActivity?.(data.name);
                if (data.name === 'get_scene_state' && data.result) {
                  onSceneStateUpdate(data.result as SceneState);
                }
                setMessages(prev => [...prev, { role: 'assistant', type: 'tool_result', content: JSON.stringify(data) }]);
              } else if (event === 'error') {
                setMessages(prev => [...prev, { role: 'assistant', type: 'error', content: data }]);
              } else if (event === 'done') {
                setIsLoading(false);
              }
            } catch (e) {
              console.error('Error parsing SSE:', e);
            }
          }
        }
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'assistant', content: 'An error occurred.', type: 'text' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg: Message = { role: 'user', content: input, type: 'text' };
    const newMessages = [...messages.filter(m => m.type !== 'plan'), userMsg];
    setMessages(newMessages);
    setInput('');
    setPendingExecution(null);
    setIsLoading(true);
    await runAgent(newMessages, false);
  };

  const approvePendingPlan = async () => {
    if (!pendingExecution || isLoading) return;

    setIsLoading(true);
    setMessages(prev => [
      ...prev,
      { role: 'assistant', type: 'text', content: 'Plan approved. Executing against Unity now.' },
    ]);
    await runAgent(pendingExecution, true);
    setPendingExecution(null);
  };

  const rejectPendingPlan = () => {
    setPendingExecution(null);
    setMessages(prev => [
      ...prev,
      { role: 'assistant', type: 'text', content: 'Plan cancelled. Tell me what you want to adjust.' },
    ]);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-50">
            <svg className="w-12 h-12 mb-4 text-[#00E5FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <p className="text-lg text-zinc-300">What do you want to build?</p>
            <p className="text-sm text-zinc-500 mt-2">Try: &quot;Add a health system to my Player GameObject&quot;</p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <MessageBubble
              key={idx}
              msg={msg}
              onApprove={approvePendingPlan}
              onReject={rejectPendingPlan}
              approvalDisabled={isLoading || !pendingExecution}
            />
          ))
        )}
        <div ref={endOfMessagesRef} />
      </div>

      <div className="p-4 bg-black/40 border-t border-zinc-800 backdrop-blur-sm">
        <form onSubmit={handleSubmit} className="relative max-w-3xl mx-auto">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={isLoading}
            placeholder={isLoading ? "FORGE is thinking..." : "Instruct FORGE..."}
            className="w-full bg-[#161618] border border-zinc-700 text-zinc-100 rounded-lg pl-4 pr-12 py-3 focus:outline-none focus:border-[#00E5FF] transition-all disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="absolute right-2 top-2 bottom-2 aspect-square flex items-center justify-center bg-[#00E5FF] hover:bg-[#00cce6] disabled:bg-zinc-800 text-black disabled:text-zinc-500 rounded transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}

function MessageBubble({
  msg,
  onApprove,
  onReject,
  approvalDisabled,
}: {
  msg: Message;
  onApprove: () => void;
  onReject: () => void;
  approvalDisabled: boolean;
}) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="bg-[#2b2d31] text-zinc-100 px-4 py-2.5 rounded-2xl rounded-tr-sm max-w-[80%] text-sm">
          {msg.content}
        </div>
      </div>
    );
  }

  if (msg.type === 'tool_call') {
    const data = JSON.parse(msg.content) as ToolCallData;
    
    if (data.name === 'create_script' || data.name === 'edit_script') {
      return (
        <div className="flex justify-start">
          <div className="bg-[#0f1b21] border border-[#00E5FF]/30 px-3 py-2 rounded-lg text-xs font-mono max-w-[90%] shadow-[0_0_10px_rgba(0,229,255,0.05)]">
            <div className="flex items-center gap-2 text-[#00E5FF] mb-2">
              <svg className="w-3.5 h-3.5 animate-spin-slow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {data.name === 'create_script' ? 'Creating Script...' : 'Editing Script...'}
            </div>
            <DiffViewer
              oldCode={""}
              newCode={data.input.code ?? data.input.diff ?? ''}
              fileName={data.input.fileName ? `${data.input.fileName}.cs` : data.input.filePath ?? 'script.cs'}
            />
          </div>
        </div>
      );
    }

    return (
      <div className="flex justify-start">
        <div className="bg-[#0f1b21] border border-[#00E5FF]/30 px-3 py-2 rounded-lg text-xs font-mono max-w-[90%] shadow-[0_0_10px_rgba(0,229,255,0.05)]">
          <div className="flex items-center gap-2 text-[#00E5FF] mb-1">
            <svg className="w-3.5 h-3.5 animate-spin-slow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Calling {data.name}...
          </div>
          <pre className="text-zinc-400 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(data.input, null, 2)}</pre>
        </div>
      </div>
    );
  }

  if (msg.type === 'tool_result') {
    const data = JSON.parse(msg.content) as { name: string; result?: unknown; error?: string };
    const hasError = Boolean(data.error);
    return (
      <div className="flex justify-start">
        <div className={`bg-zinc-900/50 border px-3 py-2 rounded-lg text-xs font-mono max-w-[90%] text-zinc-500 ${hasError ? 'border-red-500/40' : 'border-zinc-800'}`}>
          <div className={`${hasError ? 'text-red-300' : 'text-emerald-500'} mb-1 flex items-center gap-1.5`}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {data.name} {hasError ? 'failed' : 'completed'}
          </div>
          {hasError ? (
            <pre className="overflow-x-auto whitespace-pre-wrap text-red-200">{data.error}</pre>
          ) : data.name === 'get_scene_state' ? (
            <div className="italic">Scene state read successfully.</div>
          ) : (
            <pre className="overflow-x-auto whitespace-pre-wrap">{JSON.stringify(data.result, null, 2)}</pre>
          )}
        </div>
      </div>
    );
  }

  if (msg.type === 'plan') {
    const data = JSON.parse(msg.content) as { prompt: string; steps: string[] };
    return (
      <div className="flex justify-start">
        <PlanApproval
          plan={`Request: ${data.prompt}\n\n${data.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}`}
          onApprove={onApprove}
          onReject={onReject}
          disabled={approvalDisabled}
        />
      </div>
    );
  }

  if (msg.type === 'error') {
    return (
      <div className="flex justify-start">
        <div className="border border-red-500/40 bg-red-950/30 px-3 py-2 rounded-lg text-sm text-red-200 max-w-[85%]">
          {msg.content}
        </div>
      </div>
    );
  }

  // Regular text message
  return (
    <div className="flex justify-start">
      <div className="text-zinc-300 max-w-[85%] text-sm leading-relaxed whitespace-pre-wrap">
        {msg.content}
      </div>
    </div>
  );
}
