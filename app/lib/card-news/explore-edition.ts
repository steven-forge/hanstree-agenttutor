import "server-only";
import rawExplore from "../../../data/explore.json";

export function exploreOptions() {
  return rawExplore.docs.filter(doc => doc.diagram_image).map(({ slug, title, summary, created_at, updated_at }) => ({ slug, title, summary, date: updated_at || created_at }))
    .sort((a, b) => b.date.localeCompare(a.date));
}
