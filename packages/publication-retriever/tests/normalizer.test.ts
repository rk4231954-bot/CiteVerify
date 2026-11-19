import { describe, expect, test } from "bun:test";
import {
  crossrefWorkSchema,
  isSameWork,
  mergePublications,
  normalizeCrossrefWork,
  normalizeOpenAlexWork,
  openAlexWorkSchema,
  titleSimilarity,
} from "../src/index.ts";
import {
  crossrefSleep,
  openAlexSleep,
  SLEEP_DOI,
  SLEEP_TITLE,
} from "./helpers.ts";

describe("Crossref normalisation", () => {
  const pub = normalizeCrossrefWork(crossrefWorkSchema.parse(crossrefSleep));

  test("maps fields exactly as returned", () => {
    expect(pub).not.toBeNull();
    expect(pub?.provider).toBe("CROSSREF");
    expect(pub?.doi).toBe(SLEEP_DOI);
    expect(pub?.title).toBe(SLEEP_TITLE);
    expect(pub?.authors).toEqual(["Doe, Jane", "Chen, Wei"]);
    expect(pub?.year).toBe(2020);
    expect(pub?.journal).toBe("Journal of Synthetic Sleep Research");
    expect(pub?.publisher).toBe("Example Press");
    expect(pub?.url).toBe(`https://doi.org/${SLEEP_DOI}`);
  });

  test("strips JATS markup and the 'Abstract' heading from the abstract", () => {
    expect(pub?.abstract).toBe("We studied sleep & memory.");
  });

  test("does not invent open-access information", () => {
    expect(pub?.openAccess).toBeNull();
    expect(pub?.openAccessUrl).toBeNull();
  });

  test("adds the subtitle and falls back to published-online for the year", () => {
    const p = normalizeCrossrefWork(
      crossrefWorkSchema.parse({
        DOI: "10.1/x",
        title: ["Main"],
        subtitle: ["A subtitle"],
        "published-online": { "date-parts": [[2019]] },
      }),
    );
    expect(p?.title).toBe("Main: A subtitle");
    expect(p?.year).toBe(2019);
    expect(p?.authors).toEqual([]);
    expect(p?.abstract).toBeNull();
  });

  test("a record without a title is skipped, not fabricated", () => {
    expect(
      normalizeCrossrefWork(crossrefWorkSchema.parse({ DOI: "10.1/notitle" })),
    ).toBeNull();
  });
});

describe("OpenAlex normalisation", () => {
  const pub = normalizeOpenAlexWork(openAlexWorkSchema.parse(openAlexSleep));

  test("maps id, DOI (normalised), OA fields and abstract", () => {
    expect(pub?.provider).toBe("OPENALEX");
    expect(pub?.openAlexId).toBe("W1000000001");
    expect(pub?.doi).toBe(SLEEP_DOI);
    expect(pub?.authors).toEqual(["Jane Doe", "Wei Chen"]);
    expect(pub?.openAccess).toBe(true);
    expect(pub?.openAccessStatus).toBe("gold");
    expect(pub?.openAccessUrl).toBe("https://example.org/sleep.pdf");
    expect(pub?.abstract).toBe("Sleep matters for memory");
    expect(pub?.journal).toBe("Journal of Synthetic Sleep Research");
  });
});

describe("merging", () => {
  const cr = normalizeCrossrefWork(
    crossrefWorkSchema.parse({ ...crossrefSleep, abstract: undefined }),
  );
  const oa = normalizeOpenAlexWork(
    openAlexWorkSchema.parse({
      ...openAlexSleep,
      title: "Different title text",
    }),
  );

  test("recognises the same work by DOI", () => {
    if (!cr || !oa) throw new Error("fixture");
    expect(isSameWork(cr, oa)).toBe(true);
  });

  test("fills only missing fields; never overwrites the primary", () => {
    if (!cr || !oa) throw new Error("fixture");
    const merged = mergePublications(cr, oa);
    expect(merged.title).toBe(SLEEP_TITLE);
    expect(merged.authors).toEqual(["Doe, Jane", "Chen, Wei"]);
    expect(merged.abstract).toBe("Sleep matters for memory");
    expect(merged.openAccess).toBe(true);
    expect(merged.openAlexId).toBe("W1000000001");
    expect(merged.sources).toEqual(["CROSSREF", "OPENALEX"]);
  });
});

describe("title similarity", () => {
  test("ignores case, punctuation and markup", () => {
    expect(
      titleSimilarity(
        "Sleep duration and working memory in healthy adults.",
        "<i>Sleep</i> Duration and Working Memory in Healthy Adults",
      ),
    ).toBe(1);
  });
  test("different titles score low", () => {
    expect(
      titleSimilarity(
        SLEEP_TITLE,
        "Caffeine intake and cardiovascular outcomes",
      ),
    ).toBeLessThan(0.4);
  });
});
