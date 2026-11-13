import { cloudEnabled, appUrl, apiUrl } from "./runtime";
let worker: Worker | undefined,
  sequence = 0;
const pending = new Map<
  number,
  {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
export async function dataRequest(path: string): Promise<Response> {
  if (!cloudEnabled) return fetch(apiUrl(path));
  if (path === "/api/bootstrap") return fetch(appUrl("data/bootstrap.json"));
  if (!worker) {
    worker = new Worker(new URL("./catalog-worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = ({ data }) => {
      const request = pending.get(data.id);
      if (!request) return;
      clearTimeout(request.timer);
      pending.delete(data.id);
      data.error
        ? request.reject(new Error(data.error))
        : request.resolve(data.result);
    };
    worker.onerror = () => {
      for (const request of pending.values()) {
        clearTimeout(request.timer);
        request.reject(
          new Error("The catalog could not start. Reload the workshop."),
        );
      }
      pending.clear();
      worker?.terminate();
      worker = undefined;
    };
  }
  const id = ++sequence;
  try {
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("Catalog request timed out."));
      }, 60000);
      pending.set(id, { resolve, reject, timer });
      worker!.postMessage({ id, path });
    });
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 503 },
    );
  }
}
