import type { PreviewScene } from "./catalog";
import { previewKey, staticPreview, referenceScene } from "./catalog";
import type { Bootstrap } from "./types";
import { appUrl, cloudEnabled } from "./runtime";

export class PreviewGallery {
  readonly stats = {
    rendered: 0,
    cacheHits: 0,
    staticHits: 0,
    durations: [] as number[],
  };
  private frame: HTMLIFrameElement;
  private ready: Promise<void>;
  private resolveReady!: () => void;
  private observer: IntersectionObserver;
  private database: Promise<IDBDatabase | null>;
  private memory = new Map<string, string>();
  private queue: {
    key: string;
    scene: PreviewScene;
    image: HTMLImageElement;
    epoch: number;
  }[] = [];
  private active = false;
  private epoch = 0;
  private requestId = 0;
  private rpc = new Map<
    number,
    {
      resolve: (url: string) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private scenes = new WeakMap<HTMLImageElement, PreviewScene>();
  private catalog: Promise<Set<string>>;
  constructor(
    private data: Bootstrap,
    private scrollRoot: HTMLElement,
  ) {
    this.catalog = fetch(
      appUrl(`previews/${data.snapshot}/catalog/manifest.json`),
    )
      .then(async (response) => {
        if (!response.ok) return new Set<string>();
        const manifest = await response.json();
        return new Set<string>(manifest.version === 5 ? manifest.files : []);
      })
      .catch(() => new Set<string>());
    this.ready = new Promise((resolve) => (this.resolveReady = resolve));
    this.frame = document.createElement("iframe");
    this.frame.src = appUrl("previews.html");
    this.frame.className = "preview-renderer";
    this.frame.title = "Catalog preview renderer";
    this.frame.setAttribute("aria-hidden", "true");
    this.frame.tabIndex = -1;
    document.body.append(this.frame);
    window.addEventListener("message", (event) => {
      if (
        event.source !== this.frame.contentWindow ||
        event.origin !== location.origin
      )
        return;
      if (event.data?.type === "forge-preview-ready") {
        this.resolveReady();
        return;
      }
      if (event.data?.type !== "forge-preview-result") return;
      const pending = this.rpc.get(event.data.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.rpc.delete(event.data.id);
      event.data.error
        ? pending.reject(new Error(event.data.error))
        : pending.resolve(event.data.url);
    });
    this.database = new Promise((resolve) => {
      if (!window.indexedDB) {
        resolve(null);
        return;
      }
      const request = indexedDB.open("forge-preview-cache", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("images");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            const image = entry.target as HTMLImageElement;
            this.observer.unobserve(image);
            const scene = this.scenes.get(image);
            if (scene) void this.prepare(image, scene, this.epoch);
          }
      },
      { root: null, rootMargin: "60px" },
    );
  }
  mount(cards: { image: HTMLImageElement; scene: PreviewScene }[]) {
    this.epoch++;
    this.observer.disconnect();
    this.queue = [];
    for (const { image, scene: raw } of cards) {
      const scene = referenceScene(raw, this.data);
      this.scenes.set(image, scene);
      const key = previewKey(scene, this.data.snapshot);
      image.dataset.previewKey = key;
      const cached = this.memory.get(key);
      if (cached) {
        this.stats.cacheHits++;
        this.show(image, key, cached);
      } else this.observer.observe(image);
    }
  }
  private async stored(key: string) {
    if (this.memory.has(key)) return this.memory.get(key);
    const db = await this.database;
    if (!db) return;
    return new Promise<string | undefined>((resolve) => {
      const request = db.transaction("images").objectStore("images").get(key);
      request.onsuccess = () => {
        if (request.result) this.memory.set(key, request.result);
        resolve(request.result);
      };
      request.onerror = () => resolve(undefined);
    });
  }
  private async store(key: string, url: string) {
    this.memory.set(key, url);
    const db = await this.database;
    if (!db) return;
    try {
      const transaction = db.transaction("images", "readwrite");
      transaction.objectStore("images").put(url, key);
    } catch {
      /* thumbnails are optional cache data */
    }
  }
  private show(image: HTMLImageElement, key: string, url: string) {
    if (!image.isConnected || image.dataset.previewKey !== key) return;
    image.src = url;
    image.classList.remove("item-icon");
    image.classList.add("ready");
    image
      .closest("button")
      ?.classList.remove("preview-pending", "preview-failed");
  }
  private async prepare(
    image: HTMLImageElement,
    scene: PreviewScene,
    epoch: number,
  ) {
    const key = previewKey(scene, this.data.snapshot),
      cached = await this.stored(key);
    if (cached) {
      this.stats.cacheHits++;
      this.show(image, key, cached);
      return;
    }
    const preview = staticPreview(
      scene,
      this.data.snapshot,
      await this.catalog,
    );
    const url = preview
      ? appUrl(
          cloudEnabled && import.meta.env.PROD
            ? preview.replace(/\.png$/, ".webp")
            : preview,
        )
      : null;
    if (url) {
      const exists = await new Promise<boolean>((resolve) => {
        const test = new Image();
        test.onload = () => resolve(true);
        test.onerror = () => resolve(false);
        test.src = url;
      });
      if (exists) {
        this.stats.staticHits++;
        this.memory.set(key, url);
        this.show(image, key, url);
        return;
      }
    }
    if (epoch !== this.epoch || !image.isConnected) return;
    this.queue.push({ key, scene, image, epoch });
    void this.pump();
  }
  private async pump() {
    if (this.active) return;
    this.active = true;
    try {
      while (this.queue.length) {
        const viewport = this.scrollRoot.getBoundingClientRect();
        const priority = (job: (typeof this.queue)[number]) => {
          const rect = job.image.getBoundingClientRect();
          return rect.bottom < viewport.top
            ? viewport.top - rect.bottom + 1000
            : rect.top > viewport.bottom
              ? rect.top - viewport.bottom + 1000
              : rect.top - viewport.top;
        };
        this.queue.sort((a, b) => priority(a) - priority(b));
        const job = this.queue.shift()!;
        if (job.epoch !== this.epoch || !job.image.isConnected) continue;
        try {
          const cached = this.memory.get(job.key);
          if (cached) {
            this.stats.cacheHits++;
            this.show(job.image, job.key, cached);
            continue;
          }
          const started = performance.now();
          const url = await this.render(job.scene);
          this.stats.rendered++;
          this.stats.durations.push(performance.now() - started);
          await this.store(job.key, url);
          this.show(job.image, job.key, url);
        } catch (error) {
          if (job.image.isConnected) {
            const button = job.image.closest("button")!;
            button.classList.remove("preview-pending");
            button.classList.add("preview-failed");
            button.title = `${button.getAttribute("aria-label")} — Preview unavailable: ${error instanceof Error ? error.message : String(error)}`;
          }
        }
      }
    } finally {
      this.active = false;
    }
  }
  async render(scene: PreviewScene): Promise<string> {
    let readyTimer: ReturnType<typeof setTimeout>;
    try {
      await Promise.race([
        this.ready,
        new Promise((_, reject) => {
          readyTimer = setTimeout(
            () =>
              reject(
                new Error(
                  "Preview renderer did not start. Reload the workshop.",
                ),
              ),
            30000,
          );
        }),
      ]);
    } finally {
      clearTimeout(readyTimer!);
    }
    const id = ++this.requestId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.rpc.delete(id);
        reject(new Error("Preview timed out."));
      }, 120000);
      this.rpc.set(id, { resolve, reject, timer });
      this.frame.contentWindow!.postMessage(
        { type: "forge-preview", id, scene: referenceScene(scene, this.data) },
        location.origin,
      );
    });
  }
  async clear() {
    this.memory.clear();
    const db = await this.database;
    if (db) db.transaction("images", "readwrite").objectStore("images").clear();
  }
}
