import { buildPlan, runAgent, type AgentRequest } from '@/lib/agent';

export async function POST(req: Request) {
  const { messages, relayUrl, approved = false } = (await req.json()) as AgentRequest;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event, data })}\n\n`));
      };

      try {
        const lastUserMessage = messages[messages.length - 1]?.content ?? '';

        if (!approved) {
          send('plan', buildPlan(lastUserMessage));
          send('done', {});
          controller.close();
          return;
        }

        await runAgent(messages, relayUrl, send);
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
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
}
