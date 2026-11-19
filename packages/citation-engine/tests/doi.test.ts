import { describe, expect, test } from "bun:test";
import {
  doiToUrl,
  extractDois,
  isValidDoi,
  normalizeDoi,
} from "../src/index.ts";

describe("DOI normalisation", () => {
  test.each([
    ["10.1234/ABC.2020.001", "10.1234/abc.2020.001"],
    ["doi:10.1234/abc", "10.1234/abc"],
    ["DOI: 10.1234/abc", "10.1234/abc"],
    ["https://doi.org/10.1234/abc", "10.1234/abc"],
    ["http://dx.doi.org/10.1234/abc", "10.1234/abc"],
    ["https://doi.org/10.1002%2F%28SICI%291097", "10.1002/(sici)1097"],
    ["urn:doi:10.5555/xyz-1", "10.5555/xyz-1"],
    ["10.1234/abc.", "10.1234/abc"],
  ])("%p → %p", (input, expected) => {
    expect(normalizeDoi(input)).toBe(expected);
  });

  test.each([
    "",
    "10.12/abc",
    "11.1234/abc",
    "doi:",
    "https://example.org/10.1234",
    "10.1234",
  ])("rejects invalid %p", (input) => {
    expect(normalizeDoi(input)).toBeNull();
    expect(isValidDoi(input)).toBe(false);
  });

  test("extracts every DOI that is present, and nothing else", () => {
    const text =
      "See https://doi.org/10.1234/A.1, doi:10.5555/b-2; and 10.1234/a.1 again. Not 10.12/x or 2020.1234/y.";
    expect(extractDois(text)).toEqual(["10.1234/a.1", "10.5555/b-2"]);
    expect(extractDois("No identifiers here (2020).")).toEqual([]);
    // Balanced brackets inside a DOI are kept; the enclosing ")" is not.
    expect(extractDois("(doi:10.1234/abc(5)7)")).toEqual(["10.1234/abc(5)7"]);
  });

  test("builds a resolver URL without contacting it", () => {
    expect(doiToUrl("doi:10.1234/ABC")).toBe("https://doi.org/10.1234/abc");
    expect(doiToUrl("not a doi")).toBeNull();
  });
});
