/**
 * Lexical cues for evidence classification. Each cue records the matched text,
 * so every classification can be explained and checked against the source.
 */
import type { StatisticKind } from "../types/evidence.types.ts";

const NUM = String.raw`-?\d+(?:[.·]\d+)?`;
const DEC = String.raw`(?:0?[.·]\d+|1(?:[.·]0+)?)`;

export const STATISTIC_PATTERNS: [StatisticKind, RegExp][] = [
  [
    "P_VALUE",
    new RegExp(
      String.raw`(?<![\p{L}])[pP](?:[- ]?values?)?\s*(?:[<>=≤≥]|&lt;|&gt;)\s*${DEC}(?:\s*[×x]\s*10\s*[-−]\s*\d+)?`,
      "gu",
    ),
  ],
  [
    "CONFIDENCE_INTERVAL",
    new RegExp(
      String.raw`\b\d{2}(?:[.·]\d)?\s*%\s*(?:CI|CrI|confidence intervals?|credible intervals?)\b[,:]?\s*(?:[([]\s*)?(?:${NUM}\s*(?:[-–—,;]|to)\s*${NUM})?(?:\s*[)\]])?`,
      "giu",
    ),
  ],
  [
    "EFFECT_SIZE",
    new RegExp(
      String.raw`(?<![\p{L}])(?:a?ORs?|a?RRs?|a?HRs?|IRR|SMD|WMD|MD|RD|ARR|NNT|Cohen'?s d|Hedges'? g|β|beta|r|ρ|rho|R²|R2|η²|η2|odds ratio|hazard ratio|relative risk|risk ratio)\s*(?:[=:]|was|of)\s*${NUM}`,
      "giu",
    ),
  ],
  [
    "MEAN_SD",
    new RegExp(String.raw`${NUM}\s*(?:±|\+/-|\+-)\s*\d+(?:[.·]\d+)?`, "g"),
  ],
  [
    "TEST_STATISTIC",
    new RegExp(
      String.raw`(?<![\p{L}])(?:t|F|z|U|H|χ2|χ²|chi-squared?)\s*(?:\(\s*\d+(?:\s*,\s*\d+(?:[.·]\d+)?)?\s*\))?\s*=\s*${NUM}`,
      "gu",
    ),
  ],
  ["PERCENTAGE", new RegExp(String.raw`${NUM}\s*%`, "g")],
];

export const SIGNIFICANCE =
  /\b(?:statistically\s+)?(?:non-?)?significant(?:ly)?\b|\bnot\s+(?:statistically\s+)?significant\b/i;

export const RESULT_CUES: RegExp[] = [
  /\b(?:was|were|is|are|remained)\s+(?:not\s+)?(?:significantly\s+|positively\s+|negatively\s+|inversely\s+|strongly\s+|weakly\s+|independently\s+|modestly\s+)?(?:associated|correlated|linked)\s+with\b/i,
  /\b(?:increased|decreased|reduced|improved|elevated|lowered|attenuated|enhanced|impaired|predicted|prevented|inhibited|suppressed|induced|doubled|halved|declined|rose|fell)\b/i,
  /\b(?:higher|lower|greater|smaller|larger|longer|shorter|faster|slower|better|worse|more|less|fewer)\b[^.;]{0,80}?\b(?:than|compared\s+(?:with|to)|versus|vs\.?|relative to)\b/i,
  /\b(?:no|did\s+not|didn't|failed\s+to)\s+(?:significant(?:ly)?\s+|statistically\s+significant\s+)?(?:differ|difference|change|effect|association|improve|reduce|increase|alter|affect)/i,
  /\b(?:we|the authors)\s+(?:found|observed|detected|identified|showed|demonstrated|noted)\b/i,
  /\b(?:was|were)\s+(?:observed|found|detected|noted)\b/i,
  /\b(?:resulted|results)\s+in\b|\bled\s+to\b|\bcaused\b/i,
  /\b(?:showed|show|shows|revealed|reveals|yielded|exhibited|displayed)\s+(?:a|an|no|significant|similar|higher|lower|greater|reduced|increased|decreased)\b/i,
  /\b(?:odds|risk|hazard|incidence|prevalence|mortality|survival|response rate)\b[^.]{0,40}\b(?:was|were|of)\s+\d/i,
];

export const METHOD_CUES: RegExp[] = [
  /\b(?:we|the authors|investigators)\s+(?:conducted|performed|recruited|enrolled|randomi[sz]ed|analy[sz]ed|measured|assessed|collected|surveyed|followed|used|applied|designed|included|screened|evaluated|compared|extracted|searched|interviewed|administered)\b/i,
  /\b(?:was|were)\s+(?:recruited|enrolled|randomi[sz]ed|randomly\s+(?:assigned|allocated)|allocated|assigned|measured|assessed|collected|obtained|analy[sz]ed|calculated|estimated|performed|conducted|administered|excluded|included|followed(?:\s+up)?|selected|quantified|recorded|scored|adjusted|stratified|matched|blinded|treated|exposed|fed|housed|cultured|incubated)\b/i,
  /\b(?:inclusion|exclusion|eligibility)\s+criteria\b/i,
  /\b(?:using|with|by)\s+(?:a|an|the)?\s*(?:[\w-]+\s+){0,3}(?:regression|model|questionnaire|scale|test|analysis|assay|software|protocol|instrument|survey|accelerometer|polysomnography|interview)s?\b/i,
  /\b(?:primary|secondary)\s+(?:outcome|endpoint)s?\s+(?:was|were)\b/i,
  /\bfollow-up\s+(?:period\s+)?(?:of|was)\b/i,
];

export const DESIGN_TERMS =
  /\b(?:randomi[sz]ed(?:,)?\s+(?:double-blind(?:ed)?,?\s+)?(?:placebo-controlled\s+)?(?:controlled\s+)?(?:clinical\s+)?trial|RCT|double-blind(?:ed)?|single-blind(?:ed)?|placebo-controlled|cross-?over\s+(?:trial|design|study)|(?:prospective|retrospective)\s+(?:cohort|study|analysis)|cohort\s+study|case-control\s+study|cross-sectional\s+(?:study|survey|analysis|design)|longitudinal\s+(?:study|cohort)|systematic\s+review|meta-analys[ie]s|observational\s+study|pilot\s+study|mendelian\s+randomi[sz]ation|qualitative\s+study|in\s+vitro|in\s+vivo|animal\s+model|mouse\s+model|case\s+series|quasi-experimental)\b/giu;

export const LIMITATION_CUES: RegExp[] = [
  /\blimitations?\b/i,
  /\blimited\s+by\b/i,
  /\binterpreted\s+with\s+caution\b/i,
  /\bcannot\s+(?:rule\s+out|exclude|establish|determine|infer|be\s+(?:ruled\s+out|excluded|generali[sz]ed))\b/i,
  /\b(?:small|modest|limited|relatively\s+small)\s+sample(?:\s+size)?\b/i,
  /\bmay\s+not\s+(?:be\s+)?generali[sz]/i,
  /\bgenerali[sz]ability\b/i,
  /\b(?:residual|unmeasured|potential)\s+confounding\b/i,
  /\b(?:selection|recall|information|reporting|publication|attrition)\s+bias\b/i,
  /\b(?:causal(?:ity)?|cause-and-effect)\b[^.]{0,40}\b(?:cannot|could\s+not|not\s+possible)\b/i,
  /\b(?:further|future|larger|additional)\s+(?:research|studies|trials|work|investigations?)\s+(?:is|are|will\s+be)?\s*(?:needed|required|warranted|necessary)\b/i,
  /\b(?:a|one|another|the\s+main|an\s+important)\s+(?:weakness|shortcoming|drawback|caveat)\b/i,
  /\breli(?:ed|ance|es)\s+on\s+self-report/i,
];

export const CONCLUSION_CUES: RegExp[] = [
  /^(?:in\s+conclusion|to\s+conclude|in\s+summary|to\s+summari[sz]e|overall|taken\s+together|collectively|altogether)\b/i,
  /\bwe\s+conclude\b/i,
  /\b(?:these|our|the\s+present|the\s+current|this\s+study's)\s+(?:findings|results|data|observations)\s+(?:suggest|indicate|show|demonstrate|support|provide|highlight|imply|confirm|reveal)\b/i,
  /\b(?:this|the\s+present|the\s+current|our)\s+(?:study|trial|work|analysis|review)\s+(?:shows|showed|demonstrates|demonstrated|provides|suggests|indicates|confirms|found)\b/i,
];

export const DISCUSSION_CUES: RegExp[] = [
  /\b(?:consistent|in\s+line|in\s+agreement|in\s+accordance|congruent)\s+with\b/i,
  /\b(?:in\s+contrast|contrary)\s+to\b/i,
  /\b(?:may|might|could)\s+(?:be\s+explained|reflect|be\s+due|be\s+attributed)\b/i,
  /\bpossible\s+(?:mechanism|explanation)s?\b/i,
  /\b(?:our|these|the\s+present)\s+(?:findings|results|data|observations)\b/i,
  /\bthis\s+(?:finding|result|observation|association|effect)\b/i,
];

export const OWN_STUDY =
  /\b(?:we|our|this\s+(?:study|trial|cohort|analysis)|the\s+(?:present|current)\s+(?:study|trial|analysis)|these\s+(?:findings|results))\b/i;

export const OBJECTIVE =
  /^(?:the\s+)?(?:main\s+|primary\s+)?(?:aim|objective|purpose|goal)s?\s+of\s+(?:this|the\s+present|the\s+current|our)\s+(?:study|work|paper|review|trial|analysis)\b|^(?:we|this\s+study|the\s+present\s+study)\s+(?:aimed|sought|set\s+out|aims|seeks)\s+to\b|^this\s+(?:study|paper|article|review)\s+(?:aims|investigates|examines|explores|describes)\b|^here,?\s+we\s+(?:investigate|examine|explore)\b/i;

export const BOILERPLATE =
  /^(?:fig(?:ure)?s?\.?|tables?|supplementary|appendix)\s*[\dS]|©|\bcopyright\b|all\s+rights\s+reserved|creative\s+commons|\blicen[cs]ed?\s+under\b|\bcorresponding\s+author\b|\bdoi:\s*10\.|^received\b.*\baccepted\b|^keywords?\s*:/i;

export const SAMPLE_SIZE_PATTERNS: RegExp[] = [
  /(?<![\p{L}])[nN]\s*=\s*(\d{1,3}(?:,\d{3})+|\d+)\b/gu,
  /\b(\d{1,3}(?:,\d{3})+|\d+)\s+(?:(?:healthy|adult|older|young|eligible|randomi[sz]ed|consecutive|hospitali[sz]ed|male|female|pregnant|obese|elderly|community-dwelling)\s+){0,2}(?:participants|patients|subjects|adults|children|adolescents|individuals|women|men|mice|rats|volunteers|respondents|infants|students|cases|controls|people|persons|employees|athletes|twins|pairs|households|animals|nurses|physicians|clinicians|workers|veterans|smokers|users|residents|families|mothers|newborns|neonates|eyes|samples|specimens)\b/giu,
];

export const CONDITION_PATTERNS: RegExp[] = [
  // Doses
  /\b\d+(?:[.·]\d+)?\s*(?:mg|g|kg|µg|μg|mcg|ng|ml|mL|L|IU|mmol|µmol|mol|kcal|mg\/kg|g\/kg)(?:\/(?:kg|day|d|L|dL|dl|h|week))?(?![\p{L}])/gu,
  // Durations
  /\b(?:for\s+|over\s+|after\s+|during\s+)?\d+(?:[.·]\d+)?[- ](?:days?|weeks?|months?|years?|hours?|minutes?|min|h)\b(?:\s+of\s+[\p{L}-]+)?/giu,
  // Populations / settings
  /\b(?:in|among|of)\s+(?:(?:healthy|older|young|adult|elderly|obese|pregnant|postmenopausal|hospitali[sz]ed|community-dwelling|male|female|diabetic|hypertensive|overweight)\s+){0,3}(?:adults|children|adolescents|patients|participants|women|men|mice|rats|infants|volunteers|subjects|individuals|students|workers|athletes|cells)\b/giu,
  /\bin\s+(?:vitro|vivo)\b/giu,
];

/** First match of each cue, as written. */
export function matchCues(text: string, cues: readonly RegExp[]): string[] {
  const found: string[] = [];
  for (const cue of cues) {
    const m = text.match(new RegExp(cue.source, cue.flags.replace("g", "")));
    if (m?.[0]) found.push(m[0].trim());
  }
  return found;
}

export function allMatches(text: string, pattern: RegExp): RegExpExecArray[] {
  return [
    ...text.matchAll(
      new RegExp(
        pattern.source,
        pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`,
      ),
    ),
  ];
}
