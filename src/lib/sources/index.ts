import type { SourceAdapter } from "@/lib/types";
import { adzuna } from "./adzuna";
import { reed } from "./reed";
import { greenhouse, lever, ashby, workable } from "./ats";
import { gradcracker } from "./gradcracker";

export const adapters: Record<string, SourceAdapter> = {
  adzuna,
  reed,
  greenhouse,
  lever,
  ashby,
  workable,
  gradcracker,
};
