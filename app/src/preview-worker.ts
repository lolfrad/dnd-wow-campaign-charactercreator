import { ViewerAdapter } from "./viewer-adapter";
import { sceneConfig, headGroup } from "./catalog";
import type { PreviewScene } from "./catalog";
import type { Bootstrap, CharacterConfig, WardrobeItem } from "./types";
import { modelFor } from "./customization";
import { renderToken, renderThumbnail } from "./token";
import wardrobeData from "./data/wardrobe.json";

const wardrobe: WardrobeItem[] = wardrobeData;
const data: Bootstrap = await (await fetch("/api/bootstrap")).json();
await ViewerAdapter.initialize(data);
let adapter: ViewerAdapter | undefined,
  current: CharacterConfig | undefined,
  itemMode = false,
  counter = 0;
let releaseTimer: ReturnType<typeof setTimeout>;
function host() {
  const node = document.createElement("div");
  node.id = `preview-${++counter}`;
  node.className = "preview-host";
  document.body.append(node);
  return node;
}
async function render(scene: PreviewScene) {
  clearTimeout(releaseTimer);
  if (scene.kind === "gear") {
    let item = wardrobe.find((i) => i.id === scene.itemId);
    if (!item) {
      const response = await fetch(
        `/api/catalog/item/${encodeURIComponent(scene.itemId)}`,
      );
      if (response.ok) {
        item = await response.json();
        wardrobe.push(item!);
      }
    }
    if (!item) throw new Error("Unknown wardrobe preview.");
    if (item.weaponType) {
      adapter?.dispose();
      adapter = new ViewerAdapter(host(), data, true);
      current = undefined;
      itemMode = true;
      await adapter.loadItem(item);
      const config = sceneConfig(scene, data);
      return (await renderToken(adapter, config, 256, true)).url;
    }
  }
  const config = sceneConfig(scene, data);
  if (scene.kind === "gear") {
    const item = wardrobe.find((i) => i.id === scene.itemId)!;
    config.equipment = { [item.category]: item.id };
  }
  if (
    !adapter ||
    itemMode ||
    !current ||
    current.npc?.displayId !== config.npc?.displayId ||
    modelFor(current, data).body.modelId !== modelFor(config, data).body.modelId
  ) {
    adapter?.dispose();
    adapter = new ViewerAdapter(host(), data, true);
    itemMode = false;
    await adapter.load(config, wardrobe);
  } else {
    if (
      JSON.stringify(current.customizations) !==
      JSON.stringify(config.customizations)
    )
      await adapter.appearance(config);
    if (
      JSON.stringify(current.equipment) !== JSON.stringify(config.equipment) ||
      JSON.stringify(current.hidden) !== JSON.stringify(config.hidden)
    )
      await adapter.equipment(config, wardrobe);
    if (
      scene.kind !== "pose" &&
      current.pose.animation !== config.pose.animation
    ) {
      adapter.applyPose(config);
      await adapter.waitReady();
    }
  }
  current = structuredClone(config);
  if (scene.kind === "pose") await adapter.poseFrame(scene.animation);
  let focus: "head" | "face" | "upper" | "feet" | "waist" | undefined;
  if (scene.kind === "appearance") {
    const option = data.options[modelFor(config, data).body.modelId]?.find(
      (o) => o.id === scene.optionId,
    );
    if (option && headGroup(option))
      focus = /necklace/i.test(option.name)
        ? "upper"
        : /horn|antler/i.test(option.name)
          ? "head"
          : "face";
  }
  if (scene.kind === "gear") {
    const item = wardrobe.find((i) => i.id === scene.itemId)!;
    if (item.category === "head") focus = "head";
    if (item.category === "shoulders" || item.category === "hands")
      focus = "upper";
    if (item.category === "feet") focus = "feet";
    if (item.category === "waist") focus = "waist";
    if (item.category === "cloak") config.token.facing = 180;
  }
  if (focus)
    return adapter.capture(256, { elevation: 0, facing: 10, zoom: 1 }, focus);
  return (await renderThumbnail(adapter, config)).url;
}
let chain = Promise.resolve();
window.addEventListener("message", (event) => {
  if (
    event.source !== parent ||
    event.origin !== location.origin ||
    event.data?.type !== "forge-preview"
  )
    return;
  const { id, scene } = event.data;
  chain = chain.then(async () => {
    try {
      const url = await render(scene);
      parent.postMessage(
        { type: "forge-preview-result", id, url },
        location.origin,
      );
    } catch (error) {
      adapter?.dispose();
      adapter = undefined;
      current = undefined;
      parent.postMessage(
        {
          type: "forge-preview-result",
          id,
          error: error instanceof Error ? error.message : String(error),
        },
        location.origin,
      );
    }
    releaseTimer = setTimeout(() => {
      adapter?.dispose();
      adapter = undefined;
      current = undefined;
      itemMode = false;
    }, 60000);
  });
});
parent.postMessage({ type: "forge-preview-ready" }, location.origin);
