import { existsSync, statSync, openSync, readSync, closeSync } from 'fs';
import { join } from 'path';
import { repoRoot } from '@/lib/benchmark/repo';

export const dynamic = 'force-dynamic';

/**
 * Server-Sent Events stream that tails `benchmark/runs/<releaseId>/events.jsonl`.
 * The dashboard subscribes here to see compile → task → requirement events
 * flow in real time. Closing the browser tab aborts the tail cleanly.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ releaseId: string }> },
) {
  const { releaseId } = await params;
  const path = join(repoRoot(), 'benchmark', 'runs', releaseId, 'events.jsonl');

  const stream = new ReadableStream({
    start(controller) {
      let offset = 0;
      let stopped = false;
      const encoder = new TextEncoder();

      const sendLine = (line: string) => {
        controller.enqueue(encoder.encode(`data: ${line}\n\n`));
      };

      const tick = () => {
        if (stopped) return;
        if (!existsSync(path)) {
          setTimeout(tick, 500);
          return;
        }
        try {
          const size = statSync(path).size;
          if (size > offset) {
            const fd = openSync(path, 'r');
            const buf = Buffer.alloc(size - offset);
            readSync(fd, buf, 0, buf.length, offset);
            closeSync(fd);
            offset = size;
            const chunk = buf.toString('utf-8');
            for (const line of chunk.split('\n')) {
              if (line.trim().length > 0) sendLine(line);
            }
          }
        } catch { /* next tick */ }
        setTimeout(tick, 500);
      };
      tick();

      return () => {
        stopped = true;
      };
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
