import { createHash } from "node:crypto";

// Geometry, geosets, and attachment layout identify a model independently of
// its textures. Texture-only armor also needs a shared source name: grouping
// every flat chest texture together would combine unrelated clothing.
export function equipmentFamily(item, display) {
  if (!display) return item.id;
  const fields = Object.keys(display)
    .filter((field) =>
      /^(ModelResourcesID_|ModelType_|GeosetGroup|AttachmentGeosetGroup_|HelmetGeosetVis_)/.test(
        field,
      ),
    )
    .sort();
  const modeled = [
    +display.ModelResourcesID_0,
    +display.ModelResourcesID_1,
  ].some((id) => id > 0);
  const key = [
    item.category,
    item.itemClass,
    item.itemSubclass,
    item.hands,
    ...fields.map((field) => `${field}:${display[field]}`),
    // Preserve distinct weapon effects, even on the same underlying mesh.
    modeled ? `visual:${display.ItemVisual}` : item.name.toLowerCase().trim(),
  ].join("|");
  return (
    "family-" + createHash("sha256").update(key).digest("hex").slice(0, 24)
  );
}
