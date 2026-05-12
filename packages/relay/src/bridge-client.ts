import WebSocket from 'ws';
import { v4 as uuid } from 'uuid';
import { ForgeResponse } from './types.js';

export class BridgeClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, { resolve: (r: ForgeResponse) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  private url: string;
  private connected = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(url: string) {
    this.url = url;
    this.connect();
  }

  private connect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.ws = new WebSocket(this.url);

    this.ws.on('open', () => {
      this.connected = true;
      console.log(`[FORGE Relay] Connected to Unity bridge at ${this.url}`);
    });

    this.ws.on('message', (data) => {
      try {
        const msg: ForgeResponse = JSON.parse(data.toString());
        const pending = this.pending.get(msg.id);
        if (pending) {
          clearTimeout(pending.timer);
          pending.resolve(msg);
          this.pending.delete(msg.id);
        }
      } catch (e) {
        console.error('[FORGE Relay] Failed to parse message from Unity:', e);
      }
    });

    this.ws.on('close', () => {
      this.connected = false;
      this.rejectPending(new Error('Unity bridge disconnected before the tool call completed.'));
      console.log('[FORGE Relay] Unity bridge disconnected. Reconnecting in 3s...');
      this.reconnectTimer = setTimeout(() => this.connect(), 3000);
    });

    this.ws.on('error', (err) => {
      this.connected = false;
      console.error('[FORGE Relay] Unity bridge connection error:', err.message);
    });
  }

  isConnected(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  call(tool: string, args: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.isConnected()) {
        return reject(new Error('Unity Bridge is not connected. Make sure Unity is running with the FORGE Bridge window open.'));
      }

      const id = uuid();

      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Tool call "${tool}" timed out after 15 seconds.`));
      }, 15000);

      this.pending.set(id, {
        timer,
        reject,
        resolve: (r: ForgeResponse) => {
        if (r.ok) resolve(r.result);
        else reject(new Error(r.error ?? 'Unknown Unity error'));
        },
      });

      this.ws!.send(JSON.stringify({ id, tool, args }));
    });
  }

  private rejectPending(error: Error) {
    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }
}
