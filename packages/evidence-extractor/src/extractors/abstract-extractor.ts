/**
 * Abstract path. Turns an abstract into source passages, splitting structured
 * abstracts at their own labels ("Methods:", "RESULTS:") so each segment keeps
 * the role its authors gave it. Offsets point into the original abstract.
 */
import { EvidenceAvailability } from "@citeverify/shared";
import type { SectionKind, SourcePassage } from "../types/evidence.types.ts";

const LABELS: [string, SectionKind][] = [
  ["background", "INTRODUCTION"],
  ["introduction", "INTRODUCTION"],
  ["context", "INTRODUCTION"],
  ["rationale", "INTRODUCTION"],
  ["importance", "INTRODUCTION"],
  ["objectives?", "INTRODUCTION"],
  ["aims?", "INTRODUCTION"],
  ["purpose", "INTRODUCTION"],
  ["(?:materials and )?methods?", "METHODS"],
  ["methods and materials", "METHODS"],
  ["methodology", "METHODS"],
  ["design(?:, setting,? and participants)?", "METHODS"],
  ["settings?", "METHODS"],
  ["participants", "METHODS"],
  ["patients", "METHODS"],
  ["interventions?", "METHODS"],
  ["exposures?", "METHODS"],
  ["measurements?", "METHODS"],
  ["main outcomes? (?:and )?measures?", "METHODS"],
  ["study selection", "METHODS"],
  ["data (?:sources|extraction|synthesis)", "METHODS"],
  ["(?:main )?results?", "RESULTS"],
  ["findings", "RESULTS"],
  ["limitations?", "LIMITATIONS"],
  ["conclusions?(?: and relevance)?", "CONCLUSION"],
  ["interpretation", "CONCLUSION"],
  ["significance", "CONCLUSION"],
  ["implications", "CONCLUSION"],
  ["trial registration", "BACK_MATTER"],
  ["funding", "BACK_MATTER"],
  ["keywords?", "BACK_MATTER"],
];

// A label opens the abstract or follows a sentence end / line break, and ends with ":".
const LABEL_RE = new RegExp(
  String.raw`(?:^|(?<=[.!?]\s{1,3})|(?<=\n\s*))(${LABELS.map(([l]) => l).join("|")})\s*:\s*`,
  "gi",
);

function kindOfLabel(label: string): SectionKind {
  for (const [pattern, kind] of LABELS)
    if (new RegExp(`^${pattern}$`, "i").test(label.trim())) return kind;
  return "OTHER";
}

export type AbstractSegment = {
  label: string | null;
  kind: SectionKind;
  start: number;
  end: number;
};

/** Splits an abstract into labelled segments (one unlabelled segment for unstructured abstracts). */
export function segmentAbstract(abstract: string): AbstractSegment[] {
  // A leading "Abstract" word is a heading, not content.
  const lead = abstract.match(/^\s*abstract\s*[:.—-]?\s*/i)?.[0].length ?? 0;
  const matches = [...abstract.slice(lead).matchAll(LABEL_RE)];
  if (!matches.length)
    return [
      { label: null, kind: "ABSTRACT", start: lead, end: abstract.length },
    ];

  const segments: AbstractSegment[] = [];
  const first = matches[0];
  if (first && first.index > 0) {
    const pre = abstract.slice(lead, lead + first.index);
    if (pre.trim())
      segments.push({
        label: null,
        kind: "ABSTRACT",
        start: lead,
        end: lead + first.index,
      });
  }
  for (const [i, m] of matches.entries()) {
    const label = m[1] ?? "";
    const start = lead + m.index + m[0].length;
    const next = matches[i + 1];
    const end = next ? lead + next.index : abstract.length;
    segments.push({
      label: label.trim(),
      kind: kindOfLabel(label),
      start,
      end,
    });
  }
  return segments.filter((s) => abstract.slice(s.start, s.end).trim());
}

/**
 * Passages for an abstract. `availability` is ABSTRACT for a metadata abstract
 * and FULL_TEXT when the abstract is part of a processed full-text document.
 */
export function abstractPassages(
  abstract: string,
  options: {
    passageId?: string;
    section?: string;
    availability?: EvidenceAvailability;
    pageNumber?: number | null;
    sourceUrl: string | null;
    order?: number;
  },
): SourcePassage[] {
  if (!abstract.trim()) return [];
  return segmentAbstract(abstract).map((seg, i) => ({
    id: options.passageId ?? "abstract",
    text: abstract.slice(seg.start, seg.end),
    section: options.section ?? "Abstract",
    sectionKind: seg.kind,
    abstractLabel: seg.label,
    // Metadata abstracts carry no reliable page number.
    pageNumber:
      options.availability === EvidenceAvailability.FULL_TEXT
        ? (options.pageNumber ?? null)
        : null,
    availability: options.availability ?? EvidenceAvailability.ABSTRACT,
    sourceUrl: options.sourceUrl,
    order: (options.order ?? 0) + i / 100,
    offset: seg.start,
  }));
}
