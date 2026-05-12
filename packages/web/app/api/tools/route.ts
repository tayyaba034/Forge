export async function POST(req: Request) {
  const { relayUrl = 'http://localhost:9902', tool, args = {} } = await req.json();

  if (!tool) {
    return Response.json({ ok: false, error: 'Missing "tool".' }, { status: 400 });
  }

  try {
    const relayResponse = await fetch(`${relayUrl}/tool`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool, args }),
    });
    const data = await relayResponse.json();
    return Response.json(data, { status: relayResponse.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: message }, { status: 502 });
  }
}
