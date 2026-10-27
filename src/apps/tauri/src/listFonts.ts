import { invoke } from "@tauri-apps/api/core";

/** The fonts installed on the system, by family name. */
export const listFonts = () => invoke<string[]>("list_fonts");
