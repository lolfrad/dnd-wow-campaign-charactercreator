import { appUrl, cloudEnabled, supabaseUrl } from "./runtime";

export async function initializeModelCache() {
  if (!cloudEnabled || import.meta.env.DEV || !("serviceWorker" in navigator))
    return;
  try {
    const url = appUrl(
      `model-cache.js?assets=${encodeURIComponent(`${supabaseUrl}/functions/v1/model-assets/wow-assets/`)}`,
    );
    await navigator.serviceWorker.register(url, {
      scope: appUrl(""),
      updateViaCache: "none",
    });
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => {
        const ready = () => {
          clearTimeout(timer);
          navigator.serviceWorker.removeEventListener(
            "controllerchange",
            ready,
          );
          resolve();
        };
        const timer = setTimeout(ready, 1500);
        navigator.serviceWorker.addEventListener("controllerchange", ready);
      });
    }
  } catch (error) {
    console.info("Downloaded model cache is unavailable", error);
  }
}

export async function clearModelCache() {
  if (!navigator.serviceWorker?.controller) return;
  const channel = new MessageChannel();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      channel.port1.close();
      reject(new Error("Model cache could not be cleared. Try reloading."));
    }, 5000);
    channel.port1.onmessage = () => {
      clearTimeout(timer);
      channel.port1.close();
      resolve();
    };
    navigator.serviceWorker.controller!.postMessage({ type: "clear-models" }, [
      channel.port2,
    ]);
  });
}
