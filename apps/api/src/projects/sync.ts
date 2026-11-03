import type { LoadedContent } from '../content/load';
import type { Db } from '../db';

/**
 * Copies every loaded project spec into its Project row, updating rows in place, so submissions
 * can reference a project. Specs removed from content/ keep their rows: submissions may point at
 * them. Returns how many specs were written.
 */
export async function syncProjects(db: Db, content: LoadedContent): Promise<number> {
  for (const { spec, brief } of content.projects.values()) {
    const data = {
      number: spec.number,
      title: spec.title,
      chapter: spec.chapter,
      unlockAfterSection: spec.unlockAfterSection,
      // Plain JSON from a parsed file, so it round-trips into a Json column.
      spec: spec as object,
      brief,
    };
    // Free the number first if another slug held it, e.g. after a project was renamed.
    await db.project.deleteMany({
      where: { number: spec.number, slug: { not: spec.slug }, submissions: { none: {} } },
    });
    await db.project.upsert({
      where: { slug: spec.slug },
      create: { slug: spec.slug, ...data },
      update: data,
    });
  }
  return content.projects.size;
}
