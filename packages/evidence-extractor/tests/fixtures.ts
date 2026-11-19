/** SYNTHETIC publication content. The study, numbers and URLs are invented for tests. */
import type { FullTextParagraph, PublicationContent } from "../src/index.ts";

export const STRUCTURED_ABSTRACT =
  "Background: Short sleep is common in shift workers. Objective: We aimed to test whether a sleep-extension programme improves working memory. Methods: In this randomized controlled trial, 120 adults were randomly assigned to sleep extension or usual sleep for 6 weeks. Results: Sleep extension increased total sleep time by 46 minutes compared with usual sleep (95% CI 31-61; p < 0.001). Working memory accuracy improved in the extension group. Conclusions: These findings suggest that extending sleep improves working memory in healthy adults.";

export const UNSTRUCTURED_ABSTRACT =
  "Short sleep is common in shift workers. We recruited 64 nurses for a cross-sectional study. Shorter sleep was associated with lower vigilance scores (r = 0.41). These results suggest that sleep duration matters for vigilance.";

const p = (
  order: number,
  section: string | null,
  cleanedText: string,
  pageNumber: number | null = order < 3 ? 1 : 2,
): FullTextParagraph => ({
  id: `p${order}`,
  order,
  cleanedText,
  pageNumber,
  section,
});

export const FULL_TEXT: FullTextParagraph[] = [
  p(
    0,
    "Abstract",
    "Sleep extension increased total sleep time in healthy adults. Working memory improved after six weeks of extended sleep.",
  ),
  p(
    1,
    "1. Introduction",
    "Short sleep is associated with poorer cognition in many studies [1, 2]. Previous trials reported mixed effects of sleep extension [3].",
  ),
  p(
    2,
    "2. Methods",
    "We conducted a randomized controlled trial in two hospitals. A total of 120 adults (n = 120) were randomly assigned to sleep extension or usual sleep. The study took place in a quiet building.",
  ),
  p(
    3,
    "2.1 Statistical analysis",
    "Group differences were analyzed using a linear mixed-effects model adjusted for age.",
  ),
  p(
    4,
    "3. Results",
    "Sleep extension increased total sleep time by 46 minutes compared with usual sleep (95% CI 31-61; p < 0.001). Working memory accuracy was 82.1 ± 6.3% in the extension group versus 77.4 ± 7.0% in controls. Table 2 shows the baseline characteristics of participants.",
  ),
  p(
    5,
    "3.2 Secondary outcomes",
    "Daytime sleepiness decreased in the extension group. No significant difference in reaction time was observed between groups (p = 0.42).",
  ),
  p(
    6,
    "4. Discussion",
    "Our findings are consistent with earlier laboratory studies of sleep restriction. Sleep is a complex behaviour influenced by many factors [4].",
  ),
  p(
    7,
    "4.1 Limitations",
    "This study has several limitations. Sleep was self-reported by diaries in part of the sample, and the follow-up lasted only six weeks.",
  ),
  p(
    8,
    "5. Conclusion",
    "In conclusion, extending sleep improved working memory in healthy adults.",
  ),
  p(
    9,
    "Acknowledgements",
    "We thank the participants and the nursing staff for their contribution to this research.",
  ),
  p(
    10,
    "References",
    "1. Doe J. Sleep and cognition in adults. J Sleep. 2019;1:1-9.",
  ),
];

export const content = (
  partial: Partial<PublicationContent> = {},
): PublicationContent => ({
  publicationId: "pub-1",
  abstract: null,
  abstractSourceUrl: null,
  fullText: null,
  ...partial,
});
