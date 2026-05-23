# FORGE Demo Unity Project

Open this folder directly from Unity Hub:

```text
D:\FORGE\demo\sample-unity-project
```

The FORGE Unity bridge is already included at:

```text
Assets/FORGE/Editor
```

You do not need to copy `packages/bridge/Editor` manually for this demo project.

## Demo Setup

1. Open this folder in Unity Hub with Unity 6 or a recent Unity 2022/2023 LTS editor.
2. Wait for Unity to import/compile the editor scripts.
3. Open `Window > FORGE Bridge`.
4. Confirm the bridge is listening on:

```text
ws://localhost:9901/forge/
```

5. From the repo root, start the relay:

```powershell
npm run dev --workspace packages/relay
```

6. Start the web app:

```powershell
npm run dev --workspace packages/web
```

7. Open the web app and connect to:

```text
http://localhost:9902
```

## Good Demo Prompt

Use this prompt from the web app:

```text
Create a Player GameObject. Create a C# MonoBehaviour named HealthSystem with maxHealth and currentHealth fields, TakeDamage and Heal methods, then attach it to Player.
```

FORGE should show a plan, execute Unity tool calls after approval, create or edit C# code, check compile errors, and update the Unity project.

## Local Model Note

If Gemini is out of quota, keep Ollama running and set the web app `.env.local` to your pulled model:

```env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=phi3:mini
```

For stronger code/tool behavior, `llama3.1:8b` or `qwen2.5-coder:7b` usually works better than `phi3:mini`.
