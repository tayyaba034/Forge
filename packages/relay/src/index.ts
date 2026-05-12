import express from 'express';
import cors from 'cors';
import { BridgeClient } from './bridge-client.js';

const app = express();
app.use(cors());
app.use(express.json());

const UNITY_BRIDGE_URL = process.env.UNITY_BRIDGE_URL ?? 'ws://localhost:9901/forge/';
const PORT = Number(process.env.PORT ?? 9902);

const bridge = new BridgeClient(UNITY_BRIDGE_URL);

// Health / status endpoint
app.get('/status', (_req, res) => {
  res.json({
    relay: 'running',
    unityConnected: bridge.isConnected(),
    unityBridgeUrl: UNITY_BRIDGE_URL,
  });
});

// Main tool proxy endpoint — called by the Next.js web app
app.post('/tool', async (req, res) => {
  const { tool, args } = req.body as { tool: string; args: Record<string, unknown> };

  if (!tool) {
    return res.status(400).json({ ok: false, error: 'Missing "tool" in request body.' });
  }

  if (!bridge.isConnected()) {
    return res.status(503).json({
      ok: false,
      error: 'Unity Bridge is not connected. Open Unity and enable the FORGE Bridge window.',
    });
  }

  try {
    const result = await bridge.call(tool, args ?? {});
    res.json({ ok: true, result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: message });
  }
});

app.listen(PORT, () => {
  console.log(`\n[FORGE Relay] Listening on http://localhost:${PORT}`);
  console.log(`[FORGE Relay] Connecting to Unity at ${UNITY_BRIDGE_URL}\n`);
});
