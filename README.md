# FORGE - Unity Coding Agent

FORGE is a Unity coding agent built for the Next Byte Hacks V2 spec. It connects a Next.js chat UI to a live Unity Editor through a local WebSocket relay, then uses Gemini 2.0 Flash function calling to inspect scenes, create and edit C# scripts, attach/configure components, and automatically check Unity compile status.

FORGE can run from the browser web app or from the Unity Editor chat window. This repo also includes a ready-to-open demo Unity project so the full loop can be tested without creating a project from scratch.

## Features

- Unity-aware chat agent with plan approval before tool execution.
- Animated plan steps that move through pending, active, and done states.
- Local WebSocket relay between the web app and Unity Editor.
- Scene hierarchy viewer and live tool call log.
- C# script creation and editing with syntax-highlighted diff previews.
- Auto-fix loop after `create_script` or `edit_script`: FORGE checks compile errors, sends errors plus source code back to the model, and retries fixes up to 3 times.
- Voice input using the browser Web Speech API.
- Prompt chips for common tasks: health system, enemy patrol, compile fixes, and score UI.
- Session replay saved in `localStorage`, with a History panel for reviewing past runs.
- Running Gemini token counter in the status bar.
- Ollama fallback when Gemini fails due to quota, network, or API errors.
- Sample Unity project under `demo/sample-unity-project` with the bridge already installed.

## Repository Layout

- `packages/web`: Next.js App Router app with chat UI, `/api/agent` SSE route, `/api/tools`, Tailwind, plan approval, diff viewer, status bar, history replay, and voice input.
- `packages/relay`: Express + `ws` relay on `http://localhost:9902`, forwarding tool calls to Unity at `ws://localhost:9901/forge/`.
- `packages/bridge`: Unity C# Editor bridge with WebSocket server, tool dispatcher, script/object operations, and `Window > FORGE Chat`.
- `demo/test-flow.ts`: smoke test for the "Add a health system to Player" flow.
- `demo/sample-unity-project`: demo Unity project with `Assets/FORGE/Editor` already copied in.

## Requirements

- Node.js 20+
- npm
- Unity 6 or a compatible Unity Editor version
- Gemini API key
- Optional: Ollama for local fallback

## Quick Start

Install dependencies from the repo root:

```bash
npm install
```

Create the web app environment file:

```bash
cp packages/web/.env.example packages/web/.env.local
```

Set at least:

```env
GEMINI_API_KEY=YOUR_GEMINI_API_KEY
GEMINI_MODEL=gemini-2.0-flash
```

Optional Ollama fallback:

```env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b
```

If using Ollama:

```bash
ollama pull llama3.1:8b
```

## Option A: Use the Demo Unity Project

Open this folder from Unity Hub:

```text
D:\FORGE\demo\sample-unity-project
```

The demo project already includes the FORGE editor bridge at:

```text
Assets/FORGE/Editor
```

After Unity finishes importing:

1. Open `Window > FORGE Bridge`.
2. Confirm the bridge is listening on `ws://localhost:9901/forge/`.
3. Start the relay and web app from the repo root.

## Option B: Add FORGE to an Existing Unity Project

Import `packages/bridge` into your Unity project, or copy its `Editor` folder into:

```text
Assets/FORGE/Editor
```

In Unity:

1. Open `Window > FORGE Bridge` to start/check the WebSocket bridge.
2. Open `Window > FORGE Chat` if you want the in-Editor cloud chat.
3. Make sure the bridge is listening on `ws://localhost:9901/forge/`.

For the Unity Editor chat window, make the Gemini key available to Unity:

```powershell
$env:GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
```

You can also paste the key into `Window > FORGE Chat` and click `Save Settings`.

## Browser App Flow

Start the local relay:

```bash
npm run dev --workspace packages/relay
```

Start the web app:

```bash
npm run dev --workspace packages/web
```

Open the web app and connect to:

```text
http://localhost:9902
```

Try:

```text
Create a Player GameObject, then add a health system to it
```

FORGE will:

1. Propose a plan.
2. Wait for approval.
3. Execute Unity tool calls.
4. Show live plan progress.
5. Render generated C# in the diff viewer.
6. Check compile errors automatically.
7. Retry fixes up to 3 times if Unity reports compile errors.
8. Save the completed run to History.

## Tool Surface

The Unity bridge supports:

- `get_scene_state`
- `get_object_components`
- `create_gameobject`
- `delete_gameobject`
- `duplicate_gameobject`
- `rename_gameobject`
- `save_as_prefab`
- `instantiate_prefab`
- `create_script`
- `edit_script`
- `set_component_property`
- `get_compile_errors`
- `enter_play_mode`
- `exit_play_mode`

## Demo Smoke Test

With Unity and the relay running against a scene containing a `Player` GameObject:

```bash
npm run test:flow
```

Custom relay URL:

```powershell
$env:FORGE_RELAY_URL="http://localhost:9902"; npm run test:flow
```

## Common Scripts

From the repo root:

```bash
npm run dev
npm run build
npm run test:flow
```

Package-specific commands:

```bash
npm run dev --workspace packages/relay
npm run dev --workspace packages/web
npm run lint --workspace packages/web
npx tsc --noEmit --workspace packages/web
```

## Verification

For the web app:

```bash
npm run lint --workspace packages/web
npx tsc --noEmit --workspace packages/web
```

`next build` may need network access because the default Next font setup fetches Geist from Google Fonts.

## Notes

- The relay is intentionally local for hackathon/demo safety.
- For remote judging, expose port `9902` with ngrok and paste the public relay URL into the web app.
- The agent tries Gemini first. If Gemini fails, it switches to Ollama and shows `Switched to local model` in the status bar.
- Browser voice input requires a browser that supports `window.SpeechRecognition` or `window.webkitSpeechRecognition`.
- Session replay is stored in browser `localStorage`; it replays the visible tool log without re-running Unity operations.
- Detailed compiler diagnostics still depend on what Unity reports through the bridge and the Unity Console.

## Future VS Code Extension

FORGE can be wrapped as a VS Code sidebar experience, similar to Copilot/Codex, by adding a `packages/vscode-extension` package that:

- Opens FORGE in a VS Code sidebar webview.
- Starts the relay and web app from VS Code commands.
- Stores Gemini/Ollama settings in VS Code settings or secrets.
- Shows Unity connection status inside the sidebar.
- Provides commands such as `FORGE: Start Agent`, `FORGE: Open Sidebar`, and `FORGE: Connect to Unity`.
