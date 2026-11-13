import type { CharacterConfig } from "./types";
export interface CloudCharacter {
  id: string;
  owner_id: string;
  name: string;
  config: CharacterConfig;
  schema_version: number;
  asset_snapshot: string;
  revision: number;
  thumbnail_path: string | null;
  created_at: string;
  updated_at: string;
}
export interface CharacterRepository {
  save(
    id: string | null,
    revision: number | null,
    config: CharacterConfig,
    snapshot: string,
  ): Promise<CloudCharacter>;
}
export type SaveState =
  "saved" | "unsaved" | "saving" | "error" | "conflict" | "readonly";
export class DocumentStore {
  document: CloudCharacter | null = null;
  readOnly = false;
  state: SaveState = "saved";
  private desired: CharacterConfig | null = null;
  private acknowledged = "";
  private timer?: ReturnType<typeof setTimeout>;
  private writing: Promise<void> | null = null;
  private conflict = false;
  constructor(
    private repository: CharacterRepository,
    private snapshot: string,
    private changed: (state: SaveState, message?: string) => void,
    private delay = 1200,
  ) {}
  get dirty() {
    return (
      !this.readOnly &&
      !!this.desired &&
      JSON.stringify(this.desired) !== this.acknowledged
    );
  }
  bind(document: CloudCharacter | null, readOnly = false) {
    clearTimeout(this.timer);
    this.document = document;
    this.readOnly = readOnly;
    this.desired = document ? structuredClone(document.config) : null;
    this.acknowledged = document ? JSON.stringify(document.config) : "";
    this.conflict = false;
    this.emit(readOnly ? "readonly" : "saved");
  }
  change(config: CharacterConfig) {
    if (this.readOnly) return;
    this.desired = structuredClone(config);
    clearTimeout(this.timer);
    if (this.conflict) return;
    if (!this.dirty) {
      if (!this.writing) this.emit("saved");
      return;
    }
    this.emit(this.writing ? "saving" : "unsaved");
    this.timer = setTimeout(() => {
      void this.flush().catch(() => {});
    }, this.delay);
  }
  flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.readOnly) return Promise.resolve();
    if (this.conflict)
      return Promise.reject(
        new Error(
          "This character changed in another tab. Reopen it from My characters.",
        ),
      );
    if (this.writing) return this.writing;
    this.writing = this.write().finally(() => {
      this.writing = null;
    });
    return this.writing;
  }
  private async write() {
    while (this.dirty && this.desired) {
      const next = structuredClone(this.desired),
        key = JSON.stringify(next);
      this.emit("saving");
      try {
        if (!next.name.trim())
          throw new Error("Enter a character name before saving.");
        this.document = await this.repository.save(
          this.document?.id ?? null,
          this.document?.revision ?? null,
          next,
          this.snapshot,
        );
        this.acknowledged = key;
      } catch (error) {
        this.conflict = ["PT409", "40001"].includes(
          (error as { code?: string }).code ?? "",
        );
        this.emit(
          this.conflict ? "conflict" : "error",
          error instanceof Error ? error.message : String(error),
        );
        throw error;
      }
    }
    this.emit("saved");
  }
  private emit(state: SaveState, message?: string) {
    this.state = state;
    this.changed(state, message);
  }
}
