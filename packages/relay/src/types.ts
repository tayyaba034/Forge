export interface ForgeCommand {
  id: string;
  tool: string;
  args: Record<string, unknown>;
}

export interface ForgeResponse {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export type ForgeEvent =
  | { event: 'text'; data: string }
  | { event: 'tool_call'; data: { name: string; input: unknown } }
  | { event: 'tool_result'; data: { name: string; result: unknown } }
  | { event: 'done'; data: Record<string, never> }
  | { event: 'error'; data: string };
