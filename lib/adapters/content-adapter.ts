import type { ContentRecord } from '../contracts/content';

/** Both mock and future Workspace adapters return validated, normalized records.
 * assetPath is relative to the adapter's private materialized asset directory.
 * Google-specific fetching/conversion stays behind this interface. */
export interface ContentAdapter {
  listCandidates(): Promise<ContentRecord[]>;
}
