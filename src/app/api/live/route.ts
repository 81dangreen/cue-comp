import { subscribe } from "@/lib/events";

// Server-Sent Events: pushes a "change" message whenever something in the
// requested tournament (or on the requested table) changes. Clients then
// re-fetch the page via router.refresh().
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tournamentId = url.searchParams.get("tournament");
  const tableId = url.searchParams.get("table");
  const encoder = new TextEncoder();

  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          cleanup();
        }
      };
      send(": connected\n\n");
      const unsubscribe = subscribe((event) => {
        const relevant =
          (!tournamentId && !tableId) ||
          (tournamentId && event.tournamentId === tournamentId) ||
          (tableId && event.tableIds.includes(tableId));
        if (relevant) send(`event: change\ndata: ${JSON.stringify(event)}\n\n`);
      });
      // Keep proxies from closing an idle connection.
      const heartbeat = setInterval(() => send(": ping\n\n"), 25_000);
      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
      };
      request.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
