import $ from "jquery";
import type { Bootstrap, CharacterConfig, Camera, WardrobeItem } from "./types";
import { modelFor } from "./customization";
import { tokenPoses } from "./poses";
import type { Point } from "./token-layout";
import { slotByInventory } from "./equipment";

declare global {
  interface Window {
    jQuery: typeof $;
    $: typeof $;
    CONTENT_PATH: string;
    WOTLK_TO_RETAIL_DISPLAY_ID_API: undefined;
    WH: any;
    ZamModelViewer: any;
  }
}
type Viewer = any;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const transformPoint = (matrix: ArrayLike<number>, point: number[]) =>
  [0, 1, 2, 3].map((row) =>
    point.reduce(
      (sum, value, column) => sum + matrix[column * 4 + row] * value,
      0,
    ),
  );

export class ViewerAdapter {
  private static active?: ViewerAdapter;
  private static nextScope = 0;
  private static assetScopes = new Map<number, ViewerAdapter>();
  private scope = ++ViewerAdapter.nextScope;
  viewer: Viewer;
  private pending = 0;
  private errors: string[] = [];
  private lastActivity = 0;
  private lastValidated = -1;
  private observer?: ResizeObserver;
  private disposed = false;
  private capturing = false;
  private contentPath = "";
  private character = true;
  private npcBaseItems: [number, number][] = [];
  private editableNpc = false;
  private poseSpeed = 1;
  private recordingPose = false;
  private headCenterCache?: {
    vertices: unknown;
    index: number;
    point: number[];
  };
  constructor(
    private host: HTMLElement,
    private data: Bootstrap,
    private catalogMode = false,
  ) {
    ViewerAdapter.assetScopes.set(this.scope, this);
  }

  private static requestOwner(url: URL) {
    if (
      url.origin !== location.origin ||
      !url.pathname.startsWith(window.CONTENT_PATH)
    )
      return;
    const scope = url.pathname
      .slice(window.CONTENT_PATH.length)
      .match(/^view-(\d+)\//)?.[1];
    return scope ? this.assetScopes.get(Number(scope)) : undefined;
  }
  private assetPath(quality: string) {
    return `${window.CONTENT_PATH}view-${this.scope}/q-${quality}/`;
  }

  static async initialize(data: Bootstrap) {
    window.$ = window.jQuery = $;
    window.CONTENT_PATH = `/wow-assets/${data.snapshot}/`;
    window.WOTLK_TO_RETAIL_DISPLAY_ID_API = undefined;
    // Modern binary assets use fetch; metadata still uses jQuery AJAX. Track
    // both, and attribute failures to the loading candidate, never its usable
    // predecessor. Upstream can otherwise report ready after a failed M2 load.
    const fetchAsset = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = new URL(
        input instanceof Request ? input.url : String(input),
        location.href,
      );
      const owner = ViewerAdapter.requestOwner(url);
      if (!owner || owner.disposed) return fetchAsset(input, init);
      owner.pending++;
      owner.lastActivity = performance.now();
      try {
        const response = await fetchAsset(input, init);
        if (!response.ok)
          owner.errors.push(`${url.pathname}: HTTP ${response.status}`);
        return response;
      } catch (error) {
        owner.errors.push(
          `${url.pathname}: ${error instanceof Error ? error.message : String(error)}`,
        );
        throw error;
      } finally {
        owner.pending = Math.max(0, owner.pending - 1);
        owner.lastActivity = performance.now();
      }
    };
    // Textures use raw XHR rather than jQuery and treat an HTTP error body as
    // image data. Catch it before an incomplete model can become active.
    const urls = new WeakMap<XMLHttpRequest, URL>();
    const open = XMLHttpRequest.prototype.open,
      send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (
      method: string,
      url: string | URL,
      async: boolean = true,
      user?: string | null,
      password?: string | null,
    ) {
      urls.set(this, new URL(String(url), location.href));
      return open.call(this, method, url, async, user, password);
    };
    XMLHttpRequest.prototype.send = function (body) {
      const url = urls.get(this),
        owner = url && ViewerAdapter.requestOwner(url);
      if (!owner || owner.disposed || !url) return send.call(this, body);
      owner.pending++;
      owner.lastActivity = performance.now();
      let completed = false;
      const finish = () => {
        if (completed) return;
        completed = true;
        if (this.status >= 400 || this.status === 0)
          owner.errors.push(`${url.pathname}: HTTP ${this.status}`);
        owner.pending = Math.max(0, owner.pending - 1);
        owner.lastActivity = performance.now();
      };
      this.addEventListener("loadend", finish, { once: true });
      try {
        return send.call(this, body);
      } catch (error) {
        finish();
        throw error;
      }
    };
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = window.CONTENT_PATH + "viewer/viewer.min.js";
      script.onload = () => resolve();
      script.onerror = () =>
        reject(
          new Error(
            "The retail viewer script could not load. Check /api/status.",
          ),
        );
      document.head.append(script);
    });
    await import("../../setup.js");
    window.WH.debug = () => {};
  }

  async load(config: CharacterConfig, wardrobe: WardrobeItem[]) {
    if (config.npc) return this.loadNpc(config, wardrobe);
    this.contentPath = this.assetPath(config.settings.textureQuality);
    const { body } = modelFor(config, this.data);
    const response = await fetch(
      `${this.contentPath}meta/charactercustomization/${body.modelId}.json`,
    );
    if (!response.ok)
      throw new Error(
        `Customization metadata failed (HTTP ${response.status}).`,
      );
    const fullOptions = await response.json();
    for (const [optionId, choiceId] of Object.entries(config.customizations)) {
      if (
        !fullOptions.Options?.find(
          (option: any) => option.Id === Number(optionId),
        )?.Choices.some((choice: any) => choice.Id === choiceId)
      )
        throw new Error(
          "Retail catalogue and viewer metadata disagree. Restart with npm run dev:refresh, then reload.",
        );
    }
    if (this.disposed) throw new Error("Viewer was disposed");
    const { WowModelViewer } = await import("../../wow_model_viewer.js");
    const items = this.itemList(config, wardrobe);
    const options = Object.entries(config.customizations).map(
      ([optionId, choiceId]) => ({ optionId: Number(optionId), choiceId }),
    );
    this.viewer = new (WowModelViewer as any)({
      type: 2,
      contentPath: this.contentPath,
      container: $(this.host),
      aspect: this.host.clientWidth / this.host.clientHeight,
      models: { id: body.modelId, type: 16 },
      charCustomization: { options, sheathMain: -1, sheathOff: -1 },
      items,
      hd: true,
      env: "live",
      dataEnv: "live",
      gameDataEnv: "live",
      transparent: true,
    });
    this.viewer.currentCharacterOptions = fullOptions;
    this.viewer.characterRace = config.raceId;
    this.viewer.characterGender = body.gender;
    await this.waitReady();
    this.finishLoad(config);
    await this.waitReady();
    this.refreshPoseCache();
  }
  private async loadNpc(config: CharacterConfig, wardrobe: WardrobeItem[]) {
    const npc = config.npc!;
    this.character = false;
    this.contentPath = this.assetPath(config.settings.textureQuality);
    const response = await fetch(
      `${this.contentPath}meta/npc/${npc.displayId}.json`,
    );
    if (!response.ok)
      throw new Error(
        `${npc.name}: NPC assets unavailable (HTTP ${response.status}).`,
      );
    const metadata = await response.json();
    this.editableNpc = !!metadata.Character;
    this.npcBaseItems = Object.entries(metadata.Equipment ?? {}).map(
      ([slot, id]) => [Number(slot), Number(id)],
    );
    const { WowModelViewer } = await import("../../wow_model_viewer.js");
    this.viewer = new (WowModelViewer as any)({
      type: 2,
      contentPath: this.contentPath,
      container: $(this.host),
      aspect: this.host.clientWidth / this.host.clientHeight,
      models: { id: npc.displayId, type: 8 },
      hd: true,
      env: "live",
      dataEnv: "live",
      gameDataEnv: "live",
      transparent: true,
    });
    await this.waitReady();
    npc.canEquip = this.supportsEquipment();
    // Creature rigs need an actual draw after their bones and materials load.
    // Pausing before that first draw can leave a valid model invisible.
    if (this.catalogMode)
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    if (
      (Object.keys(config.equipment).length ||
        config.hidden.head ||
        config.hidden.shoulders) &&
      npc.canEquip
    )
      await this.equipment(config, wardrobe);
    this.finishLoad(config);
    await this.waitReady();
    this.refreshPoseCache();
  }
  supportsEquipment() {
    return (
      (!this.character ? this.editableNpc : true) &&
      typeof this.viewer?.renderer?.actors[0]?.setItems === "function"
    );
  }
  private finishLoad(config: CharacterConfig) {
    const renderer = this.viewer.renderer;
    if (
      typeof renderer.actors[0].getAnimation !== "function" ||
      typeof renderer.onResize !== "function" ||
      !("makeDataURL" in renderer)
    )
      throw new Error(
        "The upstream viewer API has changed. This asset snapshot needs an adapter update.",
      );
    // An omitted sheath value is treated as sheathed by the upstream fist
    // weapon renderer. Set both public hand controls explicitly.
    if (this.supportsEquipment()) this.viewer.method("setSheath", [-1, -1]);
    this.center();
    const [minimum, maximum] = renderer.actors[0].getBounds();
    const height = maximum[2] - minimum[2],
      width = maximum[0] - minimum[0],
      depth = maximum[1] - minimum[1];
    const tangent = Math.tan((renderer.fov * Math.PI) / 360);
    renderer.distance =
      Math.max(
        height / (2 * tangent),
        width /
          (2 * tangent * (this.host.clientWidth / this.host.clientHeight)),
      ) *
        1.25 +
      depth / 2;
    this.applyPose(config);
    this.animationSpeed(config.token.animation.speed);
    this.camera(config.view);
    // Equipment and animation changes set this flag upstream. Automatic refits
    // must never overwrite a camera the user has already positioned.
    const draw = renderer.draw;
    renderer.draw = (time: number) => {
      renderer.doUpdateBounds = false;
      return draw.call(renderer, time);
    };
    this.observer = new ResizeObserver(() => {
      if (!this.capturing && !this.disposed)
        this.viewer.renderer.onResize(
          Math.round(this.host.clientWidth),
          Math.round(this.host.clientHeight),
          this.host.clientWidth / this.host.clientHeight,
        );
    });
    this.observer.observe(this.host);
    this.activate();
  }

  activate() {
    const r = this.viewer.renderer;
    ViewerAdapter.active = this;
    // Upstream uses one global event namespace. Own these handlers explicitly
    // so replacing or rejecting a renderer cannot leave it referenced forever.
    $(document)
      .off(".webgl")
      .off(".forgeInput")
      .on("mouseup.forgeInput touchend.forgeInput", r.onMouseUp.bind(r))
      .on("mousemove.forgeInput touchmove.forgeInput", r.onMouseMove.bind(r));
    $(window)
      .off(".webgl")
      .off(".forgeInput")
      .on("resize.forgeInput", r.onFullscreen.bind(r));
  }

  private itemList(config: CharacterConfig, wardrobe: WardrobeItem[]) {
    let base = this.npcBaseItems.filter(
      ([slot]) =>
        !(config.hidden.head && slot === 1) &&
        !(config.hidden.shoulders && slot === 3),
    );
    for (const category of Object.keys(config.equipment))
      base = base.filter(([slot]) => slotByInventory[slot] !== category);
    const overrides = Object.entries(config.equipment).flatMap(
      ([category, id]) => {
        if (!id) return [];
        if (
          (category === "head" && config.hidden.head) ||
          (category === "shoulders" && config.hidden.shoulders)
        )
          return [];
        const item = wardrobe.find((item) => item.id === id);
        return item
          ? [
              [
                category === "offHand" && item.category === "mainHand"
                  ? 22
                  : item.viewerSlot,
                item.displayId,
              ],
            ]
          : [];
      },
    );
    return [...base, ...overrides];
  }

  async appearance(config: CharacterConfig) {
    this.errors = [];
    this.lastValidated = -1;
    this.viewer.setNewAppearance({ customizations: config.customizations });
    await this.waitReady();
    this.viewer.method("setSheath", [-1, -1]);
  }

  async equipment(config: CharacterConfig, wardrobe: WardrobeItem[]) {
    if (!this.supportsEquipment())
      throw new Error(
        "This creature has a fixed model. Poses and token exports are available.",
      );
    // Preflight every metadata document before touching the usable character.
    for (const id of Object.values(config.equipment)) {
      if (!id) continue;
      const item = wardrobe.find((item) => item.id === id)!;
      const response = await fetch(this.contentPath + item.metadataPath);
      if (!response.ok)
        throw new Error(
          `${item.name}: assets unavailable (HTTP ${response.status}).`,
        );
    }
    this.errors = [];
    // The current upstream clearSlots string parser mutates options.items using
    // an incorrect index. Clear its bookkeeping first; setItems repopulates it.
    this.lastValidated = -1;
    this.viewer.options.items = [];
    this.viewer.method(
      "clearSlots",
      "1,3,4,5,6,7,8,9,10,16,19,20,21,22,14,13,15,17,23,25,26",
    );
    const items = this.itemList(config, wardrobe).map(([slot, display]) => ({
      slot,
      display,
      visual: 0,
    }));
    this.viewer.method("setItems", [items]);
    await this.waitReady();
    this.viewer.method("setSheath", [-1, -1]);
  }

  animations(): string[] {
    return tokenPoses(this.viewer.getListAnimations());
  }
  allAnimations(): string[] {
    return this.viewer.getListAnimations();
  }
  applyPose(config: CharacterConfig) {
    const animations = this.animations();
    if (!animations.length) {
      config.pose = { animation: "Stand", paused: true };
      return;
    }
    if (!animations.includes(config.pose.animation))
      config.pose.animation = animations.includes("Stand")
        ? "Stand"
        : animations[0];
    this.viewer.setAnimation(config.pose.animation);
    this.viewer.setAnimPaused(config.pose.paused);
    this.lastValidated = -1;
  }
  restart(config: CharacterConfig) {
    this.viewer.method("setAnimation", [config.pose.animation, true]);
    this.pause(config.pose.paused);
    this.lastValidated = -1;
  }
  pause(paused: boolean) {
    this.viewer.setAnimPaused(paused);
  }
  private refreshPoseCache() {
    const model = this.viewer?.renderer?.actors[0]?.c;
    if (!model?.aa) return;
    for (const bone of model.W ?? []) {
      bone.C = bone.x(bone.t ?? model.aa);
      if (bone.a) bone.k = bone.x(bone.a);
    }
  }
  snapshotPose() {
    const state = this.viewer?.renderer?.actors[0]?.c?.aa?.e;
    return state?.a
      ? { name: state.a.h, variant: state.a.f, time: state.b }
      : undefined;
  }
  restorePose(saved: ReturnType<ViewerAdapter["snapshotPose"]>) {
    const model = this.viewer?.renderer?.actors[0]?.c;
    const state = model?.aa?.e;
    if (!saved || state?.a?.h !== saved.name || state.a.f !== saved.variant)
      return;
    state.b = Math.max(0, Math.min(saved.time, state.a.g - 1));
    model.aa.d = 0;
    this.refreshPoseCache();
  }
  animationDuration(animation: string): number | null {
    const sequences = this.viewer?.renderer?.actors[0]?.c?.am?.u;
    const sequence = sequences?.find(
      (entry: any) => entry.h === animation && entry.f === 0,
    );
    return Number.isFinite(sequence?.g) && sequence.g > 0
      ? sequence.g / 1000
      : null;
  }
  animationSpeed(speed: number) {
    this.poseSpeed = speed;
    const model = this.viewer?.renderer?.actors[0]?.c;
    if (!model || typeof model.aJ !== "function" || model.forgeAdvance) return;
    // The pinned renderer expresses skeletal time in milliseconds. Keep
    // particles and material effects on their original clock.
    model.forgeAdvance = model.aJ;
    model.aJ = (state: unknown, milliseconds: number) => {
      if (!this.recordingPose)
        model.forgeAdvance.call(model, state, milliseconds * this.poseSpeed);
    };
  }
  async beginPoseRecording(animation: string) {
    const actor = this.viewer.renderer.actors[0],
      model = actor.c;
    if (!model?.aa?.e || typeof model.aJ !== "function")
      throw new Error(
        "This model does not expose a recordable skeletal animation.",
      );
    const cloneState = (state: any) => ({
      ...state,
      e: { ...state.e },
      b: { ...state.b },
      f: { ...state.f },
    });
    const saved = cloneState(model.aa),
      paused = model.aB,
      subanimations = model.p;
    const restore = () => {
      this.recordingPose = false;
      model.aa = saved;
      model.p = subanimations;
      // Paused bones render their cached local transform rather than the
      // current timeline. Refresh that cache for the restored held frame.
      this.refreshPoseCache();
      this.pause(paused);
    };
    try {
      this.pause(true);
      actor.setAnimNoSubAnim(true);
      actor.setAnimation(animation, false);
      this.lastValidated = -1;
      await this.waitReady();
      model.aa.e.b = 0;
      model.aa.d = 0;
      model.aa.a = 1;
      this.recordingPose = true;
      this.pause(false);
      return {
        advance: (milliseconds: number) => {
          model.forgeAdvance.call(
            model,
            model.aa,
            milliseconds * this.poseSpeed,
          );
          for (const bone of model.W ?? []) {
            if (bone.t)
              model.forgeAdvance.call(
                model,
                bone.t,
                milliseconds * this.poseSpeed,
              );
            if (bone.a)
              model.forgeAdvance.call(
                model,
                bone.a,
                milliseconds * this.poseSpeed,
              );
          }
        },
        restore,
      };
    } catch (error) {
      restore();
      throw error;
    }
  }
  snapshotView() {
    const r = this.viewer.renderer;
    return {
      azimuth: r.azimuth,
      zenith: r.zenith,
      distance: r.distance,
      zoom: { ...r.zoom },
      target: [...r.target],
      translation: [...r.translation],
      fromModel: [...r.translationFromModel],
    };
  }
  restoreView(saved: ReturnType<ViewerAdapter["snapshotView"]>) {
    const r = this.viewer.renderer;
    r.azimuth = saved.azimuth;
    r.zenith = saved.zenith;
    r.distance = saved.distance;
    Object.assign(r.zoom, saved.zoom);
    r.target.set(saved.target);
    r.translation.set(saved.translation);
    r.translationFromModel.set(saved.fromModel);
    r.doUpdateBounds = false;
  }
  camera(camera: Camera) {
    this.center();
    this.viewer.setZenith(
      Math.min(Math.PI - 0.0001, ((90 + camera.elevation) * Math.PI) / 180),
    );
    this.viewer.setAzimuth(((270 + camera.facing) * Math.PI) / 180);
    const zoom = this.viewer.renderer.zoom;
    zoom.target = zoom.current = Math.log(camera.zoom) / Math.log(1.1);
    zoom.rateCurrent = 0;
  }
  private center() {
    const r = this.viewer.renderer;
    const bounds = r.actors[0]?.getBounds();
    if (!bounds?.[0] || !bounds[1]) return;
    for (let index = 0; index < 3; index++)
      r.target[index] = (bounds[0][index] + bounds[1][index]) / 2;
    r.translationFromModel.fill(0);
    r.translation.fill(0);
    r.doUpdateBounds = false;
  }
  readCamera(): Camera {
    const r = this.viewer.renderer;
    return {
      elevation: (r.zenith * 180) / Math.PI - 90,
      facing: ((((r.azimuth * 180) / Math.PI - 270) % 360) + 360) % 360,
      zoom: Math.min(4, Math.max(0.3, Math.pow(1.1, r.zoom.current))),
    };
  }
  async waitReady(timeout = 90000) {
    if (
      this.lastValidated === this.lastActivity &&
      this.pending === 0 &&
      !this.errors.length &&
      !Object.keys(this.viewer?.renderer?.downloads ?? {}).length &&
      this.viewer?.renderer?.actors[0]?.isLoaded()
    )
      return;
    timeout = this.catalogMode ? Math.min(timeout, 20000) : timeout;
    const start = performance.now();
    let stable = 0;
    while (performance.now() - start < timeout) {
      if (this.disposed) throw new Error("Viewer was disposed");
      if (this.errors.length)
        throw new Error(
          `Retail asset failed: ${this.errors[0]}. Check /api/status and retry.`,
        );
      const actor = this.viewer?.renderer?.actors[0];
      if (
        actor?.isLoaded() &&
        (!this.character || actor.getNumAnimations() > 0) &&
        this.pending === 0 &&
        Object.keys(this.viewer.renderer.downloads ?? {}).length === 0 &&
        performance.now() - this.lastActivity > (this.catalogMode ? 40 : 300)
      ) {
        if (++stable >= (this.catalogMode ? 2 : 4)) {
          this.lastValidated = this.lastActivity;
          return;
        }
      } else stable = 0;
      await delay(this.catalogMode ? 20 : 100);
    }
    throw new Error(
      "Retail assets did not finish loading within 90 seconds. Check the connection and /api/status.",
    );
  }

  /** Reuse the viewer's dual-background alpha capture, not canvas.toDataURL. */
  async capture(
    size: number,
    camera: Camera,
    focus?: "head" | "face" | "upper" | "feet" | "waist",
  ): Promise<string> {
    return (await this.captureFrame(size, camera, focus)).url;
  }
  async captureFrame(
    size: number,
    camera: Camera,
    focus?: "head" | "face" | "upper" | "feet" | "waist",
  ): Promise<{ url: string; head: Point | null }> {
    if (this.capturing) throw new Error("A capture is already in progress.");
    await this.waitReady();
    this.capturing = true;
    const r = this.viewer.renderer;
    const saved = {
      width: r.width,
      height: r.height,
      azimuth: r.azimuth,
      zenith: r.zenith,
      zoom: { ...r.zoom },
      distance: r.distance,
      doUpdateBounds: r.doUpdateBounds,
      target: [...r.target],
      translation: [...r.translation],
      fromModel: [...r.translationFromModel],
    };
    const restore = () => {
      r.onResize(saved.width, saved.height, saved.width / saved.height);
      r.azimuth = saved.azimuth;
      r.zenith = saved.zenith;
      Object.assign(r.zoom, saved.zoom);
      r.distance = saved.distance;
      r.doUpdateBounds = saved.doUpdateBounds;
      r.target.set(saved.target);
      r.translation.set(saved.translation);
      r.translationFromModel.set(saved.fromModel);
      this.capturing = false;
    };
    try {
      r.onResize(size, size, 1);
      // The native zoom control clamps at 0.3. Expand camera distance for
      // oversized weapons/effects when alpha framing requests a wider shot.
      r.distance = saved.distance * Math.max(1, 0.3 / camera.zoom);
      this.camera({ ...camera, zoom: Math.max(0.3, camera.zoom) });
      if (focus) {
        const [min, max] = r.actors[0].getBounds(),
          height = max[2] - min[2];
        const region = {
          head: [0.84, 0.44],
          face: [0.88, 0.27],
          upper: [0.7, 0.58],
          feet: [0.12, 0.34],
          waist: [0.44, 0.45],
        }[focus];
        const head =
          focus === "head" || focus === "face" ? this.headWorld() : null;
        if (head) r.target.set(head.slice(0, 3));
        else r.target[2] = min[2] + height * region[0];
        r.distance = saved.distance * region[1];
      }
      return await new Promise<{ url: string; head: Point | null }>(
        (resolve, reject) => {
          const timer = setTimeout(() => {
            r.screenshotCallback = null;
            restore();
            reject(
              new Error("The renderer did not return a PNG within 20 seconds."),
            );
          }, 20000);
          r.screenshotCallback = () => {
            clearTimeout(timer);
            const url = r.screenshotDataURL;
            const head = this.projectHead(size);
            restore();
            url?.startsWith("data:image/png")
              ? resolve({ url, head })
              : reject(new Error("The renderer returned an empty capture."));
          };
          r.makeDataURL = ["image/png"];
        },
      );
    } catch (error) {
      if (this.capturing) restore();
      throw error;
    }
  }
  private headWorld(): number[] | null {
    // Guarded adapter for this pinned viewer snapshot. The key-bone lookup's
    // head entry is 6; j is its skinning matrix and f its bind-space pivot.
    const r = this.viewer.renderer,
      model = r.actors[0]?.c;
    const index = model?.am?.Z?.[6];
    const pivot = model?.am?.j?.[index]?.f,
      bone = model?.W?.[index]?.j;
    if (!pivot || !bone || !model.i) return null;
    const vertices = model.am.h;
    let cached = this.headCenterCache;
    if (!cached || cached.vertices !== vertices || cached.index !== index) {
      const samples: number[][] = [[], [], []];
      if (Array.isArray(vertices)) {
        const stride = Math.max(1, Math.floor(vertices.length / 16000));
        for (let i = 0; i < vertices.length; i += stride) {
          const vertex = vertices[i];
          if (!vertex?.i || !vertex.f || !vertex.a) continue;
          if (
            ![0, 1, 2, 3].some(
              (j) => vertex.f[j] === index && vertex.a[j] >= 192,
            )
          )
            continue;
          for (let axis = 0; axis < 3; axis++)
            if (Number.isFinite(vertex.i[axis]))
              samples[axis].push(vertex.i[axis]);
        }
      }
      // Trim hair/ear outliers. Animation bounds include jumps and effects,
      // so they cannot provide a useful estimate of the skull's center.
      const point = samples.map((values, axis) => {
        if (values.length < 8) return pivot[axis];
        values.sort((a, b) => a - b);
        return (
          (values[Math.floor(values.length * 0.15)] +
            values[Math.floor(values.length * 0.85)]) /
          2
        );
      });
      cached = this.headCenterCache = { vertices, index, point };
    }
    let point = [...cached.point, 1];
    for (const matrix of [bone, model.i]) point = transformPoint(matrix, point);
    return point.every(Number.isFinite) ? point : null;
  }
  private projectHead(size: number): Point | null {
    if (this.catalogMode) return null;
    const r = this.viewer.renderer;
    let point = this.headWorld();
    if (!point || !r.viewMatrix || !r.projMatrix) return null;
    for (const matrix of [r.viewMatrix, r.projMatrix])
      point = transformPoint(matrix, point);
    if (!point.every(Number.isFinite) || point[3] <= 0) return null;
    return {
      x: ((point[0] / point[3] + 1) * size) / 2,
      y: ((1 - point[1] / point[3]) * size) / 2,
    };
  }
  dispose() {
    this.disposed = true;
    ViewerAdapter.assetScopes.delete(this.scope);
    this.observer?.disconnect();
    if (ViewerAdapter.active === this) {
      $(document).off(".forgeInput");
      $(window).off(".forgeInput");
      ViewerAdapter.active = undefined;
    }
    const gl = this.viewer?.renderer?.context;
    this.viewer?.destroy();
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    this.host.remove();
    this.viewer = null;
  }
  maximumCaptureSize() {
    const gl = this.viewer?.renderer?.context;
    return Math.min(
      4096,
      gl ? gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) : 2048,
    );
  }
  async poseFrame(animation: string, ms = 280) {
    this.pause(true);
    this.viewer.method("setAnimation", [animation, true]);
    this.lastValidated = -1;
    await this.waitReady();
    this.pause(false);
    await delay(ms);
    this.pause(true);
  }
  async loadItem(item: WardrobeItem) {
    this.character = false;
    this.contentPath = this.assetPath("low");
    const { WowModelViewer } = await import("../../wow_model_viewer.js");
    this.viewer = new (WowModelViewer as any)({
      type: 2,
      contentPath: this.contentPath,
      container: $(this.host),
      aspect: 1,
      models: { id: item.displayId, type: 1 },
      items: [],
      hd: true,
      transparent: true,
      env: "live",
      dataEnv: "live",
      gameDataEnv: "live",
    });
    await this.waitReady();
    this.center();
    const r = this.viewer.renderer,
      [min, max] = r.actors[0].getBounds();
    r.distance =
      (Math.max(max[2] - min[2], max[0] - min[0], max[1] - min[1]) /
        (2 * Math.tan((r.fov * Math.PI) / 360))) *
      1.5;
    this.camera({ elevation: 10, facing: 30, zoom: 1 });
  }
}
