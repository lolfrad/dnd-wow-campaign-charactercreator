import "./style.css";
import { ViewerAdapter } from "./viewer-adapter";
import {
  availableOptions,
  normalizeAppearance,
  modelFor,
} from "./customization";
import {
  categories,
  defaultConfig,
  equip,
  STORAGE_KEY,
  validateConfig,
} from "./config";
import { download, renderToken, composeToken } from "./token";
import type { TokenSource } from "./token";
import { PreviewGallery } from "./previews";
import { icon } from "./icons";
import { recordAnimatedToken } from "./animated-token";
import { weaponTypes, expansionNames } from "./equipment";
import { apiBase, apiUrl, appUrl, isPages } from "./runtime";
import {
  armorSlots,
  bodyName,
  groupLabels,
  headGroup,
  poseGroup,
} from "./catalog";
import type { Section, PreviewScene } from "./catalog";
import wardrobeData from "./data/wardrobe.json";
import type {
  Bootstrap,
  CharacterConfig,
  Category,
  Option,
  WardrobeItem,
  TextureQuality,
  NpcEntry,
} from "./types";

const wardrobe: WardrobeItem[] = wardrobeData;
const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
const esc = (text: unknown) =>
  String(text).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const humanize = (text: string) => text.replace(/([a-z])([A-Z0-9])/g, "$1 $2");
const sections: Section[] = [
  "npc",
  "race",
  "head",
  "body",
  "armor",
  "weapons",
  "poses",
  "token",
  "settings",
];
const labels: Record<Section, string> = {
  npc: "NPC",
  race: "Race",
  head: "Head",
  body: "Body",
  armor: "Armor",
  weapons: "Weapons",
  poses: "Poses",
  token: "Token",
  settings: "Settings",
};
let data: Bootstrap,
  config: CharacterConfig,
  adapter: ViewerAdapter,
  previews: PreviewGallery;
let section: Section = "race",
  group = "hair",
  bodyGroup = "skin",
  optionId = 0,
  slot: Category = "chest",
  weaponSlot: Category = "mainHand";
let search = "",
  armorType = "all",
  weaponType = "all",
  hands = 0,
  poseFilter = "all",
  preferredGender = 0,
  background = "checker";
let busy = false,
  generation = 0,
  previewing: Promise<void> | null = null,
  previewTimer: ReturnType<typeof setTimeout>,
  dragTimer: ReturnType<typeof setTimeout>;
let tokenUrl = "",
  history: CharacterConfig[] = [],
  future: CharacterConfig[] = [];
let notificationTimer: ReturnType<typeof setTimeout>;
let tokenSource: TokenSource | undefined,
  tokenSourceKey = "";
let tokenPlacement = { anchor: { x: 160, y: 160 }, tracked: false };
let lastRecorded: CharacterConfig | undefined,
  historyGroup = "",
  historyTime = 0;
let npcCategory = "all",
  npcFamily = "all",
  quality = "all",
  expansion = "all",
  catalogPage = 0;
let catalogInfo: {
  expansions: { id: number; name: string }[];
  families: string[];
  weaponTypes: string[];
  counts: { items: number; npcs: number };
};
type CatalogueResult = {
  items: (WardrobeItem | NpcEntry)[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  facets?: {
    type: string[];
    hands: number[];
    quality: number[];
    expansion: number[];
  };
};
let variations:
  | {
      id: string;
      slot: Category;
      items: WardrobeItem[];
      loading: boolean;
      error: string;
    }
  | undefined;
let variationRequest = 0;
const catalogCache = new Map<string, CatalogueResult>(),
  npcEntries = new Map<string, NpcEntry>();
let catalogRequest = 0,
  requestedCatalog = "",
  catalogError = "",
  searchTimer: ReturnType<typeof setTimeout>;
let recording: AbortController | undefined;
const openTokenSections = new Set(["zoom"]);
function tokenSection(id: string, label: string, content: string) {
  return `<details class="token-section" data-token-section="${id}" ${openTokenSections.has(id) ? "open" : ""}><summary>${label}</summary><div class="token-section-content">${content}</div></details>`;
}
const verifiedModels = new Set([1, 2, 4, 11]);

$("#app").innerHTML = `
<header class="topbar"><a class="brand" href="${appUrl("")}" aria-label="Token Forge">${icon("shield", 26)}<span>Token Forge</span></a>
 <div class="document-name"><div class="document-title"><input id="character-name" aria-label="Character name" maxlength="80" value="New adventurer"><span id="save-dot" class="save-dot" title="Browser draft"></span></div><span class="document-status" id="document-status">Browser draft</span></div>
 <nav class="document-actions" aria-label="Character files"><button id="new-character" class="document-button" title="New character" aria-label="New character" disabled>${icon("plus", 17)}<span>New</span></button><button id="import-json" class="document-button" title="Load character JSON" aria-label="Import character" disabled>${icon("import", 17)}<span>Load JSON</span></button><button id="save-json" class="document-button" title="Save character JSON" aria-label="Save character JSON" disabled>${icon("save", 17)}<span>Save JSON</span></button></nav>
 <div class="header-actions"><button id="undo" class="icon-button" title="Undo" aria-label="Undo" disabled>${icon("undo", 19)}</button><button id="redo" class="icon-button" title="Redo" aria-label="Redo" disabled>${icon("redo", 19)}</button><span class="separator"></span><button id="export-png" class="primary compact" disabled>${icon("export", 18)}<span>Export</span></button></div>
</header>
<main class="app-shell">
 <nav class="category-rail" aria-label="Creator categories">${sections.map((id) => `<button data-section="${id}" class="category-button ${id === "race" ? "selected" : ""}" aria-label="${labels[id]}" title="${labels[id]}" aria-pressed="${id === "race"}">${icon(id, 27)}<span>${labels[id]}</span></button>`).join("")}</nav>
 <section class="workspace" aria-label="Character viewport"><div class="viewport-heading"><span id="character-subtitle">Loading…</span><button id="current-pose" data-section="poses" title="Choose pose">Stand</button></div>
  <div id="stage" class="stage"><div id="viewer-mount"></div><div id="loading" class="loading-overlay"><span class="spinner"></span><strong id="loading-label">Loading…</strong><button id="cancel-recording" class="secondary" hidden>Cancel</button></div></div>
  <div class="viewport-tools"><div class="tool-group">${[
    ["front", "front", "Front"],
    ["side", "side", "Side"],
    ["overhead", "overhead", "Overhead"],
    ["tilted", "tilted", "Tilted"],
  ]
    .map(
      ([id, svg, name]) =>
        `<button data-view="${id}" class="icon-button ${id === "front" ? "selected" : ""}" title="${name}" aria-label="${name} view">${icon(svg, 21)}</button>`,
    )
    .join(
      "",
    )}<span class="separator"></span><button id="reset-view" class="icon-button" title="Reset view" aria-label="Reset view">${icon("reset", 20)}</button></div>
   <div class="tool-group"><button id="zoom-out" class="icon-button" title="Zoom out" aria-label="Zoom out">${icon("minus", 19)}</button><button id="zoom-in" class="icon-button" title="Zoom in" aria-label="Zoom in">${icon("plus", 19)}</button></div>
   <div class="tool-group"><button id="pause" class="icon-button" title="Play animation" aria-label="Play animation" disabled>${icon("play", 20)}</button><button id="restart-pose" class="icon-button" title="Restart pose" aria-label="Restart pose" disabled>${icon("reset", 18)}</button></div>
  </div>
  <button class="token-peek checker" data-section="token" title="Token preview" aria-label="Open token controls"><img id="token-peek" alt="Token preview" hidden><span>${icon("token", 15)}</span></button>
  <div class="viewport-hint">Drag to rotate · Scroll to zoom</div><span id="pose-status" class="sr-only" aria-live="polite"></span>
 </section>
 <aside id="item-variations" class="variations-panel" aria-label="Item variations" hidden></aside>
 <aside class="catalog-panel"><div class="catalog-heading"><span id="catalog-icon">${icon("race", 22)}</span><h1 id="catalog-title">Race</h1><button id="randomize" class="icon-button" title="Randomize appearance" aria-label="Randomize appearance">${icon("random", 20)}</button></div><div id="catalog-toolbar"></div><div id="catalog-scroll" class="catalog-scroll"><div id="catalog-content"></div></div></aside>
</main><div id="notification" class="notification" role="status" hidden><span></span><button id="dismiss-notification" class="icon-button" aria-label="Dismiss">${icon("clear", 17)}</button></div><input id="json-file" type="file" accept=".json,application/json" hidden><span id="save-state" class="sr-only" aria-live="polite"></span>`;

function notify(message: string, error = false) {
  clearTimeout(notificationTimer);
  const node = $("#notification");
  node.hidden = false;
  node.classList.toggle("error", error);
  node.querySelector("span")!.textContent = message;
  if (!error) notificationTimer = setTimeout(() => (node.hidden = true), 3500);
}
function persist(group: string | false = "") {
  if (lastRecorded && JSON.stringify(lastRecorded) !== JSON.stringify(config)) {
    if (group !== false) {
      if (!group || group !== historyGroup || Date.now() - historyTime > 650) {
        history.push(lastRecorded);
        if (history.length > 80) history.shift();
      }
      future = [];
      historyGroup = group;
      historyTime = Date.now();
    } else historyGroup = "";
  }
  lastRecorded = structuredClone(config);
  $("#undo").toggleAttribute("disabled", busy || !history.length);
  $("#redo").toggleAttribute("disabled", busy || !future.length);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    $("#save-dot").title = "Draft saved in this browser";
    $("#document-status").textContent = "Browser draft";
    $("#save-state").textContent = "Draft saved in this browser";
  } catch {
    $("#save-dot").title = "Use Save JSON";
    $("#document-status").textContent = "Download to keep changes";
  }
}
function setBusy(value: boolean, label = "Loading…") {
  busy = value;
  $("#loading").hidden = !value;
  $("#loading-label").textContent = label;
  document
    .querySelectorAll<HTMLButtonElement>(
      ".choice-card,#new-character,#save-json,#import-json,#export-png,#pause,#restart-pose,#randomize,#undo,#redo,#record-animation",
    )
    .forEach((node) => (node.disabled = value));
  if (!value && config) {
    $("#undo").toggleAttribute("disabled", !history.length);
    $("#redo").toggleAttribute("disabled", !future.length);
    $("#pause").toggleAttribute("disabled", !adapter?.animations().length);
    $("#restart-pose").toggleAttribute(
      "disabled",
      !adapter?.animations().length,
    );
  }
  document
    .querySelector("#cancel-recording")
    ?.toggleAttribute("hidden", !recording);
}
function header() {
  const { race, body } = modelFor(config, data);
  $("#character-subtitle").textContent = config.npc
    ? `${config.npc.name} · ${config.npc.family}`
    : `${race.name} · ${bodyName(body.gender)}`;
  if (body.gender < 2) preferredGender = body.gender;
  if (document.activeElement !== $("#character-name"))
    $<HTMLInputElement>("#character-name").value = config.name;
  $("#current-pose").textContent = humanize(config.pose.animation);
  $("#pause").innerHTML = icon(config.pose.paused ? "play" : "pause", 20);
  $("#pause").setAttribute(
    "aria-label",
    config.pose.paused ? "Play animation" : "Hold pose",
  );
  $("#pause").title = config.pose.paused ? "Play animation" : "Hold pose";
  $("#pose-status").textContent = config.pose.paused
    ? "Pose held for export"
    : "Animation playing";
  document.querySelectorAll<HTMLElement>("[data-section]").forEach((n) => {
    if (n.classList.contains("category-button")) {
      n.classList.toggle("selected", n.dataset.section === section);
      n.setAttribute("aria-pressed", String(n.dataset.section === section));
    }
  });
  $("#undo").toggleAttribute("disabled", busy || !history.length);
  $("#redo").toggleAttribute("disabled", busy || !future.length);
  for (const id of ["head", "body", "armor", "weapons"]) {
    const unavailable =
      !!config.npc && (["head", "body"].includes(id) || !config.npc.canEquip);
    const button = document.querySelector<HTMLButtonElement>(
      `.category-button[data-section="${id}"]`,
    )!;
    button.disabled = unavailable;
    button.title = unavailable
      ? "This model has a fixed appearance"
      : labels[id as Section];
  }
}
function navigate(next: Section) {
  section = next;
  search = "";
  optionId = 0;
  catalogPage = 0;
  catalogError = "";
  header();
  renderCatalog();
  $("#catalog-scroll").scrollTop = 0;
}
function chip(
  attribute: string,
  value: string,
  label: string,
  selected: boolean,
  title = label,
) {
  return `<button ${attribute}="${esc(value)}" class="chip ${selected ? "selected" : ""}" aria-pressed="${selected}" title="${esc(title)}">${esc(label)}</button>`;
}
function iconChip(
  attribute: string,
  value: string,
  label: string,
  selected: boolean,
  glyph = value,
) {
  return `<button ${attribute}="${esc(value)}" class="chip icon-chip ${selected ? "selected" : ""}" aria-label="${esc(label)}" aria-pressed="${selected}" title="${esc(label)}">${icon(glyph, 20)}</button>`;
}
function catalogueKey() {
  const params = new URLSearchParams({ page: String(catalogPage), q: search });
  if (section === "npc") {
    params.set("category", npcCategory);
    params.set("family", npcFamily);
  } else {
    params.set("slot", section === "weapons" ? weaponSlot : slot);
    params.set("type", section === "weapons" ? weaponType : armorType);
    params.set("hands", section === "weapons" ? String(hands) : "0");
    params.set("quality", quality);
    params.set("expansion", expansion);
  }
  return `/api/catalog/${section === "npc" ? "npcs" : "items"}?${params}`;
}
function rememberItems(items: WardrobeItem[]) {
  for (const item of items) {
    const index = wardrobe.findIndex((existing) => existing.id === item.id);
    if (index < 0) wardrobe.push(item);
    else wardrobe[index] = { ...wardrobe[index], ...item };
  }
}
async function hydrateEquipment(value: unknown) {
  const equipment = (value as { equipment?: Record<string, unknown> })
    ?.equipment;
  if (!equipment || typeof equipment !== "object") return;
  const ids = [
    ...new Set(
      Object.values(equipment).filter(
        (id): id is string =>
          typeof id === "string" && /^look-\d+-\d+$/.test(id),
      ),
    ),
  ].slice(0, 13);
  const results = await Promise.all(
    ids.map(async (id) => {
      if (wardrobe.some((item) => item.id === id)) return;
      const response = await fetch(apiUrl(`/api/catalog/item/${id}`));
      if (response.ok) rememberItems([await response.json()]);
    }),
  );
  void results;
}
function requestCatalogue(key: string) {
  if (requestedCatalog === key) return;
  requestedCatalog = key;
  catalogError = "";
  const request = ++catalogRequest;
  void fetch(apiUrl(key))
    .then(async (response) => {
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Catalogue unavailable");
      catalogCache.set(key, result);
      if (catalogCache.size > 60)
        catalogCache.delete(catalogCache.keys().next().value!);
      if (key.startsWith("/api/catalog/npcs"))
        for (const npc of result.items) npcEntries.set(npc.id, npc);
      else rememberItems(result.items);
      if (request === catalogRequest && catalogueKey() === key)
        renderCatalog(section === "npc");
    })
    .catch((error) => {
      if (request === catalogRequest) {
        catalogError = String(error.message);
        renderCatalog(true);
      }
    });
}
async function showVariations(item: WardrobeItem, activeSlot: Category) {
  if ((item.variantCount ?? 1) < 2) {
    variations = undefined;
    renderCatalog();
    return;
  }
  const request = ++variationRequest;
  variations = {
    id: item.id,
    slot: activeSlot,
    items: [],
    loading: true,
    error: "",
  };
  renderCatalog();
  try {
    const response = await fetch(
      apiUrl(`/api/catalog/variants/${encodeURIComponent(item.id)}`),
    );
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Variations unavailable");
    if (
      request !== variationRequest ||
      !variations ||
      variations.id !== item.id
    )
      return;
    rememberItems(result.items);
    variations.items = result.items;
  } catch (error) {
    if (request !== variationRequest || !variations) return;
    variations.error = error instanceof Error ? error.message : String(error);
  }
  if (request === variationRequest && variations) {
    variations.loading = false;
    renderCatalog();
  }
}
function cataloguePage(result?: CatalogueResult) {
  if (!result)
    return `<div class="empty-state" role="status">${catalogError ? esc(catalogError) : '<span class="spinner"></span>'}</div>`;
  return `<div class="catalog-pagination"><button data-page="${catalogPage - 1}" class="icon-button" aria-label="Previous page" title="Previous page" ${catalogPage === 0 ? "disabled" : ""}>${icon("previous", 18)}</button><span>${result.total.toLocaleString()} · ${catalogPage + 1} / ${Math.max(1, Math.ceil(result.total / result.pageSize))}</span><button data-page="${catalogPage + 1}" class="icon-button" aria-label="Next page" title="Next page" ${result.hasMore ? "" : "disabled"}>${icon("next", 18)}</button></div>`;
}
function searchBox(label: string) {
  return `<div class="search-box">${icon("search", 18)}<input id="catalog-search" type="search" placeholder="${label}" aria-label="${label}" value="${esc(search)}"></div>`;
}
function card(
  label: string,
  attributes: string,
  selected: boolean,
  scene: PreviewScene | undefined,
  extra = "",
) {
  return `<button class="choice-card ${selected ? "selected" : ""} ${scene ? "preview-pending" : "empty-card"}" ${attributes} aria-label="${esc(label)}" aria-pressed="${selected}" title="${esc(label)}" data-label="${esc(label)}">${scene ? '<img alt="" draggable="false">' : icon("empty", 34)}${selected ? `<span class="selection-check">${icon("check", 13)}</span>` : ""}${extra}<span class="tile-label">${esc(label)}</span></button>`;
}
function bodyOptions(options: Option[]) {
  return options.filter((o) => !headGroup(o));
}
function bodyGroupFor(option: Option) {
  return /skin|fur color|fur pattern/i.test(option.name)
    ? "skin"
    : /tattoo|paint|marking|scar/i.test(option.name)
      ? "tattoos"
      : /size|build|posture|bulk|body/i.test(option.name)
        ? "build"
        : "details";
}
function renderCatalog(keepToolbar = false) {
  if (!config) return;
  $("#catalog-title").textContent = labels[section];
  $("#catalog-icon").innerHTML = icon(section, 22);
  $("#randomize").hidden =
    !!config.npc || !["head", "body", "race"].includes(section);
  const content = $("#catalog-content"),
    toolbar = $("#catalog-toolbar");
  const cards: { scene: PreviewScene; index: number }[] = [];
  let html = "",
    tools = "";
  const add = (
    label: string,
    attributes: string,
    selected: boolean,
    scene: PreviewScene,
    extra = "",
  ) => {
    cards.push({ scene, index: cards.length });
    return card(
      label,
      `${attributes} data-preview-index="${cards.length - 1}"`,
      selected,
      scene,
      extra,
    );
  };
  if (section === "npc") {
    tools = `<div class="subcategories">${[
      ["all", "All"],
      ["creature", "Creatures"],
      ["npc", "NPCs"],
      ["boss", "Bosses"],
    ]
      .map(([id, label]) =>
        chip("data-npc-category", id, label, npcCategory === id),
      )
      .join(
        "",
      )}</div>${searchBox("Search NPCs & creatures")}<div class="catalog-selects"><select id="npc-family" aria-label="Creature type"><option value="all">All types</option>${(catalogInfo?.families ?? []).map((family) => `<option value="${esc(family)}" ${npcFamily === family ? "selected" : ""}>${esc(family)}</option>`).join("")}</select></div>`;
    const key = catalogueKey(),
      result = catalogCache.get(key);
    if (!result) requestCatalogue(key);
    html =
      `<div class="choice-grid npc-grid">${((result?.items as NpcEntry[]) ?? []).map((npc) => add(npc.name, `data-npc="${npc.id}"`, config.npc?.id === npc.id, { kind: "npc", npc }, `<span class="npc-kind" title="${esc(npc.family)}">${icon(npc.category, 14)}</span>`)).join("")}</div>` +
      cataloguePage(result);
    if (result && !result.items.length)
      html =
        '<div class="empty-state">No matches</div>' + cataloguePage(result);
  } else if (section === "race") {
    const { body } = modelFor(config, data);
    tools = `<div class="body-selector" aria-label="Body selection">${chip("data-gender", "0", "Male", preferredGender === 0)}${chip("data-gender", "1", "Female", preferredGender === 1)}${body.gender > 1 ? '<span class="neutral-body">Single body</span>' : ""}</div>`;
    html =
      '<div class="choice-grid races">' +
      data.races
        .map((race) => {
          const b =
            race.bodies.find((b) => b.gender === preferredGender) ??
            race.bodies[0];
          const tested = verifiedModels.has(b.modelId);
          return add(
            race.name,
            `data-race="${race.id}" data-body="${b.id}"`,
            !config.npc && config.raceId === race.id,
            { kind: "race", raceId: race.id, bodyId: b.id },
            tested
              ? ""
              : '<span class="coverage-mark" title="Available; full workflow unverified">·</span>',
          );
        })
        .join("") +
      "</div>";
  } else if (section === "head" || section === "body") {
    const all = availableOptions(config, data),
      head = section === "head";
    const options = head ? all.filter((o) => headGroup(o)) : bodyOptions(all);
    const availableGroups = [
      ...new Set(options.map((o) => (head ? headGroup(o)! : bodyGroupFor(o)))),
    ];
    let selectedGroup = head ? group : bodyGroup;
    if (!availableGroups.includes(selectedGroup))
      selectedGroup = availableGroups[0] ?? "";
    if (head) group = selectedGroup;
    else bodyGroup = selectedGroup;
    const inGroup = options.filter(
      (o) => (head ? headGroup(o) : bodyGroupFor(o)) === selectedGroup,
    );
    const option = inGroup.find((o) => o.id === optionId) ?? inGroup[0];
    if (option) optionId = option.id;
    const bodyLabels: Record<string, string> = {
      skin: "Skin",
      tattoos: "Tattoos",
      build: "Build",
      details: "Details",
    };
    tools = `<div class="subcategories">${availableGroups.map((id) => chip("data-group", id, (head ? groupLabels : bodyLabels)[id] ?? id, id === selectedGroup)).join("")}</div>`;
    if (inGroup.length > 1)
      tools += `<div class="option-tabs">${inGroup.map((o) => chip("data-option-tab", String(o.id), o.name.replace(/Hair |Facial |Skin |Fur /g, ""), o.id === optionId, o.name)).join("")}</div>`;
    if (!option) html = '<div class="empty-state">No options</div>';
    else {
      const colors = option.choices.every(
        (c) => typeof c.color === "string" && /^[a-f0-9]{6}$/i.test(c.color),
      );
      html =
        `<div class="gallery-caption">${esc(option.name)}</div><div class="choice-grid ${colors ? "color-grid" : "appearance-grid"}">` +
        option.choices
          .map((choice, index) => {
            const label = choice.name || `${option.name} ${index + 1}`,
              selected = config.customizations[option.id] === choice.id;
            if (colors)
              return `<button class="choice-card color-card ${selected ? "selected" : ""}" data-option="${option.id}" data-choice="${choice.id}" aria-label="${esc(label)}" aria-pressed="${selected}" title="${esc(label)}" data-label="${esc(label)}"><span class="color-swatch" style="background:#${choice.color}"></span>${selected ? `<span class="selection-check">${icon("check", 13)}</span>` : ""}<span class="tile-label">${esc(label)}</span></button>`;
            return add(
              label,
              `data-option="${option.id}" data-choice="${choice.id}"`,
              selected,
              {
                kind: "appearance",
                config,
                optionId: option.id,
                choiceId: choice.id,
              },
            );
          })
          .join("") +
        "</div>";
    }
  } else if (section === "armor" || section === "weapons") {
    const weapons = section === "weapons",
      activeSlot = weapons ? weaponSlot : slot;
    const key = catalogueKey(),
      result = catalogCache.get(key),
      facets = result?.facets;
    if (!result) requestCatalogue(key);
    tools = `<div class="slot-strip" aria-label="Equipment slots">${(weapons ? categories.filter((c) => c.id === "mainHand" || c.id === "offHand") : categories.filter((c) => armorSlots.includes(c.id))).map((c) => iconChip("data-slot", c.id, c.label, c.id === activeSlot)).join("")}</div>`;
    tools += searchBox(weapons ? "Search weapons" : "Search armor");
    if (weapons) {
      const types = [
        ...new Set([...Object.values(weaponTypes), "shield", "held"]),
      ].filter((type) =>
        (facets?.type ?? catalogInfo.weaponTypes).includes(type),
      );
      tools += `<div class="filter-strip icon-filters" aria-label="Weapon types">${["all", ...types].map((type) => iconChip("data-weapon-type", type, type === "all" ? "All weapon types" : humanize(type[0].toUpperCase() + type.slice(1)), weaponType === type)).join("")}</div>${(facets?.hands.length ?? 2) > 1 ? `<div class="hand-filters">${iconChip("data-hands", "0", "All grips", hands === 0, "all")}${!facets || facets.hands.includes(1) ? iconChip("data-hands", "1", "One-handed", hands === 1, "oneHand") : ""}${!facets || facets.hands.includes(2) ? iconChip("data-hands", "2", "Two-handed", hands === 2, "twoHand") : ""}</div>` : ""}`;
    } else {
      const materials = [
        "cloth",
        "leather",
        "mail",
        "plate",
        "cosmetic",
      ].filter((type) => facets?.type.includes(type));
      tools += `${materials.length > 1 ? `<div class="filter-strip icon-filters" aria-label="Armor materials">${["all", ...materials].map((type) => iconChip("data-armor-type", type, type === "all" ? "All armor materials" : type[0].toUpperCase() + type.slice(1), armorType === type)).join("")}</div>` : ""}<div class="visibility-controls"><label title="Hide helmet"><input id="hide-head" aria-label="Hide helmet" type="checkbox" ${config.hidden.head ? "checked" : ""}>${icon("head", 17)}</label><label title="Hide shoulders"><input id="hide-shoulders" aria-label="Hide shoulders" type="checkbox" ${config.hidden.shoulders ? "checked" : ""}>${icon("shoulders", 17)}</label></div>`;
    }
    const qualities = [
      "Poor",
      "Common",
      "Uncommon",
      "Rare",
      "Epic",
      "Legendary",
      "Artifact",
      "Heirloom",
    ];
    tools += `<div class="catalog-refinements">${(facets?.quality.length ?? 0) > 1 ? `<div class="rarity-filters" aria-label="Item quality">${iconChip("data-quality", "all", "All qualities", quality === "all", "all")}${qualities.map((label, id) => (facets!.quality.includes(id) ? `<button data-quality="${id}" class="chip icon-chip rarity quality-${id} ${quality === String(id) ? "selected" : ""}" aria-label="${label}" title="${label}" aria-pressed="${quality === String(id)}">${icon("gem", 17)}</button>` : "")).join("")}</div>` : ""}<select id="catalog-expansion" aria-label="Expansion"><option value="all">All expansions</option>${(
      catalogInfo?.expansions ?? []
    )
      .filter(
        (e) =>
          !facets ||
          facets.expansion.includes(e.id) ||
          expansion === String(e.id),
      )
      .map(
        (e) =>
          `<option value="${e.id}" ${expansion === String(e.id) ? "selected" : ""}>${esc(e.name)}</option>`,
      )
      .join("")}</select></div>`;
    const items = (result?.items ?? []) as WardrobeItem[];
    html =
      '<div class="choice-grid gear-grid">' +
      card(
        `Unequip ${categories.find((c) => c.id === activeSlot)?.label}`,
        `data-item=""`,
        config.npc
          ? config.equipment[activeSlot] === ""
          : !config.equipment[activeSlot],
        undefined,
      ) +
      items
        .map((item) =>
          add(
            item.name,
            `data-item="${item.id}" data-quality-value="${item.quality ?? 0}"`,
            config.equipment[activeSlot] === item.id ||
              (!!item.groupId &&
                item.groupId ===
                  wardrobe.find(
                    (entry) => entry.id === config.equipment[activeSlot],
                  )?.groupId),
            { kind: "gear", itemId: item.id },
            (item.variantCount ?? 1) > 1
              ? `<span class="variation-count">${item.variantCount} variations</span>`
              : "",
          ),
        )
        .join("") +
      "</div>";
    html += cataloguePage(result);
    if (result && !items.length)
      html += '<div class="empty-state">No matches</div>';
  } else if (section === "poses") {
    const groups = {
      all: "All",
      idle: "Idle",
      combat: "Combat",
      emotes: "Emotes",
      magic: "Magic",
    };
    tools =
      searchBox("Search poses") +
      `<div class="filter-strip">${Object.entries(groups)
        .map(([id, label]) =>
          chip("data-pose-filter", id, label, poseFilter === id),
        )
        .join("")}</div>`;
    const favorites = [
      "Stand",
      "Ready1H",
      "Ready2H",
      "ReadyUnarmed",
      "EmoteWave",
      "SpellCastOmni",
    ];
    const poses = adapter
      .animations()
      .filter(
        (name) =>
          (poseFilter === "all" || poseGroup(name) === poseFilter) &&
          humanize(name).toLowerCase().includes(search.toLowerCase()),
      )
      .sort((a, b) => {
        const ai = favorites.indexOf(a),
          bi = favorites.indexOf(b);
        return (
          (ai < 0 ? 1000 : ai) - (bi < 0 ? 1000 : bi) || a.localeCompare(b)
        );
      });
    html =
      '<div class="choice-grid pose-grid">' +
      poses
        .map((animation) =>
          add(
            humanize(animation),
            `data-pose="${esc(animation)}"`,
            config.pose.animation === animation,
            { kind: "pose", config, animation },
          ),
        )
        .join("") +
      "</div>";
    if (!poses.length) html = '<div class="empty-state">No matches</div>';
  } else if (section === "token") {
    tools = "";
    html = `<div class="token-editor"><div class="token-preview ${background}" id="token-background" tabindex="0" role="group" aria-label="Token position. Drag or use arrow keys. Home centers the head." title="Drag to position · Arrow keys to nudge"><img id="token-preview" alt="Live transparent token preview" draggable="false" ${tokenUrl ? `src="${tokenUrl}"` : "hidden"}><span class="token-pivot" aria-hidden="true"></span></div><div class="token-position-tools"><button id="center-head" class="chip ${config.token.anchor === "head" ? "selected" : ""}" title="Center head">${icon("head", 16)} Center head</button><button id="center-figure" class="chip ${config.token.anchor === "figure" ? "selected" : ""}" title="Fit figure">${icon("front", 16)} Fit figure</button><span>Drag to position</span></div><div class="background-options"><button data-background="checker" class="swatch checker ${background === "checker" ? "selected" : ""}" title="Checkerboard" aria-label="Checkerboard background"></button><button data-background="light" class="swatch light ${background === "light" ? "selected" : ""}" title="Light" aria-label="Light background"></button><button data-background="dark" class="swatch dark ${background === "dark" ? "selected" : ""}" title="Dark" aria-label="Dark background"></button></div>
   <div class="segmented">${chip("data-token-view", "90", "Overhead", config.token.elevation === 90)}${chip("data-token-view", "75", "Tilted", config.token.elevation === 75)}</div>
   ${slider("token-elevation", "Elevation", 0, 90, config.token.elevation, "°")}${slider("token-facing", "Facing", 0, 360, config.token.facing, "°")}
   ${tokenSection("zoom", "Zoom & framing", `${slider("token-zoom", "Framing", 50, 400, config.token.zoom * 100, "%")}${slider("token-padding", "Padding", 0, 24, config.token.padding, "%")}<p class="settings-hint">Zoom above 100% to crop closer. Drag the token to position the part you want to keep.</p>`)}
   ${tokenSection("outline", "Outline", `<div class="setting-row"><label for="outline-enabled">Enable outline</label><input id="outline-enabled" type="checkbox" role="switch" ${config.token.outline.enabled ? "checked" : ""}></div><div class="segmented" aria-label="Outline style">${chip("data-outline-style", "crisp", "Crisp", config.token.outline.style === "crisp")}${chip("data-outline-style", "soft", "Soft glow", config.token.outline.style === "soft")}</div><div class="outline-controls"><input id="outline-color" type="color" aria-label="Outline color" value="${config.token.outline.color}">${slider("outline-width", "Width", 1, 12, config.token.outline.width, "px")}</div>`)}
   ${tokenSection("shadow", "Shadow", `<div class="setting-row"><label for="shadow-enabled">Cast shadow</label><input id="shadow-enabled" type="checkbox" role="switch" ${config.token.shadow.enabled ? "checked" : ""}></div>${slider("shadow-opacity", "Shadow opacity", 0, 100, config.token.shadow.opacity, "%")}<p class="settings-hint">A soft silhouette cast below the character, as if lit from above.</p>`)}
   <div class="segmented">${chip("data-size", "512", "512 × 512", config.token.size === 512)}${chip("data-size", "1024", "1024 × 1024", config.token.size === 1024)}</div><button class="primary wide" id="token-download">${icon("export", 18)} Export PNG</button>
   ${tokenSection("animation", `${icon("film", 17)} Animated token`, `<div class="segmented">${chip("data-animation-format", "webm", "WebM", config.token.animation.format === "webm", "Transparent video")}${chip("data-animation-format", "webp", "WebP", config.token.animation.format === "webp", "Animated image")}</div><div class="animation-options"><div class="segmented" aria-label="Animation length">${chip("data-duration", "pose", "Full pose", config.token.animation.duration === "pose")}${chip("data-duration", "2", "2 s", config.token.animation.duration === 2)}${chip("data-duration", "4", "4 s", config.token.animation.duration === 4)}</div><div class="segmented" aria-label="Animation frame rate">${chip("data-fps", "12", "12 fps", config.token.animation.fps === 12)}${chip("data-fps", "20", "20 fps", config.token.animation.fps === 20)}</div></div><p class="settings-hint" id="pose-duration">${poseDurationLabel()}</p><div class="setting-row"><label for="animate-pose">Animate pose</label><input id="animate-pose" type="checkbox" role="switch" ${config.token.animation.includePose ? "checked" : ""}></div><fieldset class="pose-speed" ${config.token.animation.includePose ? "" : "disabled"}>${slider("animation-speed", "Pose speed", 25, 200, config.token.animation.speed * 100, "%")}</fieldset><p class="settings-hint">100% is normal speed. Lower values slow the pose. Equipment effects keep their own speed.</p><button class="secondary wide" id="record-animation">${icon("record", 17)} Export animation</button>`)}<div id="export-status" class="small-status" aria-live="polite"></div></div>`;
  } else if (section === "settings") {
    tools = "";
    html = `<div class="settings-editor"><h2>Textures</h2><div class="setting-options">${[
      ["low", "512", "Performance"],
      ["medium", "1024", "Balanced"],
      ["high", "Native", "Maximum"],
    ]
      .map(
        ([id, title, subtitle]) =>
          `<button class="quality-option ${config.settings.textureQuality === id ? "selected" : ""}" data-texture-quality="${id}" aria-pressed="${config.settings.textureQuality === id}"><strong>${title}</strong><span>${subtitle}</span></button>`,
      )
      .join(
        "",
      )}</div><p class="settings-hint">Native preserves the source textures. Older gear may still have low-resolution artwork.</p><h2>Export quality</h2><div class="setting-options">${[
      [1, "1×", "Standard"],
      [2, "2×", "High"],
      [3, "3×", "Ultra"],
    ]
      .map(
        ([id, title, subtitle]) =>
          `<button class="quality-option ${config.settings.exportScale === id ? "selected" : ""}" data-export-scale="${id}" aria-pressed="${config.settings.exportScale === id}"><strong>${title}</strong><span>${subtitle}</span></button>`,
      )
      .join(
        "",
      )}</div><p class="settings-hint">Larger renders are downsampled to your chosen PNG size.</p><h2>View</h2>${slider("view-elevation", "Elevation", -45, 90, config.view.elevation, "°")}${slider("view-facing", "Facing", 0, 360, config.view.facing, "°")}<button id="clear-previews" class="secondary wide">Refresh previews</button><span class="version">Retail ${esc(data.gameVersion)}</span></div>`;
  }
  if (!keepToolbar) {
    const focused = document.activeElement as HTMLInputElement;
    const focusedId = focused?.closest("#catalog-toolbar") ? focused.id : "";
    const selection =
      focusedId === "catalog-search"
        ? [focused.selectionStart, focused.selectionEnd]
        : undefined;
    toolbar.innerHTML = tools;
    const replacement =
      focusedId && (document.getElementById(focusedId) as HTMLInputElement);
    if (replacement) {
      replacement.focus();
      if (selection) replacement.setSelectionRange(selection[0], selection[1]);
    }
  }
  const variationPanel = $("#item-variations");
  const show =
    !!variations &&
    ["armor", "weapons"].includes(section) &&
    variations.slot === (section === "weapons" ? weaponSlot : slot);
  variationPanel.hidden = !show;
  $(".app-shell").classList.toggle("variations-open", show);
  variationPanel.innerHTML = show
    ? `<div class="catalog-heading"><h2>Variations</h2><button id="close-variations" class="icon-button" aria-label="Close variations">${icon("clear", 17)}</button></div><div class="variations-scroll"><p class="variation-title">${esc(wardrobe.find((item) => item.id === variations!.id)?.name ?? "")}</p>${variations!.loading ? '<span class="spinner"></span>' : variations!.error ? `<p role="alert">${esc(variations!.error)}</p><button data-retry-variations="${esc(variations!.id)}" class="secondary">Retry</button>` : `<div class="choice-grid variation-grid">${variations!.items.map((item, index) => add(`${item.name} · Variation ${index + 1}`, `data-variant="${item.id}" data-item-icon="${item.id}"`, item.id === config.equipment[variations!.slot] || item.displayId === wardrobe.find((entry) => entry.id === config.equipment[variations!.slot])?.displayId, { kind: "gear", itemId: item.id }, `<span class="variation-caption">${esc(expansionNames[item.expansion ?? -1] ?? "Other")} · ${index + 1}</span>`)).join("")}</div>`}</div>`
    : "";
  const scroll = $("#catalog-scroll"),
    position = scroll.scrollTop;
  content.innerHTML = html;
  document
    .querySelectorAll<HTMLImageElement>("[data-item] img, [data-item-icon] img")
    .forEach((image) => {
      const button = image.closest("button") as HTMLElement;
      const id = button.dataset.item ?? button.dataset.itemIcon;
      const item = wardrobe.find((item) => item.id === id);
      if (item?.icon && /^[a-z0-9_-]+$/i.test(item.icon)) {
        image.src = `https://wow.zamimg.com/images/wow/icons/large/${item.icon}.jpg`;
        image.classList.add("item-icon");
      }
    });
  scroll.scrollTop = position;
  previews?.mount(
    cards.map(({ scene, index }) => ({
      scene,
      image: document.querySelector<HTMLImageElement>(
        `[data-preview-index="${index}"] img`,
      )!,
    })),
  );
  if (busy)
    document
      .querySelectorAll<HTMLButtonElement>(".choice-card")
      .forEach((button) => (button.disabled = true));
}
function slider(
  id: string,
  label: string,
  min: number,
  max: number,
  value: number,
  unit: string,
) {
  return `<label class="slider-label" for="${id}">${label}<output id="${id}-value">${Math.round(value)}${unit}</output><input id="${id}" type="range" min="${min}" max="${max}" value="${value}" data-unit="${unit}" aria-label="${label}"></label>`;
}
function poseDurationLabel() {
  const seconds = adapter?.animationDuration(config.pose.animation);
  if (!seconds) return "Pose length unavailable; use a timed export.";
  const fullPose =
    seconds /
    (config.token.animation.includePose ? config.token.animation.speed : 1);
  const duration =
    config.token.animation.duration === "pose"
      ? fullPose
      : config.token.animation.duration;
  const fps = Math.min(
    config.token.animation.fps,
    (config.token.size === 1024 ? 80 : 240) / duration,
  );
  return `Full pose: ${fullPose.toFixed(2)} s${fps < config.token.animation.fps ? ` · Export: ${fps.toFixed(1)} fps for this length and size` : ""}`;
}
document.addEventListener(
  "toggle",
  (event) => {
    const details = event.target as HTMLDetailsElement;
    if (!details.isConnected || !details.dataset.tokenSection) return;
    if (details.open) openTokenSections.add(details.dataset.tokenSection);
    else openTokenSections.delete(details.dataset.tokenSection);
  },
  true,
);
async function replaceViewer(next: CharacterConfig, preserveView = false) {
  const view = preserveView ? adapter?.snapshotView() : undefined;
  const pose = preserveView ? adapter?.snapshotPose() : undefined;
  const host = document.createElement("div");
  host.id = `character-${++generation}`;
  host.className = "viewer-host candidate";
  $("#viewer-mount").append(host);
  const candidate = new ViewerAdapter(host, data);
  try {
    await candidate.load(next, wardrobe);
    if (view) candidate.restoreView(view);
    if (pose) candidate.restorePose(pose);
    const previous = adapter;
    adapter = candidate;
    previous?.dispose();
    host.classList.remove("candidate");
    adapter.activate();
  } catch (error) {
    candidate.dispose();
    adapter?.activate();
    throw error;
  }
}
async function operation(action: () => Promise<void>, record = true) {
  if (busy) return;
  setBusy(true);
  clearTimeout(previewTimer);
  await previewing;
  const before = structuredClone(config);
  tokenSource = undefined;
  try {
    await action();
    header();
    renderCatalog();
    persist(record ? "" : false);
    schedulePreview();
  } catch (error) {
    config = before;
    notify(error instanceof Error ? error.message : String(error), true);
    header();
    renderCatalog();
  } finally {
    setBusy(false);
  }
}
async function changeCharacter(next: CharacterConfig) {
  await operation(async () => {
    const previousMode = !!config.npc;
    next = normalizeAppearance(next, data);
    await replaceViewer(next);
    config = next;
    if (previousMode !== !!next.npc) section = next.npc ? "npc" : "race";
  });
}
async function changeAppearance(next: CharacterConfig) {
  await operation(async () => {
    next = normalizeAppearance(next, data);
    await replaceViewer(next, true);
    config = next;
  });
}
async function changeEquipment(next: CharacterConfig) {
  await operation(async () => {
    // A failed downstream texture/model request can permanently break an
    // upstream renderer. Commit only a fully loaded replacement.
    await replaceViewer(next, true);
    config = next;
  });
}
function schedulePreview(delay = 180) {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => void updatePreview(), delay);
}
async function updatePreview() {
  if (busy || !adapter) return;
  if (previewing) {
    schedulePreview(100);
    return;
  }
  previewing = (async () => {
    try {
      const key = JSON.stringify([
        generation,
        config.customizations,
        config.equipment,
        config.hidden,
        config.pose,
        config.token.elevation,
        config.token.facing,
      ]);
      const result =
        tokenSource && tokenSourceKey === key && config.pose.paused
          ? composeToken(tokenSource, config, 320)
          : await renderToken(adapter, config, 320, true);
      tokenSource = result.source;
      tokenSourceKey = key;
      tokenPlacement = { anchor: result.anchor, tracked: result.tracked };
      showToken(result.url);
    } catch (error) {
      const status = document.querySelector("#export-status");
      if (status)
        status.textContent =
          error instanceof Error ? error.message : String(error);
    }
  })();
  await previewing;
  previewing = null;
  if (!config.pose.paused) schedulePreview(1400);
}
function showToken(url: string) {
  tokenUrl = url;
  for (const selector of ["#token-preview", "#token-peek"]) {
    const image = document.querySelector<HTMLImageElement>(selector);
    if (image) {
      image.src = url;
      image.hidden = false;
    }
  }
}
function composePreview() {
  if (tokenSource) {
    const result = composeToken(tokenSource, config, 320);
    tokenPlacement = { anchor: result.anchor, tracked: result.tracked };
    showToken(result.url);
  } else schedulePreview(0);
}
function filename() {
  return (
    (config.name || "adventurer")
      .replace(/[^a-z0-9_-]+/gi, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 70) || "adventurer"
  );
}
async function exportPng() {
  await operation(async () => {
    const result = await renderToken(adapter, config, config.token.size);
    download(result.url, `${filename()}-${config.token.size}.png`);
    notify("PNG exported");
  }, false);
}
async function exportAnimation() {
  recording = new AbortController();
  await operation(async () => {
    const result = await recordAnimatedToken(
      adapter,
      structuredClone(config),
      recording!.signal,
      (_fraction, label) => {
        $("#loading-label").textContent = label;
      },
    );
    const url = URL.createObjectURL(result.blob);
    download(
      url,
      `${filename()}-${config.token.size}.${config.token.animation.format}`,
    );
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    notify(
      `${config.token.animation.format.toUpperCase()} exported · ${result.frames} frames`,
    );
  }, false);
  recording = undefined;
  $("#cancel-recording").hidden = true;
}
async function applyCamera(camera: CharacterConfig["view"]) {
  await previewing;
  config.view = camera;
  adapter.camera(camera);
  persist("camera");
}
let tokenDrag:
  | {
      id: number;
      x: number;
      y: number;
      width: number;
      offset: { x: number; y: number };
      before: CharacterConfig;
    }
  | undefined;
let positionFrame = 0;
const clampPosition = (value: number) => Math.max(-0.45, Math.min(0.45, value));
function paintPosition() {
  cancelAnimationFrame(positionFrame);
  positionFrame = requestAnimationFrame(composePreview);
}
function positionChanged(before: CharacterConfig) {
  void before;
  persist("position");
  header();
  document
    .querySelector("#center-head")
    ?.classList.toggle("selected", config.token.anchor === "head");
  document
    .querySelector("#center-figure")
    ?.classList.toggle("selected", config.token.anchor === "figure");
}
document.addEventListener("pointerdown", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>(
    "#token-background",
  );
  if (!target || busy || previewing || !tokenSource || event.button !== 0)
    return;
  event.preventDefault();
  clearTimeout(previewTimer);
  tokenDrag = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    width: target.getBoundingClientRect().width,
    offset: { ...config.token.offset },
    before: structuredClone(config),
  };
  if (!config.pose.paused) {
    config.pose.paused = true;
    adapter.pause(true);
    tokenSourceKey = "";
  }
  target.focus({ preventScroll: true });
  target.setPointerCapture(event.pointerId);
  target.classList.add("dragging");
});
document.addEventListener("pointermove", (event) => {
  if (!tokenDrag || tokenDrag.id !== event.pointerId) return;
  config.token.offset = {
    x: clampPosition(
      tokenDrag.offset.x + (event.clientX - tokenDrag.x) / tokenDrag.width,
    ),
    y: clampPosition(
      tokenDrag.offset.y + (event.clientY - tokenDrag.y) / tokenDrag.width,
    ),
  };
  paintPosition();
});
function endTokenDrag(event: PointerEvent) {
  if (!tokenDrag || tokenDrag.id !== event.pointerId) return;
  const before = tokenDrag.before;
  tokenDrag = undefined;
  document.querySelector("#token-background")?.classList.remove("dragging");
  positionChanged(before);
  if (!before.pose.paused) schedulePreview(0);
}
document.addEventListener("pointerup", endTokenDrag);
document.addEventListener("pointercancel", endTokenDrag);
document.addEventListener("keydown", (event) => {
  if (
    (event.target as HTMLElement).id !== "token-background" ||
    busy ||
    !tokenSource
  )
    return;
  const directions: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  };
  if (event.key !== "Home" && !directions[event.key]) return;
  event.preventDefault();
  const before = structuredClone(config);
  if (event.key === "Home") {
    config.token.anchor = "head";
    config.token.offset = { x: 0, y: 0 };
  } else {
    const [x, y] = directions[event.key],
      step = event.shiftKey ? 0.02 : 0.005;
    config.token.offset = {
      x: clampPosition(config.token.offset.x + x * step),
      y: clampPosition(config.token.offset.y + y * step),
    };
  }
  positionChanged(before);
  composePreview();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && recording) {
    recording.abort();
    event.preventDefault();
    return;
  }
  if (!config) return;
  const target = event.target as HTMLElement;
  const editing =
    target.isContentEditable ||
    target.matches(
      "input:not([type=range]):not([type=checkbox]),textarea,select",
    );
  const modifier = event.ctrlKey || event.metaKey;
  let action = "";
  if (modifier && !event.altKey) {
    const key = event.key.toLowerCase();
    if (key === "s") action = "save-json";
    else if (key === "o") action = "import-json";
    else if (!editing && key === "z") action = event.shiftKey ? "redo" : "undo";
    else if (!editing && key === "y") action = "redo";
    else if (!editing && key === "e") action = "export-png";
  } else if (
    !editing &&
    event.code === "Space" &&
    !target.closest("button") &&
    !target.matches("input")
  )
    action = "pause";
  if (action) {
    event.preventDefault();
    if (!busy && !event.repeat) $<HTMLButtonElement>(`#${action}`).click();
  }
});

document.addEventListener("click", async (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("button");
  if (!target || target.hasAttribute("disabled")) return;
  if (target.id === "dismiss-notification") {
    $("#notification").hidden = true;
    return;
  }
  if (target.id === "cancel-recording") {
    recording?.abort();
    return;
  }
  if (!config) return;
  if (target.dataset.section) {
    navigate(target.dataset.section as Section);
    return;
  }
  if (target.dataset.background) {
    background = target.dataset.background;
    renderCatalog();
    return;
  }
  if (target.dataset.group) {
    if (section === "head") group = target.dataset.group;
    else bodyGroup = target.dataset.group;
    optionId = 0;
    renderCatalog();
    $("#catalog-scroll").scrollTop = 0;
    return;
  }
  if (target.dataset.optionTab) {
    optionId = Number(target.dataset.optionTab);
    renderCatalog();
    $("#catalog-scroll").scrollTop = 0;
    return;
  }
  if (target.dataset.slot) {
    if (section === "weapons") {
      weaponSlot = target.dataset.slot as Category;
      if (
        (weaponSlot === "mainHand" &&
          ["shield", "held"].includes(weaponType)) ||
        (weaponSlot === "offHand" && hands === 2)
      ) {
        weaponType = "all";
        hands = 0;
      }
    } else {
      slot = target.dataset.slot as Category;
      armorType = "all";
    }
    quality = "all";
    catalogPage = 0;
    renderCatalog();
    return;
  }
  if (target.dataset.armorType) {
    armorType = target.dataset.armorType;
    catalogPage = 0;
    renderCatalog();
    return;
  }
  if (target.dataset.weaponType) {
    weaponType = target.dataset.weaponType;
    if (weaponType === "shield" || weaponType === "held") {
      weaponSlot = "offHand";
      hands = 1;
    } else if (
      ["staff", "polearm", "bow", "gun", "crossbow", "fishing"].includes(
        weaponType,
      )
    ) {
      weaponSlot = "mainHand";
      hands = 2;
    } else if (
      ["dagger", "fist", "warglaive", "wand", "thrown"].includes(weaponType)
    ) {
      hands = 1;
    }
    catalogPage = 0;
    renderCatalog();
    return;
  }
  if (target.dataset.hands) {
    hands = Number(target.dataset.hands);
    if (hands === 2) {
      weaponSlot = "mainHand";
      if (["shield", "held"].includes(weaponType)) weaponType = "all";
    }
    catalogPage = 0;
    renderCatalog();
    return;
  }
  if (target.dataset.poseFilter) {
    poseFilter = target.dataset.poseFilter;
    renderCatalog();
    $("#catalog-scroll").scrollTop = 0;
    return;
  }
  if (target.dataset.npcCategory) {
    npcCategory = target.dataset.npcCategory;
    catalogPage = 0;
    renderCatalog();
    return;
  }
  if (target.dataset.quality !== undefined) {
    quality = target.dataset.quality;
    catalogPage = 0;
    renderCatalog();
    return;
  }
  if (target.dataset.page !== undefined) {
    catalogPage = Number(target.dataset.page);
    renderCatalog();
    $("#catalog-scroll").scrollTop = 0;
    return;
  }
  if (busy) return;
  if (target.id === "close-variations") {
    variations = undefined;
    variationRequest++;
    renderCatalog();
    return;
  }
  if (target.dataset.retryVariations) {
    const item = wardrobe.find(
      (entry) => entry.id === target.dataset.retryVariations,
    );
    if (item)
      void showVariations(item, section === "weapons" ? weaponSlot : slot);
    return;
  }
  if (target.dataset.variant) {
    if (variations)
      await changeEquipment(
        equip(config, variations.slot, target.dataset.variant, wardrobe),
      );
    return;
  }
  if (target.dataset.npc) {
    const npc = npcEntries.get(target.dataset.npc);
    if (!npc) return;
    const next = structuredClone(config);
    next.npc = structuredClone(npc);
    next.name = npc.name.slice(0, 80);
    next.customizations = {};
    next.equipment = {};
    next.hidden = { head: false, shoulders: false };
    next.pose = { animation: "Stand", paused: true };
    next.view = { elevation: 0, facing: 0, zoom: 1 };
    next.token.anchor = npc.family === "Humanoid" ? "head" : "figure";
    next.token.offset = { x: 0, y: 0 };
    await changeCharacter(next);
    return;
  }
  if (target.dataset.gender !== undefined) {
    preferredGender = Number(target.dataset.gender);
    const { race } = modelFor(config, data),
      body = race.bodies.find((b) => b.gender === preferredGender);
    if (body && (body.id !== config.bodyId || config.npc)) {
      const next = {
        ...structuredClone(config),
        bodyId: body.id,
        customizations: {},
      };
      if (next.npc) {
        next.equipment = {};
        delete next.npc;
      }
      await changeCharacter(next);
    } else renderCatalog();
    return;
  }
  if (target.dataset.race) {
    const next = {
      ...structuredClone(config),
      raceId: Number(target.dataset.race),
      bodyId: Number(target.dataset.body),
      customizations: {},
    };
    if (next.npc) {
      next.equipment = {};
      delete next.npc;
    }
    await changeCharacter(next);
    return;
  }
  if (target.dataset.choice) {
    const next = structuredClone(config);
    next.customizations[target.dataset.option!] = Number(target.dataset.choice);
    await changeAppearance(next);
    return;
  }
  if (target.dataset.item !== undefined) {
    const activeSlot = section === "weapons" ? weaponSlot : slot;
    const item = wardrobe.find((entry) => entry.id === target.dataset.item);
    if (item) void showVariations(item, activeSlot);
    else {
      variations = undefined;
      variationRequest++;
    }
    await changeEquipment(
      equip(config, activeSlot, target.dataset.item, wardrobe),
    );
    return;
  }
  if (target.dataset.pose) {
    await operation(async () => {
      config.pose = { animation: target.dataset.pose!, paused: true };
      await adapter.poseFrame(config.pose.animation);
    });
    return;
  }
  if (target.dataset.view || target.id === "reset-view") {
    const id = target.dataset.view ?? "front";
    await applyCamera({
      elevation: id === "overhead" ? 90 : id === "tilted" ? 65 : 0,
      facing: id === "side" ? 90 : 0,
      zoom: 1,
    });
    document
      .querySelectorAll<HTMLElement>("[data-view]")
      .forEach((n) => n.classList.toggle("selected", n.dataset.view === id));
    return;
  }
  if (target.id === "zoom-in" || target.id === "zoom-out") {
    await applyCamera({
      ...adapter.readCamera(),
      zoom: Math.min(
        4,
        Math.max(
          0.3,
          config.view.zoom * (target.id === "zoom-in" ? 1.15 : 1 / 1.15),
        ),
      ),
    });
    return;
  }
  if (target.id === "pause") {
    await previewing;
    config.pose.paused = !config.pose.paused;
    adapter.pause(config.pose.paused);
    header();
    persist();
    schedulePreview();
    return;
  }
  if (target.id === "restart-pose") {
    await operation(async () => {
      adapter.restart(config);
      await adapter.waitReady();
    }, false);
    return;
  }
  if (target.dataset.tokenView) {
    config.token.elevation = Number(target.dataset.tokenView);
    persist();
    renderCatalog();
    schedulePreview();
    return;
  }
  if (target.id === "center-head" || target.id === "center-figure") {
    const before = structuredClone(config);
    config.token.anchor = target.id === "center-head" ? "head" : "figure";
    config.token.offset = { x: 0, y: 0 };
    positionChanged(before);
    renderCatalog();
    composePreview();
    return;
  }
  if (target.dataset.size) {
    config.token.size = Number(target.dataset.size) as 512 | 1024;
    persist();
    renderCatalog();
    return;
  }
  if (target.dataset.outlineStyle) {
    config.token.outline.style = target.dataset.outlineStyle as
      "crisp" | "soft";
    persist();
    renderCatalog();
    schedulePreview();
    return;
  }
  if (target.dataset.textureQuality) {
    const next = structuredClone(config);
    next.settings.textureQuality = target.dataset
      .textureQuality as TextureQuality;
    await changeCharacter(next);
    return;
  }
  if (target.dataset.exportScale) {
    config.settings.exportScale = Number(target.dataset.exportScale) as
      1 | 2 | 3;
    persist();
    renderCatalog();
    return;
  }
  if (
    target.dataset.animationFormat ||
    target.dataset.duration ||
    target.dataset.fps
  ) {
    if (target.dataset.animationFormat)
      config.token.animation.format = target.dataset.animationFormat as
        "webm" | "webp";
    if (target.dataset.duration)
      config.token.animation.duration =
        target.dataset.duration === "pose"
          ? "pose"
          : (Number(target.dataset.duration) as 2 | 4);
    if (target.dataset.fps)
      config.token.animation.fps = Number(target.dataset.fps) as 12 | 20;
    persist();
    renderCatalog();
    return;
  }
  if (target.id === "record-animation") {
    await exportAnimation();
    return;
  }
  if (target.id === "randomize") {
    const next = structuredClone(config);
    for (let pass = 0; pass < 2; pass++)
      for (const option of availableOptions(next, data))
        next.customizations[option.id] =
          option.choices[Math.floor(Math.random() * option.choices.length)].id;
    await changeAppearance(next);
    return;
  }
  if (target.id === "undo" || target.id === "redo") {
    const from = target.id === "undo" ? history : future,
      to = target.id === "undo" ? future : history;
    if (!from.length) return;
    await operation(async () => {
      const next = structuredClone(from[from.length - 1]);
      await replaceViewer(next);
      to.push(structuredClone(config));
      from.pop();
      if (!!config.npc !== !!next.npc) section = next.npc ? "npc" : "race";
      config = next;
    }, false);
    return;
  }
  if (target.id === "new-character") {
    await changeCharacter(defaultConfig(data));
    return;
  }
  if (target.id === "save-json") {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(config, null, 2)], { type: "application/json" }),
    );
    download(url, `${filename()}.character.json`);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return;
  }
  if (target.id === "import-json") {
    $<HTMLInputElement>("#json-file").click();
    return;
  }
  if (target.id === "export-png" || target.id === "token-download") {
    await exportPng();
    return;
  }
  if (target.id === "clear-previews") {
    await previews.clear();
    notify("Previews refreshed");
    return;
  }
});
document.addEventListener("input", (event) => {
  const target = event.target as HTMLInputElement;
  if (!config || busy) return;
  if (target.id === "character-name") {
    config.name = target.value;
    persist("name");
    return;
  }
  if (target.id === "catalog-search") {
    search = target.value;
    catalogPage = 0;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => renderCatalog(true), 180);
    return;
  }
  if (target.type === "range") {
    const value = Number(target.value),
      output = document.querySelector(`#${target.id}-value`);
    if (output)
      output.textContent = `${Math.round(value)}${target.dataset.unit ?? ""}`;
    if (target.id.startsWith("token-")) {
      const key = target.id.slice(6) as
        "elevation" | "facing" | "zoom" | "padding";
      config.token[key] = value / (key === "zoom" ? 100 : 1);
      persist(target.id);
      schedulePreview(220);
    }
    if (target.id === "outline-width") {
      config.token.outline.width = value;
      persist(target.id);
      schedulePreview(220);
    }
    if (target.id === "shadow-opacity") {
      config.token.shadow.opacity = value;
      persist(target.id);
      schedulePreview(180);
    }
    if (target.id === "animation-speed") {
      config.token.animation.speed = value / 100;
      adapter.animationSpeed(config.token.animation.speed);
      const label = document.querySelector("#pose-duration");
      if (label) label.textContent = poseDurationLabel();
      persist(target.id);
    }
    if (target.id === "view-elevation" || target.id === "view-facing") {
      const key = target.id.slice(5) as "elevation" | "facing";
      void applyCamera({ ...config.view, [key]: value });
    }
  }
  if (target.id === "outline-color") {
    config.token.outline.color = target.value;
    persist(target.id);
    schedulePreview(180);
  }
});
document.addEventListener("change", async (event) => {
  const target = event.target as HTMLInputElement;
  if (!config || busy) return;
  if (target.id === "catalog-expansion") {
    expansion = target.value;
    catalogPage = 0;
    renderCatalog(true);
    return;
  }
  if (target.id === "npc-family") {
    npcFamily = target.value;
    catalogPage = 0;
    renderCatalog(true);
    return;
  }
  if (target.id === "animate-pose") {
    config.token.animation.includePose = target.checked;
    persist();
    renderCatalog();
    return;
  }
  if (target.id === "outline-enabled") {
    config.token.outline.enabled = target.checked;
    persist();
    schedulePreview();
  }
  if (target.id === "shadow-enabled") {
    config.token.shadow.enabled = target.checked;
    persist();
    schedulePreview();
  }
  if (target.id === "hide-head" || target.id === "hide-shoulders") {
    const next = structuredClone(config);
    next.hidden[target.id === "hide-head" ? "head" : "shoulders"] =
      target.checked;
    await changeEquipment(next);
  }
  if (target.id === "json-file") {
    const file = target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 200000) throw new Error("Character file exceeds 200 KB.");
      const imported = JSON.parse(await file.text());
      await hydrateEquipment(imported);
      await changeCharacter(validateConfig(imported, data, wardrobe));
      const gender = modelFor(config, data).body.gender;
      if (gender < 2) preferredGender = gender;
      renderCatalog();
    } catch (error) {
      notify(
        `Import rejected: ${error instanceof Error ? error.message : String(error)}`,
        true,
      );
    } finally {
      target.value = "";
    }
  }
});
function saveView() {
  clearTimeout(dragTimer);
  dragTimer = setTimeout(() => {
    if (!adapter || busy || previewing) return;
    config.view = adapter.readCamera();
    persist("camera");
  }, 400);
}
$("#stage").addEventListener("pointerup", saveView);
$("#stage").addEventListener("wheel", saveView, {
  capture: true,
  passive: true,
});
window.addEventListener("beforeunload", () => adapter?.dispose());
try {
  if (isPages && !apiBase) {
    console.info(
      "Set VITE_API_BASE_URL to the HTTPS model API and rebuild the Pages site. See app/DEPLOYMENT.md.",
    );
    throw new Error(
      "The online forge is not available yet. Please check back soon.",
    );
  }
  const response = await fetch(apiUrl("/api/bootstrap"));
  if (!response.ok)
    throw new Error("The forge could not connect. Please try again later.");
  data = await response.json();
  const infoResponse = await fetch(apiUrl("/api/catalog/info"));
  if (!infoResponse.ok)
    throw new Error("Local catalogue is missing. Relaunch Token Forge.");
  catalogInfo = await infoResponse.json();
  config = defaultConfig(data);
  let notice = "";
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      await hydrateEquipment(parsed);
      config = validateConfig(parsed, data, wardrobe);
    }
  } catch (error) {
    notice = `Saved character could not load: ${error instanceof Error ? error.message : String(error)}`;
  }
  const gender = modelFor(config, data).body.gender;
  if (gender < 2) preferredGender = gender;
  if (config.npc) section = "npc";
  await ViewerAdapter.initialize(data);
  setBusy(true);
  await replaceViewer(config);
  previews = new PreviewGallery(data, $("#catalog-scroll"));
  header();
  renderCatalog();
  persist();
  setBusy(false);
  schedulePreview(0);
  if (notice || data.warning) notify(notice || data.warning!, true);
  Object.defineProperty(window, "forge", {
    value: {
      get adapter() {
        return adapter;
      },
      get config() {
        return structuredClone(config);
      },
      data,
      wardrobe,
      previews,
      get tokenPlacement() {
        return structuredClone(tokenPlacement);
      },
      changeCharacter,
      changeEquipment,
      changeAppearance,
      navigate,
    },
    configurable: true,
  });
} catch (error) {
  console.error("Token Forge could not start", error);
  setBusy(true);
  $("#loading").hidden = false;
  $("#loading .spinner").hidden = true;
  $("#loading-label").textContent =
    error instanceof Error ? error.message : String(error);
  $("#document-status").textContent = "Not connected";
  $("#character-subtitle").textContent = "Character workshop";
  $("#save-dot").title = "Not connected";
  $("#save-dot").classList.add("disconnected");
  $<HTMLInputElement>("#character-name").disabled = true;
  document
    .querySelectorAll<HTMLButtonElement>("button")
    .forEach((button) => (button.disabled = true));
}
