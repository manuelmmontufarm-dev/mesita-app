import { getDemoTableState } from "@/lib/demo-table-store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> }
): Promise<Response> {
  const { token } = await context.params;
  const encoder = new TextEncoder();
  let lastVersion = 0;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = async () => {
        const state = await getDemoTableState(token);
        if (state.version === lastVersion) return;
        lastVersion = state.version;
        controller.enqueue(
          encoder.encode(`event: state\ndata: ${JSON.stringify(state)}\n\n`)
        );
      };

      await send();
      // 1500ms: SSE only pushes when version changes so reducing the check
      // interval from 500ms cuts Redis reads 3× with no perceptible UX change
      // (client poll at 700–1000ms provides the fast-path for cross-device sync).
      const interval = setInterval(() => {
        void send();
      }, 1500);
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`event: ping\ndata: {}\n\n`));
      }, 15_000);

      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        clearInterval(heartbeat);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
