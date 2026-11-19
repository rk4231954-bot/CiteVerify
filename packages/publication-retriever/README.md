# @citeverify/publication-retriever

Retrieves publication **metadata** for bibliography references from [Crossref](https://api.crossref.org) and [OpenAlex](https://docs.openalex.org).

Metadata is all it retrieves. Having an abstract or an open-access URL does not mean the full text is available, and a retrieved publication says nothing about whether it supports any claim.

```ts
import { createDefaultRetriever } from "@citeverify/publication-retriever";

const retriever = createDefaultRetriever({
  mailto: process.env.PUBLICATION_CONTACT_EMAIL,
});
const result = await retriever.retrieve({
  id,
  rawText,
  doi,
  title,
  authors,
  year,
});
// result.status: MATCHED | AMBIGUOUS | NEEDS_REVIEW | NOT_FOUND | FAILED
```

## Layout

```
src/
  providers/   crossref.provider.ts, openalex.provider.ts  (implement PublicationSource)
  services/    publication-search.service.ts  (PublicationRetriever: matching + decisions)
               publication-normalizer.service.ts  (provider JSON → NormalizedPublication, merge)
  resolvers/   doi-resolver.ts  (reuses citation-engine's DOI normaliser)
  schemas/     zod schemas for provider responses and stored candidates
  utils/       http.ts (timeouts, retries, throttling), text.ts (title similarity), errors.ts
tests/         mocked HTTP only; no live API calls
```

## Matching order

1. **Resolve the DOI.** Take the reference's DOI field, or a DOI written in the raw entry. It is normalised and validated with the citation-engine resolver. An invalid DOI is reported in the result and not used.
2. **Look up the exact DOI.** Try Crossref, then OpenAlex. The result is checked against the reference's own title, first author and year:
   - If they agree, the result is `MATCHED` with confidence 0.93–0.99.
   - If the DOI resolves to an unrelated work, the result is `NEEDS_REVIEW`.
3. **Search by title.** This runs when there is no usable DOI. Crossref gets a `query.bibliographic` query (title, first author and year). Candidates are scored:
   - The score combines title similarity (60%), first-author surname (20%) and year (20%; ±1 year still counts partly).
   - A dissimilar title cannot be rescued by author and year.
   - A contradicting author caps the score.
   - Short titles with nothing else to confirm them are capped.
   - Correction and retraction notices are penalised.
4. **Fall back to OpenAlex search.** This happens only when Crossref produced no `MATCHED`. Nothing is searched twice once a reliable match exists. Records of the same work from both providers are merged into one candidate.
5. **Enrich the match.** For a matched DOI, an OpenAlex DOI _lookup_ fills fields Crossref lacks, such as the abstract and open-access status. It never replaces Crossref's values.

The candidates' scores decide the status:

| Status         | When                                                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `MATCHED`      | The best score is ≥ 0.9 and beats the runner-up by ≥ 0.1. Only this status returns a `publication`.                    |
| `AMBIGUOUS`    | Several candidates are ≥ 0.75 and within 0.1 of each other.                                                            |
| `NEEDS_REVIEW` | The best score is ≥ 0.5 but uncertain.                                                                                 |
| `NOT_FOUND`    | Every provider answered and nothing is similar enough.                                                                 |
| `FAILED`       | A provider was unavailable and nothing was matched. The search was incomplete, so it is never reported as `NOT_FOUND`. |

## Reliability

- Every request has a timeout (10 s by default).
- Requests are serialised per provider, with a minimum spacing between them. The spacing adapts to Crossref's `X-Rate-Limit-*` headers.
- Retries happen only for timeouts, network errors, 429 and 500/502/503/504. They use exponential backoff and honour `Retry-After`, but give up instead of waiting longer than 10 s. Other 4xx responses are never retried, and 404 means not found.
- Every response is validated with zod. A malformed body is an `INVALID_RESPONSE` error and is never used as data.
- Failures are logged per provider, with `mailto` and `api_key` redacted.
- There are no credentials in code. The contact email and the OpenAlex key are optional configuration.
- Providers are replaceable: anything implementing `PublicationSource` can be passed to `new PublicationRetriever({ primary, fallback })`.
- `retrieveMany` shares one request cache, so duplicate DOIs and queries cost one request.

## Limitations

- Similarity is lexical (character bigrams). A heavily abbreviated, translated or mis-parsed title may come back `NEEDS_REVIEW` or `NOT_FOUND`.
- Crossref does not report open-access status. That comes only from OpenAlex.
- Books, theses, preprints and grey literature are covered less well than journal articles.
- Anonymous OpenAlex requests can be rate-limited (HTTP 429). Configure a contact email or an API key.
