import { supabase, currentUser } from "./cloud-client";
import type { CharacterRepository, CloudCharacter } from "./document-store";
export const cloudRepository: CharacterRepository & {
  list: (page?: number) => Promise<CloudCharacter[]>;
  get: (id: string) => Promise<CloudCharacter>;
  shared: (token: string) => Promise<CloudCharacter | null>;
  remove: (document: CloudCharacter) => Promise<void>;
} = {
  async save(id, revision, config, snapshot) {
    const { data, error } = await supabase!
      .rpc("save_character", {
        p_id: id,
        p_revision: revision,
        p_config: config,
        p_snapshot: snapshot,
      })
      .single();
    if (error)
      throw Object.assign(new Error(error.message), { code: error.code });
    return data as CloudCharacter;
  },
  async list(page = 0) {
    const { data, error } = await supabase!
      .from("characters")
      .select("*")
      .order("updated_at", { ascending: false })
      .range(page * 24, page * 24 + 23);
    if (error)
      throw Object.assign(new Error(error.message), { code: error.code });
    return data as CloudCharacter[];
  },
  async get(id) {
    const { data, error } = await supabase!
      .from("characters")
      .select("*")
      .eq("id", id)
      .single();
    if (error)
      throw Object.assign(new Error(error.message), { code: error.code });
    return data as CloudCharacter;
  },
  async shared(token) {
    const { data, error } = await supabase!
      .rpc("resolve_character_share", { p_token: token })
      .maybeSingle();
    if (error)
      throw Object.assign(new Error(error.message), { code: error.code });
    return data as CloudCharacter | null;
  },
  async remove(document) {
    const { error } = await supabase!
      .from("characters")
      .delete()
      .eq("id", document.id);
    if (error)
      throw Object.assign(new Error(error.message), { code: error.code });
    await supabase!.storage
      .from("character-thumbnails")
      .remove([`${currentUser()!.id}/${document.id}.webp`]);
  },
};
export async function uploadThumbnail(record: CloudCharacter, url: string) {
  const user = currentUser();
  if (!user || user.id !== record.owner_id) return;
  const image = new Image();
  image.src = url;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const context = canvas.getContext("2d")!;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, 512, 512);
  let blob: Blob | null = null;
  for (const quality of [0.94, 0.87, 0.8]) {
    blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", quality),
    );
    if (blob && blob.size <= 131072) break;
  }
  if (!blob || blob.size > 131072) return;
  const path = `${user.id}/${record.id}.webp`;
  const { error } = await supabase!.storage
    .from("character-thumbnails")
    .upload(path, blob, {
      contentType: "image/webp",
      upsert: true,
      cacheControl: "300",
    });
  if (error) throw error;
  const result = await supabase!.rpc("set_character_thumbnail", {
    p_id: record.id,
  });
  if (result.error) throw result.error;
}
