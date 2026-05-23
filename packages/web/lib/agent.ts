import { GoogleGenerativeAI, type Content, type Part } from '@google/generative-ai';
import { FORGE_TOOLS } from '@/lib/forge-tools';

export type AgentMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type AgentRequest = {
  messages: AgentMessage[];
  relayUrl: string;
  approved?: boolean;
};

export type AgentPlan = {
  prompt: string;
  steps: string[];
};

export type AgentStreamEvent =
  | { event: 'text'; data: string }
  | { event: 'plan'; data: AgentPlan }
  | { event: 'plan_step'; data: { index: number; state: 'active' | 'done'; label?: string } }
  | { event: 'status'; data: { message: string; model?: string; switchedToLocal?: boolean } }
  | { event: 'tokens'; data: { input: number; output: number; total: number } }
  | { event: 'tool_call'; data: { name: string; input: Record<string, unknown> } }
  | { event: 'tool_result'; data: { name: string; result?: unknown; error?: string } }
  | { event: 'error'; data: string }
  | { event: 'done'; data: unknown };

type RelayToolResponse = {
  ok?: boolean;
  result?: unknown;
  error?: string;
};

type SendEvent = (event: AgentStreamEvent['event'], data: unknown) => void;

type OllamaMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: OllamaToolCall[];
  name?: string;
};

type OllamaToolCall = {
  function?: {
    name?: string;
    arguments?: Record<string, unknown> | string;
  };
};

type OllamaResponse = {
  message?: OllamaMessage;
  prompt_eval_count?: number;
  eval_count?: number;
};

const MAX_AGENT_ITERATIONS = 12;
const MAX_FIX_ATTEMPTS = 3;

const OLLAMA_TOOLS = FORGE_TOOLS.map((tool) => ({
  type: 'function',
  function: {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  },
}));

export function buildPlan(prompt: string): AgentPlan {
  return {
    prompt: prompt || 'the requested Unity change',
    steps: [
      'Read the current Unity scene hierarchy.',
      'Inspect the target GameObject and its components.',
      'Create or edit the required C# script.',
      'Attach/configure the component on the target GameObject.',
      'Check Unity compile errors and report the final verdict.',
    ],
  };
}

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set. Add it to packages/web/.env.local.');
  }

  return new GoogleGenerativeAI(apiKey);
}

function getSystemPrompt() {
  return `You are FORGE, an AI agent for Unity game development.
You have access to tools that let you read and modify a live Unity project.
ALWAYS start by calling get_scene_state to understand the current project.
The user has approved the implementation plan, so you may call modifying tools when needed.
If the scene does not already contain the target object, create it with create_gameobject before adding components.
Use duplicate_gameobject, rename_gameobject, delete_gameobject, save_as_prefab, and instantiate_prefab when the user asks for object lifecycle or prefab work.
When writing C# code: use standard Unity patterns, include using statements, and keep MonoBehaviours focused on one responsibility.
After creating or editing scripts, FORGE will automatically run get_compile_errors and feed errors back to you. When asked to fix compile errors, return a full corrected script via create_script or edit_script.
When asked to add a component, create the script first, then call set_component_property for at least one serialized field on that component so the Unity bridge can attach/configure it.
Be concise in your explanations; the developer can see the tool results directly.`;
}

function planStepForTool(name: string) {
  if (name === 'get_scene_state') return 0;
  if (name === 'get_object_components') return 1;
  if (name === 'create_script' || name === 'edit_script') return 2;
  if (name === 'set_component_property') return 3;
  if (name === 'get_compile_errors' || name === 'enter_play_mode' || name === 'exit_play_mode') return 4;
  return undefined;
}

async function callRelayTool(
  relayUrl: string,
  send: SendEvent,
  name: string,
  args: Record<string, unknown> = {},
) {
  const stepIndex = planStepForTool(name);
  if (stepIndex !== undefined) send('plan_step', { index: stepIndex, state: 'active' });
  send('tool_call', { name, input: args });

  const response = await fetch(`${relayUrl}/tool`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool: name, args }),
  });
  const data = (await response.json()) as RelayToolResponse;

  if (!response.ok || data.ok === false) {
    const message = data.error ?? `Relay returned ${response.status}`;
    send('tool_result', { name, error: message });
    throw new Error(message);
  }

  send('tool_result', { name, result: data.result });
  if (stepIndex !== undefined && name !== 'create_script' && name !== 'edit_script') {
    send('plan_step', { index: stepIndex, state: 'done' });
  }
  return data.result;
}

function hasCompileErrors(result: unknown) {
  if (Array.isArray(result)) return result.length > 0;
  if (!result || typeof result !== 'object') return false;
  const maybe = result as { errors?: unknown[]; count?: number; hasErrors?: boolean };
  return Boolean(maybe.hasErrors) || Boolean(maybe.count) || (Array.isArray(maybe.errors) && maybe.errors.length > 0);
}

function extractScriptIdentity(name: string, args: Record<string, unknown>) {
  const code = typeof args.code === 'string' ? args.code : typeof args.diff === 'string' ? args.diff : '';
  const fileName =
    typeof args.fileName === 'string'
      ? args.fileName
      : typeof args.filePath === 'string'
        ? args.filePath
        : 'script.cs';

  return { tool: name, code, fileName };
}

async function autoFixScriptWithGemini(
  chat: ReturnType<ReturnType<GoogleGenerativeAI['getGenerativeModel']>['startChat']>,
  relayUrl: string,
  send: SendEvent,
  originalTool: string,
  originalArgs: Record<string, unknown>,
  compileErrors: unknown,
) {
  let errors = compileErrors;
  const script = extractScriptIdentity(originalTool, originalArgs);

  for (let attempt = 1; attempt <= MAX_FIX_ATTEMPTS && hasCompileErrors(errors); attempt++) {
    send('status', { message: `Retrying fix (attempt ${attempt}/${MAX_FIX_ATTEMPTS})...` });
    const fixPrompt = `Unity compile errors were reported after ${script.tool}.
File: ${script.fileName}
Original code:
\`\`\`csharp
${script.code}
\`\`\`
Compile errors:
\`\`\`json
${JSON.stringify(errors, null, 2)}
\`\`\`
Return a corrected full C# file by calling ${script.tool === 'create_script' ? 'create_script' : 'edit_script'} with the corrected code.`;

    const result = await chat.sendMessage(fixPrompt);
    const parts = result.response.candidates?.[0]?.content?.parts ?? [];
    emitGeminiTokenUsage(result.response, send);

    for (const part of parts) {
      if (part.text) send('text', part.text);
    }

    const fixCalls = parts.filter((part) => part.functionCall);
    for (const part of fixCalls) {
      const fc = part.functionCall;
      if (!fc) continue;

      const toolArgs = (fc.args ?? {}) as Record<string, unknown>;
      await callRelayTool(relayUrl, send, fc.name, toolArgs);
      if (fc.name === 'create_script' || fc.name === 'edit_script') {
        errors = await callRelayTool(relayUrl, send, 'get_compile_errors');
        if (!hasCompileErrors(errors)) {
          send('status', { message: 'Compile errors fixed.' });
          send('plan_step', { index: 2, state: 'done' });
          send('plan_step', { index: 4, state: 'done' });
          return;
        }
      }
    }
  }

  if (hasCompileErrors(errors)) {
    send('status', { message: 'Auto-fix stopped after 3 attempts. Compile errors remain.' });
  }
}

function emitGeminiTokenUsage(response: unknown, send: SendEvent) {
  const usage = (response as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } })
    .usageMetadata;
  if (!usage) return;

  const input = usage.promptTokenCount ?? 0;
  const output = usage.candidatesTokenCount ?? 0;
  const total = usage.totalTokenCount ?? input + output;
  send('tokens', { input, output, total });
}

async function runGeminiAgent(messages: AgentMessage[], relayUrl: string, send: SendEvent) {
  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL ?? 'gemini-2.0-flash',
    systemInstruction: getSystemPrompt(),
    tools: [{ functionDeclarations: FORGE_TOOLS }],
  });

  send('status', { message: 'Using Gemini 2.0 Flash.', model: process.env.GEMINI_MODEL ?? 'gemini-2.0-flash' });

  const history: Content[] = messages.slice(0, -1).map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }));

  const chat = model.startChat({ history });
  let currentMessage: string | Part[] = messages[messages.length - 1].content;

  for (let iterations = 0; iterations < MAX_AGENT_ITERATIONS; iterations++) {
    const result = await chat.sendMessage(currentMessage);
    const parts = result.response.candidates?.[0]?.content?.parts ?? [];
    emitGeminiTokenUsage(result.response, send);

    for (const part of parts) {
      if (part.text) send('text', part.text);
    }

    const functionCalls = parts.filter((part) => part.functionCall);
    if (functionCalls.length === 0) return;

    const functionResponses: Part[] = [];
    for (const part of functionCalls) {
      const fc = part.functionCall;
      if (!fc) continue;

      try {
        const args = (fc.args ?? {}) as Record<string, unknown>;
        const toolResult = await callRelayTool(relayUrl, send, fc.name, args);
        functionResponses.push({
          functionResponse: { name: fc.name, response: { result: toolResult } },
        });

        if (fc.name === 'create_script' || fc.name === 'edit_script') {
          const compileErrors = await callRelayTool(relayUrl, send, 'get_compile_errors');
          functionResponses.push({
            functionResponse: { name: 'get_compile_errors', response: { result: compileErrors } },
          });

          if (hasCompileErrors(compileErrors)) {
            await autoFixScriptWithGemini(chat, relayUrl, send, fc.name, args, compileErrors);
          } else {
            send('plan_step', { index: 2, state: 'done' });
            send('plan_step', { index: 4, state: 'done' });
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        functionResponses.push({
          functionResponse: { name: fc.name, response: { error: message } },
        });
      }
    }

    currentMessage = functionResponses;
  }
}

function parseOllamaArgs(args: Record<string, unknown> | string | undefined) {
  if (!args) return {};
  if (typeof args === 'string') {
    try {
      return JSON.parse(args) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  return args;
}

async function runOllamaAgent(messages: AgentMessage[], relayUrl: string, send: SendEvent) {
  const baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
  const model = process.env.OLLAMA_MODEL ?? 'llama3.1:8b';
  const ollamaMessages: OllamaMessage[] = [
    { role: 'system', content: getSystemPrompt() },
    ...messages.map((message): OllamaMessage => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content,
    })),
  ];

  send('status', { message: 'Switched to local model', model, switchedToLocal: true });
  send('text', `Gemini is unavailable, so I switched to local Ollama (${model}).\n\n`);

  for (let iterations = 0; iterations < MAX_AGENT_ITERATIONS; iterations++) {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: ollamaMessages,
        tools: OLLAMA_TOOLS,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status}. Is Ollama running and is ${model} pulled?`);
    }

    const data = (await response.json()) as OllamaResponse;
    const message = data.message;
    if (!message) throw new Error('Ollama returned no message.');

    send('tokens', {
      input: data.prompt_eval_count ?? 0,
      output: data.eval_count ?? 0,
      total: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
    });

    if (message.content) send('text', message.content);
    ollamaMessages.push(message);

    const toolCalls = message.tool_calls ?? [];
    if (toolCalls.length === 0) return;

    for (const toolCall of toolCalls) {
      const name = toolCall.function?.name;
      if (!name) continue;

      try {
        const args = parseOllamaArgs(toolCall.function?.arguments);
        const toolResult = await callRelayTool(relayUrl, send, name, args);
        ollamaMessages.push({ role: 'tool', name, content: JSON.stringify({ result: toolResult }) });

        if (name === 'create_script' || name === 'edit_script') {
          const compileErrors = await callRelayTool(relayUrl, send, 'get_compile_errors');
          ollamaMessages.push({ role: 'tool', name: 'get_compile_errors', content: JSON.stringify({ result: compileErrors }) });
          if (hasCompileErrors(compileErrors)) {
            send('status', { message: 'Compile errors detected. Local model will attempt a fix.' });
          } else {
            send('plan_step', { index: 2, state: 'done' });
            send('plan_step', { index: 4, state: 'done' });
          }
        }
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        ollamaMessages.push({ role: 'tool', name, content: JSON.stringify({ error }) });
      }
    }
  }
}

export async function runAgent(messages: AgentMessage[], relayUrl: string, send: SendEvent) {
  await runOllamaAgent(messages, relayUrl, send);
}
