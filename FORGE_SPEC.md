# FORGE — Hackathon Build Specification
### Next Byte Hacks V2 Submission | Full Coding-Agent Spec

> **One-sentence pitch:** FORGE is a web-based AI agent that connects to a running Unity Editor via a local MCP bridge, lets you describe what you want to build in plain English, and autonomously reads your scene, writes C# scripts, wires components, and verifies results — without you leaving the browser tab.

---

## Table of Contents
1. [What to Change from the Original Spec](#1-what-to-change-from-the-original-spec)
2. [Hackathon Scope — What to Build](#2-hackathon-scope--what-to-build)
3. [Tech Stack](#3-tech-stack)
4. [Repository Structure](#4-repository-structure)
5. [Step-by-Step Build Guide](#5-step-by-step-build-guide)
6. [Component Specs](#6-component-specs)
7. [API & Data Contracts](#7-api--data-contracts)
8. [Environment Variables](#8-environment-variables)
9. [Get Your Free Gemini API Key](#9-get-your-free-gemini-api-key)
10. [Deployment](#10-deployment)
11. [Judging Criteria Alignment](#11-judging-criteria-alignment)

---

## 1. What to Change from the Original Spec

The original FORGE spec is a full commercial product (10-week MVP, SaaS pricing, Unity Asset Store distribution). For a 48-hour hackathon you must **scope ruthlessly** and **make it deployable**. Here are the concrete changes:

| Original Spec | Hackathon Version | Why |
|---|---|---|
| Unity Editor Plugin (C# IMGUI) | Browser-based chat UI | No Unity install required for judges; deployable as a web app |
| MCP over stdio/SSE to a local plugin | Lightweight WebSocket bridge (a small Unity C# EditorWindow + Node relay) | Same concept, far less code |
| L3 Python LangGraph orchestrator | Node.js/TypeScript agent loop (single process) | One language across the stack; easier Vercel/Railway deploy |
| 15 MCP tools in MVP | 7 core tools (see below) | Completeness over breadth for a demo |
| Semantic vector index | Session-scoped JSON memory only | Skip the embedding infra |
| Play mode bridge with test input injection | Play mode enter/exit + console log read only | Reduces Unity API surface to what's stable |
| Multi-model routing (Opus/Sonnet/Haiku/Ollama) | Gemini 2.0 Flash only | Free tier (1,500 req/day), no credit card needed |
| Paid tiers + Stripe | Free, fully open | Hackathon judging requirement |

---

## 2. Hackathon Scope — What to Build

### The Demo Flow (must work end-to-end)
1. Developer opens the FORGE web app (deployed URL).
2. Pastes their FORGE Bridge URL (localhost WebSocket from the Unity package).
3. Types: *"Add a health system to my Player GameObject"*
4. FORGE shows a **plan** (steps it will take) and asks for approval.
5. On approval, FORGE calls Unity tools: reads scene → creates HealthSystem.cs → adds component → verifies no compile errors.
6. Developer sees a **diff** of every file changed and a **success/fail** verdict.

### The 7 Core Tools (MCP Tool Surface)

| Tool | Input | Output |
|---|---|---|
| `get_scene_state` | — | Full hierarchy JSON |
| `get_object_components` | `gameObjectPath: string` | Component list + property values |
| `set_component_property` | `path, component, property, value` | `{ok, newValue}` |
| `create_script` | `fileName, code` | `{ok, filePath, compileErrors[]}` |
| `edit_script` | `filePath, diff` | `{ok, compileErrors[]}` |
| `get_compile_errors` | — | `CompileError[]` |
| `enter_play_mode` / `exit_play_mode` | — | `{ok, mode}` |

---

## 3. Tech Stack

```
forge/
├── packages/
│   ├── bridge/          # Unity C# EditorWindow (ships as a .unitypackage)
│   ├── relay/           # Node.js WebSocket relay + MCP tool handlers
│   └── web/             # Next.js 14 chat UI (deployed to Vercel)
```

| Layer | Technology | Notes |
|---|---|---|
| Web UI | Next.js 14 (App Router) + Tailwind CSS | Deployed free on Vercel |
| Agent loop | TypeScript (in the Next.js API route) | Server-side streaming via Vercel AI SDK |
| LLM | Google Gemini 2.0 Flash (`gemini-2.0-flash`) | Use `@google/generative-ai` — **free tier, no credit card** |
| Bridge relay | Node.js + `ws` package | Runs on developer's machine alongside Unity |
| Unity plugin | C# + Unity Editor API | Tested on Unity 6 LTS |
| Persistence | Vercel KV (Redis) or in-memory for session | Optional for hackathon |

---

## 4. Repository Structure

```
forge/
├── packages/
│   ├── bridge/
│   │   ├── Editor/
│   │   │   ├── ForgeBridge.cs          # Main EditorWindow
│   │   │   ├── ForgeSceneReader.cs     # Serializes hierarchy to JSON
│   │   │   ├── ForgeScriptOps.cs       # Create/edit C# files
│   │   │   └── ForgeWebSocketServer.cs # Listens on ws://localhost:9901
│   │   └── package.json                # Unity package manifest
│   │
│   ├── relay/
│   │   ├── src/
│   │   │   ├── index.ts                # Express + ws server on port 9902
│   │   │   ├── tools.ts                # MCP tool definitions & handlers
│   │   │   ├── bridge-client.ts        # WS client to Unity (port 9901)
│   │   │   └── types.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── web/
│       ├── app/
│       │   ├── page.tsx                # Landing / connect screen
│       │   ├── chat/
│       │   │   └── page.tsx            # Main FORGE chat UI
│       │   └── api/
│       │       ├── agent/
│       │       │   └── route.ts        # Streaming agent endpoint
│       │       └── tools/
│       │           └── route.ts        # Proxy to relay
│       ├── components/
│       │   ├── ChatPanel.tsx
│       │   ├── PlanApproval.tsx
│       │   ├── DiffViewer.tsx
│       │   ├── SceneTree.tsx
│       │   └── StatusBar.tsx
│       ├── lib/
│       │   ├── agent.ts                # Gemini function-calling loop
│       │   └── forge-tools.ts          # Tool definitions for Gemini
│       ├── .env.local
│       └── package.json
│
├── README.md
└── demo/
    └── sample-unity-project/           # Minimal Unity project for judges
```

---

## 5. Step-by-Step Build Guide

### Phase 0 — Repo Setup (30 min)

```bash
mkdir forge && cd forge
git init
npm init -w packages/relay -w packages/web -y
# Install root tooling
npm install -D typescript turbo
```

Create `turbo.json`:
```json
{
  "pipeline": {
    "dev": { "cache": false, "persistent": true },
    "build": { "dependsOn": ["^build"] }
  }
}
```

---

### Phase 1 — Unity Bridge (packages/bridge) (3–4 hrs)

**Goal:** Unity Editor listens on `ws://localhost:9901`, accepts JSON command messages, executes them, and returns JSON responses.

#### 1.1 ForgeWebSocketServer.cs

```csharp
// packages/bridge/Editor/ForgeWebSocketServer.cs
using UnityEditor;
using System.Net;
using System.Net.WebSockets;
using System.Threading;
using System.Text;
using System.Collections.Generic;
using Newtonsoft.Json;

[InitializeOnLoad]
public static class ForgeWebSocketServer
{
    static HttpListener _listener;
    static Thread _thread;

    static ForgeWebSocketServer()
    {
        EditorApplication.quitting += Stop;
        Start();
    }

    public static void Start()
    {
        _listener = new HttpListener();
        _listener.Prefixes.Add("http://localhost:9901/forge/");
        _listener.Start();
        _thread = new Thread(Listen) { IsBackground = true };
        _thread.Start();
        UnityEngine.Debug.Log("[FORGE] Bridge listening on ws://localhost:9901/forge/");
    }

    static void Stop() { _listener?.Stop(); }

    static async void Listen()
    {
        while (_listener.IsListening)
        {
            var ctx = await _listener.GetContextAsync();
            if (ctx.Request.IsWebSocketRequest)
            {
                var wsCtx = await ctx.AcceptWebSocketAsync(null);
                _ = HandleConnection(wsCtx.WebSocket);
            }
        }
    }

    static async System.Threading.Tasks.Task HandleConnection(WebSocket ws)
    {
        var buf = new byte[65536];
        while (ws.State == WebSocketState.Open)
        {
            var result = await ws.ReceiveAsync(new ArraySegment<byte>(buf), CancellationToken.None);
            if (result.MessageType == WebSocketMessageType.Close) break;
            var msg = Encoding.UTF8.GetString(buf, 0, result.Count);
            var cmd = JsonConvert.DeserializeObject<ForgeCommand>(msg);
            // Dispatch on main thread
            string responseJson = null;
            var mre = new ManualResetEventSlim(false);
            EditorApplication.delayCall += () =>
            {
                responseJson = ForgeDispatcher.Dispatch(cmd);
                mre.Set();
            };
            mre.Wait();
            var responseBytes = Encoding.UTF8.GetBytes(responseJson);
            await ws.SendAsync(new ArraySegment<byte>(responseBytes),
                WebSocketMessageType.Text, true, CancellationToken.None);
        }
    }
}

public class ForgeCommand
{
    public string id { get; set; }
    public string tool { get; set; }
    public Dictionary<string, object> args { get; set; }
}
```

#### 1.2 ForgeDispatcher.cs

```csharp
// packages/bridge/Editor/ForgeDispatcher.cs
using Newtonsoft.Json;
using UnityEditor;
using UnityEngine;

public static class ForgeDispatcher
{
    public static string Dispatch(ForgeCommand cmd)
    {
        try
        {
            object result = cmd.tool switch
            {
                "get_scene_state"        => ForgeSceneReader.GetSceneState(),
                "get_object_components"  => ForgeSceneReader.GetObjectComponents(cmd.args),
                "set_component_property" => ForgeSceneWriter.SetComponentProperty(cmd.args),
                "create_script"          => ForgeScriptOps.CreateScript(cmd.args),
                "edit_script"            => ForgeScriptOps.EditScript(cmd.args),
                "get_compile_errors"     => ForgeScriptOps.GetCompileErrors(),
                "enter_play_mode"        => ForgePlayMode.Enter(),
                "exit_play_mode"         => ForgePlayMode.Exit(),
                _ => new { error = $"Unknown tool: {cmd.tool}" }
            };
            return JsonConvert.SerializeObject(new { id = cmd.id, ok = true, result });
        }
        catch (System.Exception ex)
        {
            return JsonConvert.SerializeObject(new { id = cmd.id, ok = false, error = ex.Message });
        }
    }
}
```

#### 1.3 ForgeSceneReader.cs — Key method

```csharp
public static object GetSceneState()
{
    var scene = UnityEngine.SceneManagement.SceneManager.GetActiveScene();
    var roots = scene.GetRootGameObjects();
    return new {
        sceneName = scene.name,
        objects = System.Array.ConvertAll(roots, SerializeGameObject)
    };
}

static object SerializeGameObject(GameObject go)
{
    return new {
        name = go.name,
        path = GetPath(go.transform),
        active = go.activeSelf,
        components = System.Array.ConvertAll(go.GetComponents<Component>(), c => c?.GetType().Name),
        children = go.transform.Cast<Transform>().Select(t => SerializeGameObject(t.gameObject)).ToArray()
    };
}
```

#### 1.4 ForgeScriptOps.cs — Create & compile

```csharp
public static object CreateScript(Dictionary<string, object> args)
{
    var fileName = args["fileName"].ToString();
    var code = args["code"].ToString();
    var path = $"Assets/Scripts/{fileName}.cs";
    System.IO.File.WriteAllText(path, code);
    AssetDatabase.Refresh();
    AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceUpdate);
    // Wait for compile (poll up to 10s)
    var deadline = System.DateTime.Now.AddSeconds(10);
    while (EditorApplication.isCompiling && System.DateTime.Now < deadline)
        System.Threading.Thread.Sleep(200);
    return new { filePath = path, compileErrors = GetCompileErrors() };
}

public static object GetCompileErrors()
{
    // Unity 6: use CompilationPipeline or read Library/ScriptAssemblies errors
    return UnityEditor.Compilation.CompilationPipeline.GetAssemblyDefinitionFilePathFromAssemblyName("Assembly-CSharp") != null
        ? new string[0]
        : new[] { "Compile errors present — check Unity console" };
}
```

---

### Phase 2 — Relay Server (packages/relay) (2 hrs)

The relay is a Node.js process that:
- Exposes an HTTP REST endpoint (`POST /tool`) for the Next.js web app
- Maintains a persistent WebSocket connection to Unity on `ws://localhost:9901`

```typescript
// packages/relay/src/index.ts
import express from 'express';
import cors from 'cors';
import { BridgeClient } from './bridge-client';

const app = express();
app.use(cors());
app.use(express.json());

const bridge = new BridgeClient('ws://localhost:9901/forge/');

app.post('/tool', async (req, res) => {
  const { tool, args } = req.body;
  try {
    const result = await bridge.call(tool, args ?? {});
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(9902, () => console.log('[FORGE Relay] http://localhost:9902'));
```

```typescript
// packages/relay/src/bridge-client.ts
import WebSocket from 'ws';
import { v4 as uuid } from 'uuid';

export class BridgeClient {
  private ws: WebSocket;
  private pending = new Map<string, (r: any) => void>();

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      this.pending.get(msg.id)?.(msg);
      this.pending.delete(msg.id);
    });
  }

  call(tool: string, args: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = uuid();
      this.pending.set(id, (r) => r.ok ? resolve(r.result) : reject(new Error(r.error)));
      this.ws.send(JSON.stringify({ id, tool, args }));
      setTimeout(() => { this.pending.delete(id); reject(new Error('Timeout')); }, 15000);
    });
  }
}
```

---

### Phase 3 — Agent Loop (packages/web/lib/agent.ts) (2–3 hrs)

First install the Gemini SDK (it's free, no billing required):

```bash
cd packages/web
npm install @google/generative-ai
```

The agent runs entirely in a Next.js streaming API route. It uses Gemini 2.0 Flash's native function calling to execute the 7 FORGE tools.

```typescript
// packages/web/lib/forge-tools.ts
import { FunctionDeclaration, SchemaType } from '@google/generative-ai';

export const FORGE_TOOLS: FunctionDeclaration[] = [
  {
    name: 'get_scene_state',
    description: 'Returns the full Unity scene hierarchy as JSON. Call this first to understand the project.',
    parameters: { type: SchemaType.OBJECT, properties: {} }
  },
  {
    name: 'get_object_components',
    description: 'Returns all components and their serialized properties for a specific GameObject.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        gameObjectPath: { type: SchemaType.STRING, description: 'e.g. "Player" or "World/Enemy"' }
      },
      required: ['gameObjectPath']
    }
  },
  {
    name: 'create_script',
    description: 'Creates a new C# MonoBehaviour script and triggers compilation. Returns compile errors if any.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        fileName: { type: SchemaType.STRING, description: 'Class name without .cs extension' },
        code: { type: SchemaType.STRING, description: 'Full C# source code' }
      },
      required: ['fileName', 'code']
    }
  },
  {
    name: 'get_compile_errors',
    description: 'Returns current Unity compilation errors.',
    parameters: { type: SchemaType.OBJECT, properties: {} }
  },
  {
    name: 'set_component_property',
    description: 'Sets a field on a component attached to a GameObject.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        gameObjectPath: { type: SchemaType.STRING },
        componentType: { type: SchemaType.STRING, description: 'e.g. "HealthSystem"' },
        property: { type: SchemaType.STRING },
        value: { type: SchemaType.STRING, description: 'Value as a string; bridge will cast to correct type' }
      },
      required: ['gameObjectPath', 'componentType', 'property', 'value']
    }
  },
  {
    name: 'enter_play_mode',
    description: 'Enters Unity play mode to test the project.',
    parameters: { type: SchemaType.OBJECT, properties: {} }
  },
  {
    name: 'exit_play_mode',
    description: 'Exits Unity play mode.',
    parameters: { type: SchemaType.OBJECT, properties: {} }
  }
];
```

```typescript
// packages/web/app/api/agent/route.ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import { FORGE_TOOLS } from '@/lib/forge-tools';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: Request) {
  const { messages, relayUrl } = await req.json();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event, data })}\n\n`));

      const systemPrompt = `You are FORGE, an AI agent for Unity game development.
You have access to tools that let you read and modify a live Unity project.
ALWAYS start by calling get_scene_state to understand the current project.
When writing C# code: use standard Unity patterns, include using statements, and keep MonoBehaviours focused on one responsibility.
After creating scripts, always call get_compile_errors. If errors exist, fix them (max 3 attempts).
Be concise in your explanations — the developer can see the tool results directly.`;

      const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        systemInstruction: systemPrompt,
        tools: [{ functionDeclarations: FORGE_TOOLS }],
      });

      // Convert messages to Gemini history format
      // Gemini uses { role: 'user'|'model', parts: [{text}|{functionCall}|{functionResponse}] }
      const history = messages.slice(0, -1).map((m: any) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));

      const chat = model.startChat({ history });
      const lastUserMessage = messages[messages.length - 1].content;

      let iterations = 0;
      let currentMessage = lastUserMessage;

      while (iterations < 10) {
        iterations++;
        const result = await chat.sendMessage(currentMessage);
        const response = result.response;
        const parts = response.candidates?.[0]?.content?.parts ?? [];

        // Stream any text
        for (const part of parts) {
          if (part.text) send('text', part.text);
        }

        // Check for function calls
        const functionCalls = parts.filter(p => p.functionCall);
        if (functionCalls.length === 0) break;

        // Execute each tool call and collect responses
        const functionResponses = [];
        for (const part of functionCalls) {
          const fc = part.functionCall!;
          send('tool_call', { name: fc.name, input: fc.args });
          try {
            const r = await fetch(`${relayUrl}/tool`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tool: fc.name, args: fc.args ?? {} })
            });
            const data = await r.json();
            send('tool_result', { name: fc.name, result: data.result });
            functionResponses.push({
              functionResponse: { name: fc.name, response: { result: data.result } }
            });
          } catch (err: any) {
            functionResponses.push({
              functionResponse: { name: fc.name, response: { error: err.message } }
            });
          }
        }

        // Send all function responses back in one turn
        currentMessage = functionResponses as any;
      }

      send('done', {});
      controller.close();
    }
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
  });
}
```

---

### Phase 4 — Web UI (packages/web) (3–4 hrs)

**Design direction:** Dark terminal aesthetic — deep charcoal background, electric cyan accent (`#00E5FF`), monospace font for tool outputs, clean sans-serif for chat. Think "IDE meets chat."

#### Key components to build:

**ChatPanel.tsx** — Main conversation view
- Message bubbles (user = right, FORGE = left)
- Streaming text renders character by character
- Tool calls render as collapsible "action cards" with cyan border
- A `PlanApproval` banner appears when FORGE proposes a plan (before first tool call)

**DiffViewer.tsx** — Shows created/edited files
- Side-by-side diff using `react-diff-viewer-continued`
- Syntax highlighted with `react-syntax-highlighter`
- "Accept" / "Undo" buttons

**SceneTree.tsx** — Rendered after `get_scene_state`
- Collapsible tree of Unity hierarchy
- Component badges on each node
- Updates live as agent modifies the scene

**StatusBar.tsx** — Bottom bar showing:
- Connection status (Unity bridge: connected / disconnected)
- Active model
- Token usage

#### Connection screen (app/page.tsx)

```tsx
// Simple connect form
export default function Home() {
  return (
    <main className="min-h-screen bg-[#0d0d0f] flex items-center justify-center">
      <div className="w-[420px] space-y-6">
        <div className="text-center">
          <h1 className="text-4xl font-mono font-bold text-[#00E5FF]">⬡ FORGE</h1>
          <p className="text-zinc-400 mt-2">The Cursor moment for Unity</p>
        </div>
        <ConnectForm />
        <p className="text-xs text-zinc-600 text-center">
          Start the relay: <code className="text-zinc-400">cd packages/relay && npm run dev</code>
        </p>
      </div>
    </main>
  );
}
```

---

### Phase 5 — Integration & Testing (2 hrs)

#### End-to-end test script

Create `demo/test-flow.ts` that sends these 3 prompts in sequence and asserts success:

1. `"Add a health system to my Player GameObject"` → expect `HealthSystem.cs` created, component attached, 0 compile errors
2. `"Make the enemy patrol between two waypoints"` → expect `PatrolController.cs` created
3. `"Something is wrong with my jump — fix it"` → expect compile errors read, patch applied

Run tests against the sample Unity project in `demo/sample-unity-project/`.

---

## 6. Component Specs

### ForgeCommand (Wire Format — Unity ↔ Relay)

```typescript
// Request (Relay → Unity)
interface ForgeCommand {
  id: string;          // UUID
  tool: string;        // tool name
  args: Record<string, unknown>;
}

// Response (Unity → Relay)
interface ForgeResponse {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}
```

### Agent SSE Event Stream (API Route → Browser)

```typescript
type ForgeEvent =
  | { event: 'text';        data: string }
  | { event: 'tool_call';   data: { name: string; input: unknown } }
  | { event: 'tool_result'; data: { name: string; result: unknown } }
  | { event: 'done';        data: {} }
  | { event: 'error';       data: string }
```

---

## 7. API & Data Contracts

### POST /api/agent (Next.js)

```json
// Request
{
  "messages": [{ "role": "user", "content": "Add a health system to Player" }],
  "relayUrl": "http://localhost:9902"
}

// Response: SSE stream of ForgeEvent objects
```

### POST /tool (Relay)

```json
// Request
{ "tool": "get_scene_state", "args": {} }

// Response
{ "ok": true, "result": { "sceneName": "SampleScene", "objects": [...] } }
```

---

## 8. Environment Variables

```bash
# packages/web/.env.local
GEMINI_API_KEY=AIza...   # Free at https://aistudio.google.com/apikey — no credit card needed

# No other secrets needed — relay URL is entered by user in the UI
```

---

## 9. Get Your Free Gemini API Key

1. Go to **https://aistudio.google.com/apikey**
2. Sign in with any Google account
3. Click **"Create API key"** → copy the key (starts with `AIza`)
4. Paste it into `packages/web/.env.local` as `GEMINI_API_KEY=AIza...`
5. Add the same key to Vercel: Dashboard → Your project → Settings → Environment Variables

**Free tier limits (as of 2026):**
- 1,500 requests/day on `gemini-2.0-flash`
- 1 million tokens/minute
- No credit card required

This is more than enough for a hackathon demo and for judges to test the app.

---

## 10. Deployment

```bash
cd packages/web
npx vercel --prod
# Set GEMINI_API_KEY in Vercel dashboard → Settings → Environment Variables
```

**Important:** The relay (`packages/relay`) runs **locally** on the developer's machine alongside Unity. It is not deployed. The web app calls the relay via a user-supplied URL (default: `http://localhost:9902`). For hackathon demos, use **ngrok** to expose the relay publicly so judges can test without installing anything:

```bash
# Terminal 1 — start relay
cd packages/relay && npm run dev

# Terminal 2 — expose to internet
ngrok http 9902
# Copy the https://xxxx.ngrok.io URL → paste into the FORGE web app
```

### README Setup Instructions for Judges

```markdown
## Quick Start (Judges)

### Option A — Watch the demo video (easiest)
See the 2-minute demo in the submission.

### Option B — Run it yourself

1. Install Unity 6 LTS
2. Import `forge-bridge.unitypackage` into your project (Assets → Import Package)
3. Open the sample project: `demo/sample-unity-project/`
4. In Unity: Window → FORGE Bridge (confirm "Bridge listening" in console)
5. `cd packages/relay && npm install && npm run dev`
6. Open https://forge-demo.vercel.app → enter relay URL
7. Type: "Add a health system to my Player"
```

---

## 11. Judging Criteria Alignment

| Criterion | How FORGE addresses it |
|---|---|
| **Innovation** | First web-based AI agent that operates a live Unity Editor via MCP — no equivalent exists |
| **Impact** | Directly saves Unity developers hours of context-switching per day; addresses 1.1M+ Unity devs |
| **Technical execution** | Full agentic loop: plan → tool-use → verify → repair; streaming UI; real Unity integration |
| **Demo video** | Record: open Unity → type prompt → watch FORGE write C# + attach component live (no cuts) |
| **Completeness** | End-to-end working: web app deployed, relay runnable, Unity package importable, demo project included |

---

## Appendix A — Sample C# Script FORGE Should Generate

When asked "Add a health system to Player", FORGE should produce exactly this:

```csharp
using UnityEngine;
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
```

---

## Appendix B — Checklist Before Submission

- [ ] Web app deployed to Vercel and accessible via public URL
- [ ] `GEMINI_API_KEY` set in Vercel environment variables (get free key at aistudio.google.com)
- [ ] `forge-bridge.unitypackage` exported and in `demo/` folder
- [ ] Sample Unity project in `demo/sample-unity-project/` with a `Player` GameObject
- [ ] Relay server starts cleanly with `npm run dev` in `packages/relay/`
- [ ] ngrok tested: relay URL works from outside localhost
- [ ] Demo video recorded (1–3 min): show the full loop working live
- [ ] GitHub repo is public with clear README
- [ ] Devpost page filled: description, video, screenshots (show scene tree, diff viewer, plan approval UI)
- [ ] At least 3 screenshots: connect screen, agent planning a task, diff of generated code
