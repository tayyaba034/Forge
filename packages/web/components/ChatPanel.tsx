'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import DiffViewer from './DiffViewer';
import PlanApproval, { type PlanStepState } from './PlanApproval';
import type { SceneState } from './SceneTree';

type Message = {
  role: 'user' | 'assistant';
  content: string;
  type?: 'text' | 'tool_call' | 'tool_result' | 'plan' | 'error' | 'status';
};

type ChatPanelProps = {
  relayUrl: string;
  onSceneStateUpdate: (state: SceneState) => void;
  onToolActivity?: (tool: string) => void;
  onStatusChange?: (status: string, model?: string) => void;
  onTokenDelta?: (input: number, output: number, total: number) => void;
};

type ForgeStreamEvent =
  | { event: 'text'; data: string }
  | { event: 'plan'; data: { prompt: string; steps: string[] } }
  | { event: 'plan_step'; data: { index: number; state: PlanStepState; label?: string } }
  | { event: 'status'; data: { message: string; model?: string; switchedToLocal?: boolean } }
  | { event: 'tokens'; data: { input: number; output: number; total: number } }
  | { event: 'tool_call'; data: { name: string; input: ToolInput } }
  | { event: 'tool_result'; data: { name: string; result?: unknown; error?: string } }
  | { event: 'error'; data: string }
  | { event: 'done'; data: unknown };

type ToolInput = {
  code?: string;
  diff?: string;
  fileName?: string;
  filePath?: string;
  [key: string]: unknown;
};

type ToolCallData = {
  name: string;
  input: ToolInput;
};

type StoredSession = {
  id: string;
  createdAt: string;
  prompt: string;
  plan?: { prompt: string; steps: string[] };
  messages: Message[];
  events: ForgeStreamEvent[];
};

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

type SpeechRecognitionConstructor = new () => SpeechRecognition;

type SpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionEvent = {
  results: ArrayLike<{ 0: { transcript: string } }>;
};

const HISTORY_KEY = 'forge.sessionHistory.v1';
const PROMPT_CHIPS = ['Add health system', 'Create enemy patrol', 'Fix compile errors', 'Add score UI'];

export default function ChatPanel({
  relayUrl,
  onSceneStateUpdate,
  onToolActivity,
  onStatusChange,
  onTokenDelta,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [pendingExecution, setPendingExecution] = useState<Message[] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<StoredSession[]>(() => {
    if (typeof window === 'undefined') return [];
    const raw = window.localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as StoredSession[]) : [];
  });
  const [currentPlan, setCurrentPlan] = useState<{ prompt: string; steps: string[]; states: PlanStepState[] } | null>(null);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const runEventsRef = useRef<ForgeStreamEvent[]>([]);
  const runPromptRef = useRef('');
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentPlan]);

  const saveSession = (finalMessages: Message[]) => {
    if (!runPromptRef.current || runEventsRef.current.length === 0) return;

    const planEvent = runEventsRef.current.find((item) => item.event === 'plan');
    const session: StoredSession = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      prompt: runPromptRef.current,
      plan: planEvent?.event === 'plan' ? planEvent.data : undefined,
      messages: finalMessages,
      events: runEventsRef.current,
    };

    setHistory((prev) => {
      const next = [session, ...prev].slice(0, 20);
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  };

  const appendMessage = (message: Message) => {
    setMessages((prev) => [...prev, message]);
  };

  const runAgent = async (agentMessages: Message[], approved: boolean) => {
    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: agentMessages, relayUrl, approved }),
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
          if (!line.startsWith('data: ')) continue;

          const parsed = JSON.parse(line.slice(6)) as ForgeStreamEvent;
          runEventsRef.current.push(parsed);
          const { event, data } = parsed;

          if (event === 'text') {
            currentAssistantMessage += data;
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === 'assistant' && last.type === 'text') {
                const next = [...prev];
                next[next.length - 1] = { ...last, content: currentAssistantMessage };
                return next;
              }

              return [...prev, { role: 'assistant', content: currentAssistantMessage, type: 'text' }];
            });
          } else if (event === 'plan') {
            setPendingExecution(agentMessages);
            setCurrentPlan({ ...data, states: data.steps.map(() => 'pending') });
            appendMessage({ role: 'assistant', type: 'plan', content: JSON.stringify(data) });
          } else if (event === 'plan_step') {
            setCurrentPlan((prev) => {
              if (!prev) return prev;
              const states = [...prev.states];
              states[data.index] = data.state;
              return { ...prev, states };
            });
          } else if (event === 'status') {
            onStatusChange?.(data.message, data.model);
            appendMessage({ role: 'assistant', type: 'status', content: data.message });
          } else if (event === 'tokens') {
            onTokenDelta?.(data.input, data.output, data.total);
          } else if (event === 'tool_call') {
            onToolActivity?.(data.name);
            appendMessage({ role: 'assistant', type: 'tool_call', content: JSON.stringify(data) });
          } else if (event === 'tool_result') {
            onToolActivity?.(data.name);
            if (data.name === 'get_scene_state' && data.result) onSceneStateUpdate(data.result as SceneState);
            appendMessage({ role: 'assistant', type: 'tool_result', content: JSON.stringify(data) });
          } else if (event === 'error') {
            appendMessage({ role: 'assistant', type: 'error', content: data });
          } else if (event === 'done') {
            setIsLoading(false);
            setMessages((prev) => {
              if (approved) saveSession(prev);
              return prev;
            });
          }
        }
      }
    } catch (err) {
      console.error(err);
      appendMessage({ role: 'assistant', content: 'An error occurred.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg: Message = { role: 'user', content: input, type: 'text' };
    const newMessages = [...messages.filter((message) => message.type !== 'plan'), userMsg];
    runPromptRef.current = input;
    runEventsRef.current = [];
    setMessages(newMessages);
    setInput('');
    setPendingExecution(null);
    setCurrentPlan(null);
    setIsLoading(true);
    await runAgent(newMessages, false);
  };

  const approvePendingPlan = async () => {
    if (!pendingExecution || isLoading) return;

    runEventsRef.current = [];
    setIsLoading(true);
    appendMessage({ role: 'assistant', type: 'text', content: 'Plan approved. Executing against Unity now.' });
    await runAgent(pendingExecution, true);
    setPendingExecution(null);
  };

  const rejectPendingPlan = () => {
    setPendingExecution(null);
    appendMessage({ role: 'assistant', type: 'text', content: 'Plan cancelled. Tell me what you want to adjust.' });
  };

  const startVoiceInput = () => {
    const SpeechRecognitionImpl = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognitionImpl || isLoading) return;

    const recognition = new SpeechRecognitionImpl();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? '';
      setInput(transcript);
    };
    recognition.onend = () => setIsRecording(false);
    recognition.onerror = () => setIsRecording(false);
    recognitionRef.current = recognition;
    setIsRecording(true);
    recognition.start();
  };

  const replaySession = (session: StoredSession) => {
    setHistoryOpen(false);
    setPendingExecution(null);
    setCurrentPlan(
      session.plan
        ? { ...session.plan, states: session.plan.steps.map(() => 'done' as PlanStepState) }
        : null,
    );
    setMessages([
      { role: 'assistant', type: 'status', content: `Replaying ${new Date(session.createdAt).toLocaleString()}` },
      ...session.messages.filter((message) => message.type === 'tool_call' || message.type === 'tool_result' || message.type === 'status'),
    ]);
  };

  const hasSpeechRecognition = useMemo(
    () => typeof window !== 'undefined' && Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition),
    [],
  );

  return (
    <div className="flex h-full flex-col bg-[#0d0d0f]">
      <div className="flex items-center justify-between border-b border-zinc-800/80 px-4 py-2">
        <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Agent Console</div>
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="rounded border border-zinc-700 px-3 py-1 text-xs text-zinc-300 transition hover:border-[#00E5FF] hover:text-[#00E5FF]"
        >
          History
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center opacity-70">
            <div className="mb-4 text-5xl font-mono text-[#00E5FF]">⬡</div>
            <p className="text-lg text-zinc-300">What do you want to build?</p>
            <p className="mt-2 text-sm text-zinc-500">Try: &quot;Add a health system to my Player GameObject&quot;</p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <MessageBubble
              key={`${idx}-${msg.type}`}
              msg={msg}
              planState={currentPlan}
              onApprove={approvePendingPlan}
              onReject={rejectPendingPlan}
              approvalDisabled={isLoading || !pendingExecution}
            />
          ))
        )}
        <div ref={endOfMessagesRef} />
      </div>

      <div className="border-t border-zinc-800 bg-black/40 p-4 backdrop-blur-sm">
        <form onSubmit={handleSubmit} className="relative mx-auto max-w-3xl">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
            placeholder={isLoading ? 'FORGE is thinking...' : 'Instruct FORGE...'}
            className="w-full rounded-lg border border-zinc-700 bg-[#161618] py-3 pl-12 pr-12 text-zinc-100 transition-all focus:border-[#00E5FF] focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={isRecording ? () => recognitionRef.current?.stop() : startVoiceInput}
            disabled={isLoading || !hasSpeechRecognition}
            title={hasSpeechRecognition ? 'Voice input' : 'Voice input is not supported in this browser'}
            className="absolute bottom-2 left-2 top-2 flex aspect-square items-center justify-center rounded border border-zinc-700 text-zinc-300 transition hover:border-[#00E5FF] hover:text-[#00E5FF] disabled:opacity-40"
          >
            {isRecording ? <span className="h-3 w-3 animate-pulse rounded-full bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.9)]" /> : <MicIcon />}
          </button>
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="absolute bottom-2 right-2 top-2 flex aspect-square items-center justify-center rounded bg-[#00E5FF] text-black transition-colors hover:bg-[#00cce6] disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            <ArrowIcon />
          </button>
        </form>
        <div className="mx-auto mt-3 flex max-w-3xl flex-wrap gap-2">
          {PROMPT_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => setInput(chip)}
              disabled={isLoading}
              className="rounded-full border border-zinc-700 bg-[#111113] px-3 py-1 text-xs text-zinc-300 transition hover:border-[#00E5FF] hover:text-[#00E5FF] disabled:opacity-40"
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      {historyOpen && (
        <div className="absolute inset-0 z-30 flex justify-end bg-black/60">
          <div className="h-full w-full max-w-md border-l border-zinc-800 bg-[#111113] shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 p-4">
              <h2 className="text-sm font-semibold text-[#00E5FF]">Session History</h2>
              <button type="button" onClick={() => setHistoryOpen(false)} className="text-sm text-zinc-400 hover:text-white">
                Close
              </button>
            </div>
            <div className="space-y-2 p-4">
              {history.length === 0 ? (
                <p className="text-sm text-zinc-500">No saved runs yet.</p>
              ) : (
                history.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => replaySession(session)}
                    className="block w-full rounded border border-zinc-800 bg-black/30 p-3 text-left transition hover:border-[#00E5FF]/70"
                  >
                    <div className="text-sm text-zinc-200">{session.prompt}</div>
                    <div className="mt-1 text-xs text-zinc-500">{new Date(session.createdAt).toLocaleString()}</div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MessageBubble({
  msg,
  planState,
  onApprove,
  onReject,
  approvalDisabled,
}: {
  msg: Message;
  planState: { prompt: string; steps: string[]; states: PlanStepState[] } | null;
  onApprove: () => void;
  onReject: () => void;
  approvalDisabled: boolean;
}) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-[#2b2d31] px-4 py-2.5 text-sm text-zinc-100">
          {msg.content}
        </div>
      </div>
    );
  }

  if (msg.type === 'tool_call') {
    const data = JSON.parse(msg.content) as ToolCallData;
    const isScript = data.name === 'create_script' || data.name === 'edit_script';

    return (
      <div className="flex justify-start">
        <div className="max-w-[90%] rounded-lg border border-[#00E5FF]/30 bg-[#0f1b21] px-3 py-2 text-xs font-mono shadow-[0_0_10px_rgba(0,229,255,0.05)]">
          <div className="mb-2 flex items-center gap-2 text-[#00E5FF]">
            <SpinnerIcon />
            {isScript ? (data.name === 'create_script' ? 'Creating Script...' : 'Editing Script...') : `Calling ${data.name}...`}
          </div>
          {isScript ? (
            <DiffViewer
              oldCode=""
              newCode={data.input.code ?? data.input.diff ?? ''}
              fileName={data.input.fileName ? `${data.input.fileName}.cs` : data.input.filePath ?? 'script.cs'}
            />
          ) : (
            <pre className="overflow-x-auto whitespace-pre-wrap text-zinc-400">{JSON.stringify(data.input, null, 2)}</pre>
          )}
        </div>
      </div>
    );
  }

  if (msg.type === 'tool_result') {
    const data = JSON.parse(msg.content) as { name: string; result?: unknown; error?: string };
    const hasError = Boolean(data.error);
    return (
      <div className="flex justify-start">
        <div className={`max-w-[90%] rounded-lg border bg-zinc-900/50 px-3 py-2 text-xs font-mono text-zinc-500 ${hasError ? 'border-red-500/40' : 'border-zinc-800'}`}>
          <div className={`mb-1 flex items-center gap-1.5 ${hasError ? 'text-red-300' : 'text-emerald-500'}`}>
            <CheckIcon />
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
          prompt={planState?.prompt ?? data.prompt}
          steps={planState?.steps ?? data.steps}
          states={planState?.states ?? data.steps.map(() => 'pending')}
          onApprove={onApprove}
          onReject={onReject}
          disabled={approvalDisabled}
        />
      </div>
    );
  }

  if (msg.type === 'status') {
    return (
      <div className="flex justify-start">
        <div className="rounded border border-[#00E5FF]/20 bg-[#00E5FF]/5 px-3 py-2 text-xs text-[#00E5FF]">{msg.content}</div>
      </div>
    );
  }

  if (msg.type === 'error') {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-lg border border-red-500/40 bg-red-950/30 px-3 py-2 text-sm text-red-200">
          {msg.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{msg.content}</div>
    </div>
  );
}

function MicIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18.5a5 5 0 005-5V11m-10 2.5a5 5 0 0010 0M12 18.5V22m-4 0h8M12 2a3 3 0 00-3 3v7a3 3 0 006 0V5a3 3 0 00-3-3z" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12a8 8 0 018-8m8 8a8 8 0 01-8 8" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}
