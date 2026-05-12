import { GoogleGenerativeAI, type Content, type Part } from '@google/generative-ai';
import { FORGE_TOOLS } from '@/lib/forge-tools';

type AgentMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type AgentRequest = {
  messages: AgentMessage[];
  relayUrl: string;
  approved?: boolean;
};

type RelayToolResponse = {
  ok?: boolean;
  result?: unknown;
  error?: string;
};

type SendEvent = (event: string, data: unknown) => void;

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
};

const OLLAMA_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_scene_state',
      description: 'Returns the full Unity scene hierarchy as JSON. Call this first.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_object_components',
      description: 'Returns components and serialized properties for a GameObject.',
      parameters: {
        type: 'object',
        properties: {
          gameObjectPath: { type: 'string' },
        },
        required: ['gameObjectPath'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_script',
      description: 'Creates a new C# MonoBehaviour script and triggers compilation.',
      parameters: {
        type: 'object',
        properties: {
          fileName: { type: 'string' },
          code: { type: 'string' },
        },
        required: ['fileName', 'code'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_script',
      description: 'Edits an existing C# script and triggers compilation.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string' },
          code: { type: 'string' },
          diff: { type: 'string' },
        },
        required: ['filePath'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_component_property',
      description: 'Adds/configures a component field or property on a GameObject.',
      parameters: {
        type: 'object',
        properties: {
          gameObjectPath: { type: 'string' },
          componentType: { type: 'string' },
          property: { type: 'string' },
          value: { type: 'string' },
        },
        required: ['gameObjectPath', 'componentType'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_compile_errors',
      description: 'Returns current Unity compilation errors.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'enter_play_mode',
      description: 'Enters Unity play mode.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'exit_play_mode',
      description: 'Exits Unity play mode.',
      parameters: { type: 'object', properties: {} },
    },
  },
];

const HEALTH_SYSTEM_CODE = `using UnityEngine;
using UnityEngine.Events;

public class HealthSystem : MonoBehaviour
{
    [Header("Health Settings")]
    public float maxHealth = 100f;
    public float currentHealth;

    [Header("Events")]
    public UnityEvent onDeath;
    public UnityEvent<float> onHealthChanged;

    void Awake() => currentHealth = maxHealth;

    public void TakeDamage(float amount)
    {
        currentHealth = Mathf.Clamp(currentHealth - amount, 0, maxHealth);
        onHealthChanged?.Invoke(currentHealth);
        if (currentHealth <= 0) onDeath?.Invoke();
    }

    public void Heal(float amount)
    {
        currentHealth = Mathf.Clamp(currentHealth + amount, 0, maxHealth);
        onHealthChanged?.Invoke(currentHealth);
    }

    public bool IsAlive => currentHealth > 0;
}
`;

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
When writing C# code: use standard Unity patterns, include using statements, and keep MonoBehaviours focused on one responsibility.
After creating scripts, always call get_compile_errors. If errors exist, fix them (max 3 attempts).
When asked to add a component, create the script first, then call set_component_property for at least one serialized field on that component so the Unity bridge can attach/configure it.
Be concise in your explanations; the developer can see the tool results directly.`;
}

async function callRelayTool(
  relayUrl: string,
  send: SendEvent,
  name: string,
  args: Record<string, unknown> = {},
) {
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
  return data.result;
}

async function runHealthSystemDemo(relayUrl: string, send: SendEvent, reason: string) {
  send('text', `${reason} Running the built-in FORGE demo flow for adding HealthSystem to Player.\n\n`);

  await callRelayTool(relayUrl, send, 'get_scene_state');
  await callRelayTool(relayUrl, send, 'get_object_components', { gameObjectPath: 'Player' });
  await callRelayTool(relayUrl, send, 'create_script', {
    fileName: 'HealthSystem',
    code: HEALTH_SYSTEM_CODE,
  });
  await callRelayTool(relayUrl, send, 'set_component_property', {
    gameObjectPath: 'Player',
    componentType: 'HealthSystem',
    property: 'maxHealth',
    value: '100',
  });
  const compileErrors = await callRelayTool(relayUrl, send, 'get_compile_errors');

  send(
    'text',
    Array.isArray(compileErrors) && compileErrors.length > 0
      ? 'HealthSystem was created, but Unity still reports compile errors. Check the tool output and Unity Console.'
      : 'HealthSystem.cs was created, attached to Player, and Unity reports no compile errors.',
  );
}

function isHealthSystemPrompt(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes('health') && normalized.includes('player');
}

function isGeminiQuotaError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes('429') || message.toLowerCase().includes('quota');
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

async function runGeminiAgent(messages: AgentMessage[], relayUrl: string, send: SendEvent) {
  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL ?? 'gemini-2.0-flash',
    systemInstruction: getSystemPrompt(),
    tools: [{ functionDeclarations: FORGE_TOOLS }],
  });

  const history: Content[] = messages.slice(0, -1).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const chat = model.startChat({ history });
  let currentMessage: string | Part[] = messages[messages.length - 1].content;

  for (let iterations = 0; iterations < 10; iterations++) {
    const result = await chat.sendMessage(currentMessage);
    const parts = result.response.candidates?.[0]?.content?.parts ?? [];

    for (const part of parts) {
      if (part.text) send('text', part.text);
    }

    const functionCalls = parts.filter((p) => p.functionCall);
    if (functionCalls.length === 0) return;

    const functionResponses: Part[] = [];
    for (const part of functionCalls) {
      const fc = part.functionCall;
      if (!fc) continue;

      try {
        const toolResult = await callRelayTool(
          relayUrl,
          send,
          fc.name,
          (fc.args ?? {}) as Record<string, unknown>,
        );
        functionResponses.push({
          functionResponse: { name: fc.name, response: { result: toolResult } },
        });
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

async function runOllamaAgent(messages: AgentMessage[], relayUrl: string, send: SendEvent) {
  const baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
  const model = process.env.OLLAMA_MODEL ?? 'llama3.1:8b';
  const ollamaMessages: OllamaMessage[] = [
    { role: 'system', content: getSystemPrompt() },
    ...messages.map((m): OllamaMessage => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })),
  ];

  send('text', `Gemini is unavailable, so I am switching to local Ollama (${model}).\n\n`);

  for (let iterations = 0; iterations < 10; iterations++) {
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

    if (message.content) send('text', message.content);
    ollamaMessages.push(message);

    const toolCalls = message.tool_calls ?? [];
    if (toolCalls.length === 0) return;

    for (const toolCall of toolCalls) {
      const name = toolCall.function?.name;
      if (!name) continue;

      try {
        const toolResult = await callRelayTool(
          relayUrl,
          send,
          name,
          parseOllamaArgs(toolCall.function?.arguments),
        );
        ollamaMessages.push({
          role: 'tool',
          name,
          content: JSON.stringify({ result: toolResult }),
        });
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        ollamaMessages.push({
          role: 'tool',
          name,
          content: JSON.stringify({ error }),
        });
      }
    }
  }
}

export async function POST(req: Request) {
  const { messages, relayUrl, approved = false } = (await req.json()) as AgentRequest;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event, data })}\n\n`));

      try {
        const lastUserMessage = messages[messages.length - 1]?.content ?? '';

        if (!approved) {
          send('plan', {
            prompt: lastUserMessage || 'the requested Unity change',
            steps: [
              'Read the current Unity scene hierarchy.',
              'Inspect the target GameObject and its components.',
              'Create or edit the required C# script.',
              'Attach/configure the component on the target GameObject.',
              'Check Unity compile errors and report the final verdict.',
            ],
          });
          send('done', {});
          controller.close();
          return;
        }

        try {
          await runGeminiAgent(messages, relayUrl, send);
        } catch (geminiError: unknown) {
          try {
            await runOllamaAgent(messages, relayUrl, send);
          } catch (ollamaError: unknown) {
            if (isGeminiQuotaError(geminiError) && isHealthSystemPrompt(lastUserMessage)) {
              await runHealthSystemDemo(
                relayUrl,
                send,
                'Gemini is out of quota and Ollama is not available.',
              );
            } else {
              const geminiMessage = geminiError instanceof Error ? geminiError.message : String(geminiError);
              const ollamaMessage = ollamaError instanceof Error ? ollamaError.message : String(ollamaError);
              throw new Error(`Gemini failed: ${geminiMessage}\n\nOllama failed: ${ollamaMessage}`);
            }
          }
        }

        send('done', {});
        controller.close();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        send('error', message);
        send('done', {});
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  });
}
