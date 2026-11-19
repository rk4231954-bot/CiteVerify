/** Explicit wording rules. Every pattern runs on lower-cased text. */
import type { PopulationGroup } from "../types/verification.types.ts";

const VERBS_NEG =
  "differ|change|affect|alter|influence|improve|reduce|increase|decrease|lower|raise|predict|prevent|cause|benefit|associated|correlated|linked|related|different|changed|affected|improved|reduced|increased|decreased|lowered|raised";

/** "No effect" wording: checked first, it overrides any direction word inside it. */
export const NONE_PATTERNS: RegExp[] = [
  new RegExp(
    `\\b(?:did|does|do|was|were|is|are|has|have|had|could|can)\\s+not\\s+(?:\\w+ly\\s+)?(?:(?:significantly|statistically)\\s+)*(?:be\\s+)?(?:${VERBS_NEG})\\w*`,
    "g",
  ),
  new RegExp(
    `\\b(?:not|never)\\s+(?:(?:significantly|statistically|independently|consistently)\\s+)*(?:${VERBS_NEG})\\b`,
    "g",
  ),
  /\b(?:no|without|nor|neither)\s+(?:(?:statistically|clinically)\s+)?(?:(?:significant|clear|meaningful|measurable|detectable|consistent|appreciable|relevant|beneficial|overall)\s+)?(?:effects?|differences?|changes?|associations?|relationships?|correlations?|improvements?|reductions?|increases?|decreases?|benefits?|impact|influence|link)\b/g,
  /\b(?:unchanged|unaffected|failed\s+to\s+\w+)\b/g,
  /\b(?:similar|comparable)\s+(?:between|in\s+both|across|among)\b/g,
];

const UP_ADJ =
  "higher|greater|increased|increasing|improved|better|more|elevated";
const DOWN_ADJ =
  "lower|reduced|decreased|decreasing|poorer|worse|fewer|less|diminished";

/** Association wording, with an optional sign ("inversely associated", "associated with lower"). */
export const ASSOCIATION_PATTERN = new RegExp(
  `\\b(?:(positively|negatively|inversely|directly)\\s+)?(?:(?:significantly|strongly|weakly|independently|modestly)\\s+)?(?:associated|correlated|linked|related)\\s+(?:with|to)\\s+(?:(?:a|an|the)\\s+)?(?:(?:significantly|substantially|slightly|modestly|markedly)\\s+)?(${UP_ADJ}|${DOWN_ADJ})?\\b`,
  "g",
);
export const UNSIGNED_ASSOCIATION =
  /\b(?:(?:association|correlation|relationship)s?\s+between|predict(?:s|ed|ive\s+of)?)\b/g;
export const UP_SIGN = new RegExp(`^(?:positively|directly|${UP_ADJ})$`);
export const DOWN_SIGN = new RegExp(`^(?:negatively|inversely|${DOWN_ADJ})$`);

export const CAUSAL_UP =
  /\b(?:causes?|caused|causing|leads?\s+to|led\s+to|results?\s+in|resulted\s+in|is\s+responsible\s+for|drives?|induces?|induced)\b/g;
export const CAUSAL_DOWN =
  /\b(?:prevents?|prevented|protects?\s+against|protected\s+against|cures?|cured|eliminates?|eliminated)\b/g;

export const EFFECT_UP =
  /\b(?:increas(?:e|es|ed|ing)|rais(?:e|es|ed)|rose|ris(?:e|es)|elevat(?:e|es|ed)|improv(?:e|es|ed|ement|ements)|enhanc(?:e|es|ed|ement)|boost(?:s|ed)?|augment(?:s|ed)?|promot(?:e|es|ed)|gain(?:s|ed)?|higher|greater|better)\b/g;
export const EFFECT_DOWN =
  /\b(?:decreas(?:e|es|ed|ing)|reduc(?:e|es|ed|ing|tion|tions)|lower(?:s|ed|ing)?|declin(?:e|es|ed)|diminish(?:es|ed)?|drop(?:s|ped)?|fell|falls?|attenuat(?:e|es|ed)|inhibit(?:s|ed)?|suppress(?:es|ed)?|impair(?:s|ed|ment)?|worsen(?:s|ed)?|poorer|worse|fewer|shorten(?:s|ed)?)\b/g;

export const HEDGE =
  /\b(?:may|might|could|possibly|potentially|perhaps|suggests?|suggested|suggesting|appears?\s+to|appeared\s+to|seems?\s+to|seemed\s+to|preliminary|tentative|likely)\b/g;

export const ABSOLUTE =
  /\b(?:always|never|all|every|proves?|proven|definitely|definitive(?:ly)?|certainly|conclusively|undoubtedly|cures?|cured|eliminates?|guarantees?|completely|entirely|universally)\b/g;

export const P_VALUE = /\bp\s*(<=|>=|<|>|=|≤|≥)\s*(0?\.\d+|1(?:\.0+)?)\b/g;
export const NOT_SIGNIFICANT_TEXT =
  /\b(?:not\s+(?:statistically\s+)?significant(?:ly)?|non-?significant(?:ly)?|insignificant|did\s+not\s+reach\s+(?:statistical\s+)?significance|no\s+(?:statistically\s+)?significant)\b/g;
export const SIGNIFICANT_TEXT = /\b(?:statistically\s+)?significant(?:ly)?\b/g;

/** "95% CI" etc. are not quantities of the finding. */
export const CI_LEVEL = /\b\d{2}(?:\.\d+)?\s*%\s*(?:ci|confidence|credible)\b/g;

export const POPULATION_PATTERNS: [PopulationGroup, RegExp][] = [
  [
    "ANIMAL",
    /\b(?:mice|mouse|murine|rats?|rodents?|animal\s+models?|in\s+vivo|zebrafish|primates?|piglets?|rabbits?)\b/,
  ],
  [
    "IN_VITRO",
    /\b(?:in\s+vitro|cell\s+lines?|cultured\s+cells?|cell\s+cultures?)\b/,
  ],
  [
    "CHILDREN",
    /\b(?:children|child|infants?|toddlers?|adolescents?|teenagers?|p(?:a)?ediatric|schoolchildren|boys|girls)\b/,
  ],
  [
    "OLDER_ADULTS",
    /\b(?:older\s+(?:adults?|people|persons|individuals)|elderly|seniors?|aged\s+[6-9]\d\s+(?:years\s+)?(?:or|and)\s+(?:older|over|above))\b/,
  ],
  ["WOMEN", /\b(?:women|woman|females?|pregnant|maternal|postmenopausal)\b/],
  ["MEN", /\b(?:men|males?)\b/],
];
/** "Adults" that are not "older adults". */
export const ADULTS = /(?<!older\s)\badults?\b/;
