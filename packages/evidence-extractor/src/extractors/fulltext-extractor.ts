/**
 * Full-text path. Turns parsed full-text paragraphs (document-parser output)
 * into source passages that keep their section heading and page number.
 * Abstract paragraphs are split like structured abstracts; references and
 * back matter are dropped here.
 */
import { EvidenceAvailability } from "@citeverify/shared";
import { SectionTracker } from "../classifiers/section-classifier.ts";
import type {
  FullTextParagraph,
  SourcePassage,
} from "../types/evidence.types.ts";
import { abstractPassages } from "./abstract-extractor.ts";

export function fullTextPassages(
  paragraphs: readonly FullTextParagraph[],
  sourceUrl: string | null,
): SourcePassage[] {
  const tracker = new SectionTracker();
  const passages: SourcePassage[] = [];
  for (const p of [...paragraphs].sort((a, b) => a.order - b.order)) {
    const kind = tracker.kindFor(p.section);
    if (kind === "REFERENCES" || kind === "BACK_MATTER") continue;
    if (!p.cleanedText.trim()) continue;
    if (kind === "ABSTRACT") {
      passages.push(
        ...abstractPassages(p.cleanedText, {
          passageId: p.id,
          section: p.section ?? "Abstract",
          availability: EvidenceAvailability.FULL_TEXT,
          pageNumber: p.pageNumber,
          sourceUrl,
          order: p.order,
        }),
      );
      continue;
    }
    passages.push({
      id: p.id,
      text: p.cleanedText,
      section: p.section,
      sectionKind: kind,
      abstractLabel: null,
      pageNumber: p.pageNumber,
      availability: EvidenceAvailability.FULL_TEXT,
      sourceUrl,
      order: p.order,
      offset: 0,
    });
  }
  return passages;
}
