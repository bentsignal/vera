/**
 * Search source type matching the schema in @acme/db/tools/search.
 * Defined locally to avoid importing createTool dependencies that cause
 * TypeScript type-checking OOM.
 */
export interface Source {
  url: string;
  content: string;
  title?: string | null;
  favicon?: string | null;
  image?: string | null;
}
