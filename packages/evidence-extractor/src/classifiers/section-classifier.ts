/**
 * Maps a section heading (as written) to a coarse SectionKind. Unrecognised
 * subsection headings ("2.3 Sleep outcomes") inherit the enclosing kind via
 * `SectionTracker`, so a Results subsection is still treated as Results.
 */
import { isBibliographyHeading } from "@citeverify/citation-engine";
import type { SectionKind } from "../types/evidence.types.ts";

const RULES: [RegExp, SectionKind][] = [
  [
    /^(?:strengths? and )?limitations?(?: and strengths?)?(?: of (?:the|this) study)?$|^study limitations$/,
    "LIMITATIONS",
  ],
  [/^(?:abstract|summary|structured abstract)$/, "ABSTRACT"],
  [
    /^(?:\w+ )?(?:introduction|background|rationale|literature review|related work)$/,
    "INTRODUCTION",
  ],
  [
    /^results? and discussion$|^results?(?: and \w+)?$|^findings$|^main results$|^outcomes?$/,
    "RESULTS",
  ],
  [
    /^discussion(?: and \w+)?$|^general discussion$|^interpretation$/,
    "DISCUSSION",
  ],
  [
    /^conclusions?(?: and [\w ]+)?$|^concluding remarks$|^summary and conclusions?$|^implications(?: for [\w ]+)?$/,
    "CONCLUSION",
  ],
  [
    /\b(?:methods?|methodology|materials|experimental (?:design|procedures?|section|setup)|study (?:design|population|participants|setting)|participants|patients|subjects|statistical analys[ie]s|data (?:analysis|collection|sources?)|measurements?|procedures?|interventions?|sample|setting|protocol|ethics(?: statement)?)\b/,
    "METHODS",
  ],
  [
    /^(?:acknowledg(?:e)?ments?|funding(?: sources?| statement)?|conflicts? of interest|competing interests?|declaration of [\w ]+|author(?:s'?)? contributions?|data (?:availability|sharing)(?: statement)?|supplementary [\w ]+|supporting information|abbreviations|appendix[\w ]*|disclosures?|ethics approval[\w ]*|consent[\w ]*|trial registration)$/,
    "BACK_MATTER",
  ],
];

/** Normalises a heading: drops numbering ("2.1", "II.", "A."), punctuation and case. */
export function normalizeHeading(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/^\s*(?:\d+(?:\.\d+)*|[ivxlc]+|[a-h])[.)]?\s+/i, "")
    .replace(/[:.\s]+$/, "")
    .replace(/&/g, "and")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyHeading(
  heading: string | null | undefined,
): SectionKind | null {
  if (!heading?.trim()) return null;
  if (isBibliographyHeading(heading)) return "REFERENCES";
  const h = normalizeHeading(heading);
  for (const [pattern, kind] of RULES) if (pattern.test(h)) return kind;
  return null;
}

/** Tracks the enclosing section kind across paragraphs in reading order. */
export class SectionTracker {
  private current: SectionKind | null = null;
  private lastHeading: string | null = null;

  kindFor(heading: string | null): SectionKind | null {
    if (heading === this.lastHeading) return this.current;
    this.lastHeading = heading;
    const kind = classifyHeading(heading);
    // Unknown heading: a subsection of the current section (or genuinely OTHER at the start).
    this.current =
      kind ??
      (this.current && this.current !== "ABSTRACT"
        ? this.current
        : heading
          ? "OTHER"
          : null);
    return this.current;
  }
}
