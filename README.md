# FORGE

FORGE is a browser-based Unity coding agent for the Next Byte Hacks V2 spec. The web app connects to a local Node relay, the relay talks to a Unity Editor WebSocket bridge, and the agent can read the scene, create/edit scripts, attach/configure components, and check compile status.

## What Is Implemented

- `packages/web`: Next.js App Router UI with relay connection, chat, plan approval, scene tree, diff previews, status bar, `/api/agent`, and `/api/tools`.
- `packages/relay`: Express + `ws` relay on `http://localhost:9902`, proxying `POST /tool` to Unity at `ws://localhost:9901/forge/`.
- `packages/bridge`: Unity Editor bridge package with the core tool dispatcher.
- `demo/test-flow.ts`: smoke test for the “Add a health system to Player” demo flow.

## Quick Start

1. Add a Gemini key and optional Ollama fallback settings:

```bash
cp packages/web/.env.example packages/web/.env.local
# edit packages/web/.env.local and set GEMINI_API_KEY
```

If Gemini quota is exhausted, FORGE can fall back to local Ollama. Install Ollama, then pull the configured model:

```bash
ollama pull llama3.1:8b
```

Keep Ollama running at `http://localhost:11434`. The default env values are:

```env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b
```

2. Import `packages/bridge` into a Unity 6 project, or copy its `Editor` folder into `Assets/FORGE/Editor`.

3. Start the relay:

```bash
npm run dev --workspace packages/relay
```

4. Start the web app:

```bash
npm run dev --workspace packages/web
```

5. Open the web app, keep the relay URL as `http://localhost:9902`, and prompt:

```text
Add a health system to my Player GameObject
```

FORGE will first show a plan. Click `Approve & Execute` to let it call Unity tools.

## Tool Surface

The bridge supports the hackathon core tools:

- `get_scene_state`
- `get_object_components`
- `set_component_property`
- `create_script`
- `edit_script`
- `get_compile_errors`
- `enter_play_mode`
- `exit_play_mode`

## Demo Smoke Test

With Unity and the relay running against a scene containing a `Player` GameObject:

```bash
npm run test:flow
```

Set a custom relay URL with:

```bash
$env:FORGE_RELAY_URL="http://localhost:9902"; npm run test:flow
```

## Notes

- The relay is intentionally local. For remote judging, expose `9902` with ngrok and paste the public URL into the web app.
- The agent tries Gemini first, then Ollama if Gemini fails. If both are unavailable, the health-system demo prompt can still run through a deterministic local fallback.
- `get_compile_errors` can only report Unity compile state at a high level; detailed compiler diagnostics still live in the Unity Console.
- A generated `.unitypackage`, screenshots, and demo video still need to be produced as submission artifacts.
