import { ClaimCategory, ClaimCharacteristic } from "@citeverify/shared";
import {
  hasCitationMarker,
  stripCitationMarkers,
} from "../normalizers/claim-normalizer.ts";
import type {
  Classification,
  ResolvedClaimExtractionOptions,
  Signal,
} from "../types/claim.types.ts";
import { computeConfidence, type Penalty } from "../utils/confidence.ts";

/**
 * Rule-based claim classification.
 *
 * Each sentence is scanned for linguistic cues ("signals"). A sentence is a
 * claim only if it has at least one *assertive* cue (a statistic, a finding
 * verb, a causal/comparative/conclusion expression, a numeric assertion, or an
 * established-fact pattern) and its combined confidence passes the threshold.
 * Numbers, section names, or scientific vocabulary alone never make a claim.
 *
 * The primary category is the highest-priority category with direct evidence;
 * a category is never assigned without a matching cue.
 */

type Detector = Omit<Signal, "reason"> & {
  pattern: RegExp;
  label: string;
  /** Optional extra check on the match (return false to ignore it). */
  accept?: (match: RegExpMatchArray, sentence: string) => boolean;
};

const C = ClaimCategory;
const K = ClaimCharacteristic;

const DETECTORS: Detector[] = [
  // ── Statistical ────────────────────────────────────────────────────────
  {
    name: "p_value",
    label: "p-value",
    pattern: /\bp\s*(?:[<>=≤≥]|&lt;)\s*0?\.\d+/i,
    weight: 0.6,
    category: C.STATISTICAL_CLAIM,
    characteristic: K.P_VALUE,
    assertive: true,
  },
  {
    name: "confidence_interval",
    label: "confidence interval",
    pattern:
      /\b\d{2}\s?%\s*(?:CI|confidence interval)\b|\bconfidence intervals?\b/i,
    weight: 0.5,
    category: C.STATISTICAL_CLAIM,
    characteristic: K.CONFIDENCE_INTERVAL,
    assertive: true,
  },
  {
    name: "test_statistic",
    label: "test statistic",
    pattern:
      /(?:\b(?:t|F|z|U|H)|χ2|χ²)\s*\(\s*\d+(?:\.\d+)?(?:\s*,\s*\d+(?:\.\d+)?)?\s*\)\s*=\s*[-−]?\d/,
    weight: 0.5,
    category: C.STATISTICAL_CLAIM,
    characteristic: K.TEST_STATISTIC,
    assertive: true,
  },
  {
    name: "coefficient",
    label: "statistical coefficient",
    pattern:
      /(?:\b(?:r|R2|OR|HR|RR|AUC|ICC|SMD|MD|aOR)|R²|ρ|β|η2|η²)\s*=\s*[-−]?\d*\.?\d+/,
    weight: 0.5,
    category: C.STATISTICAL_CLAIM,
    characteristic: K.TEST_STATISTIC,
    assertive: true,
  },
  {
    name: "statistically_significant",
    label: "statistical significance",
    pattern:
      /\bstatistically\s+(?:significant|non-?significant|insignificant)\b|\bsignificant(?:ly)?\s+(?:difference|differences|association|associations|correlation|effect|effects|interaction)\b|\b(?:did|does) not reach (?:statistical )?significance\b/i,
    weight: 0.45,
    category: C.STATISTICAL_CLAIM,
    characteristic: K.STATISTICAL_SIGNIFICANCE,
    assertive: true,
  },
  {
    name: "statistical_term",
    label: "statistical measure",
    pattern:
      /\b(?:odds ratio|hazard ratio|relative risk|risk ratio|effect size|standard deviation|mean difference|regression coefficient|correlation coefficient)s?\b/i,
    weight: 0.3,
    category: C.STATISTICAL_CLAIM,
    assertive: true,
  },
  {
    name: "significant",
    label: "significance language",
    pattern: /\bsignificant(?:ly)?\b/i,
    weight: 0.25,
    characteristic: K.STATISTICAL_SIGNIFICANCE,
    assertive: true,
  },

  // ── Conclusion ────────────────────────────────────────────────────────
  {
    name: "conclusion_results",
    label: "conclusion indicator",
    pattern:
      /\b(?:these|our|the|present|current)\s+(?:results|findings|data|observations|analyses|study|studies|experiments)\s+(?:strongly\s+|clearly\s+|further\s+)?(?:indicate|indicates|suggest|suggests|demonstrate|demonstrates|show|shows|confirm|confirms|support|supports|reveal|reveals|imply|implies|provide evidence)\b/i,
    weight: 0.6,
    category: C.RESEARCH_CONCLUSION,
    assertive: true,
  },
  {
    name: "conclusion_phrase",
    label: "conclusion indicator",
    pattern:
      /\b(?:we|i)\s+(?:conclude|concluded|infer|inferred)\b|\bin conclusion\b|\btaken together\b|\bin summary\b|\bthis (?:study|work|paper|analysis|research) (?:shows|showed|demonstrates|demonstrated|indicates|suggests|provides evidence|confirms|establishes)\b|\bwe (?:show|demonstrate|provide evidence)\s+that\b/i,
    weight: 0.55,
    category: C.RESEARCH_CONCLUSION,
    assertive: true,
  },

  // ── Causal ────────────────────────────────────────────────────────────
  {
    name: "causal_verb",
    label: "causal language",
    pattern:
      /\b(?:causes?|caused|causing|leads? to|led to|leading to|results? in|resulted in|induces?|induced|triggers?|triggered|drives?|drove|promotes?|promoted|inhibits?|inhibited|prevents?|prevented|suppress(?:es|ed)?|contributes? to|contributed to|(?:is|are|was|were) responsible for|gives? rise to|gave rise to)\b/i,
    weight: 0.5,
    category: C.CAUSAL_CLAIM,
    characteristic: K.CAUSAL_LANGUAGE,
    assertive: true,
  },
  {
    name: "effect_verb",
    label: "causal language",
    pattern:
      /\b(?:(?:may|might|can|could|will|would)\s+(?:reduce|increase|decrease|lower|raise|impair|enhance|improve|worsen|alter|affect)|(?:reduces|increases|decreases|lowers|raises|impairs|enhances|improves|worsens|alters|affects)(?!\s+(?:in|of)\b))\b/i,
    weight: 0.5,
    category: C.CAUSAL_CLAIM,
    characteristic: K.CAUSAL_LANGUAGE,
    assertive: true,
  },
  {
    name: "causal_connector",
    label: "causal connector",
    pattern:
      /\b(?:attributable to|as a (?:direct )?result of|owing to|is caused by|are caused by|was caused by|were caused by)\b/i,
    weight: 0.35,
    category: C.CAUSAL_CLAIM,
    characteristic: K.CAUSAL_LANGUAGE,
    assertive: true,
  },
  {
    name: "effect_of_on",
    label: "effect-of-on construction",
    pattern: /\beffects?\s+of\s+[\p{L}\p{N}\s-]{1,40}?\s+on\b/iu,
    weight: 0.25,
    category: C.CAUSAL_CLAIM,
    characteristic: K.CAUSAL_LANGUAGE,
  },

  // ── Comparative ───────────────────────────────────────────────────────
  {
    name: "comparison_phrase",
    label: "comparison",
    pattern:
      /\b(?:compared (?:with|to)|in comparison (?:with|to)|relative to|versus|vs\.?|outperform(?:s|ed)?|superior to|inferior to|in contrast to|differ(?:s|ed)? (?:from|between|significantly)|difference between|differences between)\b/i,
    weight: 0.5,
    category: C.COMPARATIVE_CLAIM,
    characteristic: K.COMPARISON,
    assertive: true,
  },
  {
    name: "comparative_than",
    label: "comparative (… than)",
    weight: 0.5,
    category: C.COMPARATIVE_CLAIM,
    characteristic: K.COMPARISON,
    assertive: true,
    pattern:
      /\b(?:higher|lower|greater|smaller|larger|fewer|more|less|better|worse|faster|slower|stronger|weaker|longer|shorter|earlier|later)\s+(?:[\p{L}-]+\s+){0,4}?than\b(?!\s*(?:about\s+|approximately\s+)?\d)/iu,
  },
  {
    name: "fold_comparison",
    label: "fold comparison",
    pattern:
      /\b(?:twice|three times|\d+(?:\.\d+)?[- ]?(?:fold|times))\s+(?:higher|lower|greater|more|less|as)\b/i,
    weight: 0.5,
    category: C.COMPARATIVE_CLAIM,
    characteristic: K.COMPARISON,
    assertive: true,
  },

  // ── Experimental finding ──────────────────────────────────────────────
  {
    name: "finding_verb",
    label: "finding verb",
    weight: 0.45,
    category: C.EXPERIMENTAL_FINDING,
    assertive: true,
    pattern:
      /\b(?:we|researchers|authors|investigators|participants|patients|subjects|mice|rats|animals|cells|samples|plants|treatment|treatments|group|groups|experiments?|trials?|study|analysis|analyses|results?|data)\b[^.;]{0,60}?\b(?:observed|found|showed|demonstrated|exhibited|displayed|revealed|yielded|produced|experienced|achieved|detected)\b/i,
  },
  {
    name: "passive_finding",
    label: "finding verb",
    pattern:
      /\b(?:was|were)\s+(?:also\s+)?(?:observed|found|detected|noted|seen)\b/i,
    weight: 0.45,
    category: C.EXPERIMENTAL_FINDING,
    assertive: true,
  },
  {
    name: "change_verb",
    label: "change verb",
    pattern:
      /\b(?:increased|decreased|reduced|improved|enhanced|elevated|lowered|declined|rose|fell|dropped|doubled|tripled|halved|worsened|accelerated|attenuated|diminished|boosted|raised|outgrew)\b/i,
    weight: 0.3,
    category: C.EXPERIMENTAL_FINDING,
    characteristic: K.CHANGE_DIRECTION,
    assertive: true,
  },
  {
    name: "change_noun",
    label: "change noun",
    pattern:
      /\b(?:increase|decrease|reduction|improvement|decline|gain|loss|rise|drop)s?\s+(?:in|of)\b/i,
    weight: 0.2,
    characteristic: K.CHANGE_DIRECTION,
  },
  {
    name: "experimental_context",
    label: "experimental context",
    pattern:
      /\b(?:in vitro|in vivo|in the (?:experiment|trial|study)|under (?:[\p{L}-]+\s+){0,2}conditions|placebo|control group|intervention|randomi[sz]ed|cohort)\b/iu,
    weight: 0.15,
  },

  // ── Numerical ─────────────────────────────────────────────────────────
  {
    name: "percentage",
    label: "percentage",
    pattern: /\d+(?:\.\d+)?\s?%/,
    weight: 0.25,
    category: C.NUMERICAL_CLAIM,
    characteristic: K.PERCENTAGE,
  },
  {
    name: "numeric_assertion",
    label: "numeric assertion",
    weight: 0.35,
    category: C.NUMERICAL_CLAIM,
    characteristic: K.NUMERIC_VALUE,
    assertive: true,
    pattern:
      /\b(?:is|are|was|were|reached|reaches|averaged|averages|accounts? for|accounted for|total(?:l?ed|s)?|ranged from|ranges from|amounts? to|amounted to|equals?|equall?ed|estimated (?:at|to be))\s+(?:[\p{L}-]+\s+){0,3}?(?:approximately |about |nearly |around |over |under |up to |only |just )?[-−]?\d/iu,
    // "was conducted in 2019" is a date, not a quantity.
    accept: (m, text) => {
      const value =
        text
          .slice((m.index ?? 0) + m[0].length - 1)
          .match(/^\d+(?:\.\d+)?/)?.[0] ?? "";
      return !/^(?:19|20)\d{2}$/.test(value);
    },
  },
  {
    name: "measurement",
    label: "measurement with unit",
    pattern:
      /\b\d+(?:\.\d+)?\s?(?:mg|g|kg|µg|μg|ng|mL|ml|L|mmol|µmol|μmol|mol|nm|µm|μm|mm|cm|km|°C|K|Hz|kHz|MHz|kDa|ppm|ppb|mmHg|bpm|kcal|kJ|kW|mA|h|min|ms|days?|weeks?|months?)\b|\d\s?°C/,
    weight: 0.25,
    characteristic: K.MEASUREMENT_UNIT,
  },
  {
    name: "fold_change",
    label: "fold change",
    pattern: /\b\d+(?:\.\d+)?[- ]?fold\b/i,
    weight: 0.25,
    category: C.NUMERICAL_CLAIM,
    characteristic: K.NUMERIC_VALUE,
  },
  {
    name: "sample_size",
    label: "sample size",
    pattern: /\b[nN]\s*=\s*\d+/,
    weight: 0.1,
    characteristic: K.SAMPLE_SIZE,
  },

  // ── Established scientific fact ───────────────────────────────────────
  {
    name: "fact_pattern",
    label: "established-fact pattern",
    weight: 0.5,
    category: C.SCIENTIFIC_FACT,
    assertive: true,
    pattern:
      /\b(?:is|are)\s+(?:known|thought|believed|widely (?:recognized|recognised|accepted)|well[- ]established|considered)\s+to\b|\b(?:has|have) been (?:shown|demonstrated|reported|established|found) to\b|\bplays? (?:a|an) (?:[\p{L}-]+\s+){0,2}?role in\b|\b(?:is|are) (?:a|an|the) (?:major|leading|primary|main|common|key|important|well-known|principal|known)\s+(?:[\p{L}-]+\s+){0,2}?(?:cause|causes|source|risk factor|determinant|mechanism|regulator|predictor|component)\b|\b(?:regulates|mediates|catalyzes|catalyses|encodes|binds to|is essential for|are essential for|is required for|are required for|is characteri[sz]ed by)\b/iu,
  },
  {
    name: "association",
    label: "association",
    pattern:
      /\b(?:(?:is|are|was|were)\s+(?:positively |negatively |strongly |weakly |inversely |independently )?(?:associated|correlated|linked)\s+(?:with|to)|(?:positive|negative|inverse|strong|weak|linear|significant)?\s*(?:relationship|association|correlation|link)\s+between)\b/i,
    weight: 0.5,
    characteristic: K.ASSOCIATION,
    assertive: true,
  },

  // ── Context (never sufficient alone) ──────────────────────────────────
  {
    name: "scientific_term",
    label: "scientific terminology",
    pattern:
      /\b(?:hypothes[ie]s|mechanisms?|proteins?|genes?|enzymes?|species|concentrations?|mortality|morbidity|incidence|prevalence|efficacy|exposure|dose|biomarkers?|metabolism|expression|growth rate|yield|temperature|accuracy|performance|risk)\b/i,
    weight: 0.1,
  },
];

const HEDGE =
  /\b(?:may|might|could|possibly|potentially|likely|appears? to|seems? to|suggests?|suggested|presumably)\b/i;
const NEGATION =
  /\b(?:no|not|did not|does not|was not|were not|neither|nor|without|failed to)\b[^.;]{0,40}?\b(?:significant|difference|effect|association|change|increase|decrease|improvement|correlation|benefit)\b/i;

/** Sentences that are about the paper itself, not about the science. */
const META_INTENT =
  /^(?:in this (?:paper|article|study|work|review|chapter|section|report),?\s+)?(?:we|this (?:paper|article|study|work|review|section))\s+(?:aim|aimed|seek|sought|set out|intend|propose to|plan to|present|presents|introduce|introduces|describe|describes|outline|outlines|review|reviews|discuss|discusses|is organized|is structured)\b|^the (?:aim|objective|purpose|goal)s? of (?:this|the present|our) (?:study|paper|work|research|review)\b|^the (?:remainder|rest) of this\b|^section \d/i;

const ADMINISTRATIVE =
  /\b(?:we thank|we are grateful|we acknowledge|thanks are due|funded by|funding (?:was|from|for this)|supported by (?:a |the )?(?:grant|national|foundation)|grant (?:no|number)|conflicts? of interest|competing interests?|declares? no|ethics committee|institutional review board|informed consent was|was approved by|were approved by|data (?:are|is) available|available (?:from|upon|on) (?:the corresponding author|request)|correspondence (?:to|should)|copyright|all rights reserved|author contributions|e-?mail)\b|©/i;

const CAPTION =
  /^(?:figure|fig\.|table|supplementary (?:figure|table))\s*S?\d+[a-z]?\b/i;
const REFERENCE_ENTRY =
  /^\[?\d+[\].]\s+\p{Lu}[\p{L}'’-]+,?\s+(?:\p{Lu}\.|\p{Lu}[\p{L}-]+,)/u;
const PROCEDURAL =
  /\b(?:was|were)\s+(?:then\s+)?(?:collected|recruited|randomi[sz]ed|enrolled|obtained|purchased|stored|incubated|centrifuged|prepared|performed|conducted|administered|assigned|selected|used|applied|calculated|analy[sz]ed|assessed|computed|fitted|extracted|cultured|harvested|sampled|measured using|recorded using|defined as)\b/i;
const METHODS_SECTION =
  /\b(?:methods?|methodology|materials|procedures?|protocol|experimental (?:design|setup)|study design|data collection|statistical analys[ie]s|participants and)\b/i;
const RESULTS_SECTION =
  /\b(?:results?|findings|discussion|conclusions?|abstract|summary|outcomes)\b/i;

/** Highest priority first. */
const CATEGORY_PRIORITY: ClaimCategory[] = [
  C.RESEARCH_CONCLUSION,
  C.STATISTICAL_CLAIM,
  C.CAUSAL_CLAIM,
  C.COMPARATIVE_CLAIM,
  C.EXPERIMENTAL_FINDING,
  C.NUMERICAL_CLAIM,
  C.SCIENTIFIC_FACT,
];

const quote = (s: string) => `"${s.length > 40 ? `${s.slice(0, 37)}…` : s}"`;

export function detectSignals(sentence: string): Signal[] {
  // Citation markers ("[12]", "(Doe, 2021)") must not count as numbers.
  const text = stripCitationMarkers(sentence);
  const signals: Signal[] = [];
  for (const d of DETECTORS) {
    const match = text.match(d.pattern);
    if (!match || (d.accept && !d.accept(match, text))) continue;
    const { pattern: _p, label, accept: _a, ...rest } = d;
    signals.push({ ...rest, reason: `${label}: ${quote(match[0].trim())}` });
  }
  if (hasCitationMarker(sentence)) {
    signals.push({
      name: "citation",
      reason: "cites a source",
      weight: 0.1,
      characteristic: K.CITES_SOURCE,
    });
  }
  return signals;
}

const reject = (rejectedBecause: string): Classification => ({
  isClaim: false,
  category: null,
  characteristics: [],
  confidence: 0,
  rationale: [],
  rejectedBecause,
});

export function classifySentence(
  sentence: string,
  section: string | null,
  options: Pick<
    ResolvedClaimExtractionOptions,
    "minConfidence" | "minWords" | "maxWords"
  >,
): Classification {
  const text = sentence.trim();
  const words = text.split(/\s+/).length;
  if (words < options.minWords) return reject("too short");
  if (words > options.maxWords) return reject("too long (likely merged text)");
  if (/\?["')\]]?$/.test(text)) return reject("question");
  if (ADMINISTRATIVE.test(text)) return reject("administrative statement");
  if (META_INTENT.test(text))
    return reject("describes the paper, not a finding");
  if (REFERENCE_ENTRY.test(text)) return reject("bibliography entry");

  const signals = detectSignals(text);
  const assertive = signals.filter((s) => s.assertive);
  if (!assertive.length) return reject("no assertive scientific cue");

  const penalties: Penalty[] = [];
  if (CAPTION.test(text))
    penalties.push({ reason: "figure/table caption", factor: 0.5 });
  if (PROCEDURAL.test(text))
    penalties.push({
      reason: "procedural (methods) description",
      factor: 0.45,
    });
  if (section && METHODS_SECTION.test(section))
    penalties.push({ reason: `methods section "${section}"`, factor: 0.7 });

  const weights = signals.map((s) => s.weight);
  if (section && RESULTS_SECTION.test(section)) weights.push(0.1);
  const confidence = computeConfidence(weights, penalties);

  const present = new Set(
    signals.flatMap((s) => (s.category ? [s.category] : [])),
  );
  let category = CATEGORY_PRIORITY.find((c) => present.has(c)) ?? null;
  if (!category && signals.some((s) => s.name === "association")) {
    // "X is associated with Y" states a general relationship; "was associated" reports a finding.
    category =
      /\b(?:was|were)\s+\w*\s*(?:associated|correlated|linked)\b/i.test(text)
        ? C.EXPERIMENTAL_FINDING
        : C.SCIENTIFIC_FACT;
  }
  if (!category) return reject("no claim category could be established");
  if (confidence < options.minConfidence) {
    return {
      ...reject(
        `confidence ${confidence} below threshold ${options.minConfidence}`,
      ),
      confidence,
    };
  }

  const characteristics = new Set(
    signals.flatMap((s) => (s.characteristic ? [s.characteristic] : [])),
  );
  if (HEDGE.test(text)) characteristics.add(K.HEDGED);
  if (NEGATION.test(text)) characteristics.add(K.NEGATED);
  if (
    signals.some(
      (s) => s.name === "numeric_assertion" || s.name === "fold_change",
    )
  )
    characteristics.add(K.NUMERIC_VALUE);

  const rationale = [
    ...new Set(
      signals
        .filter((s) => s.weight >= 0.2 || s.assertive)
        .map((s) => s.reason),
    ),
  ].slice(0, 8);
  if (section && RESULTS_SECTION.test(section))
    rationale.push(`section "${section}"`);
  rationale.push(...penalties.map((p) => `lowered: ${p.reason}`));

  return {
    isClaim: true,
    category,
    characteristics: [...characteristics],
    confidence,
    rationale,
  };
}
