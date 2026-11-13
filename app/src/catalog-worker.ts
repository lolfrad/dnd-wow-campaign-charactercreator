import { StaticCatalog, type StaticCatalogIndex } from "./static-catalog";
import { appUrl } from "./runtime";
const catalog = fetch(appUrl("data/catalog.json")).then(async (r) => {
  if (!r.ok) throw new Error("The equipment catalog could not load.");
  return new StaticCatalog(
    (await r.json()) as StaticCatalogIndex,
    async (file) => {
      const response = await fetch(appUrl(`data/${file}`));
      if (!response.ok)
        throw new Error("The equipment catalog could not load.");
      return response.json();
    },
  );
});
self.addEventListener("message", async (event) => {
  const { id, path } = event.data;
  try {
    self.postMessage({ id, result: await (await catalog).request(path) });
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
