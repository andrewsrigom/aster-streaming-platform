# Extension: Recommendations

## Status

Deferred until the initial release is verified.

## Product outcome

Provide profile-aware title recommendations while preserving privacy, explainability, fallback behavior, and independent failure.

## Boundary

Discovery owns recommendation ranking and explanation. It consumes approved Catalog metadata and bounded Engagement signals. It does not own profiles, progress, or title truth.

## Initial approach

Begin with an explainable content-based model:

- genres;
- language;
- runtime;
- editorial tags;
- completed and positively engaged titles;
- excluded or recently completed titles.

Produce offline or asynchronous candidate scores. Store a versioned recommendation projection.

## Requirements before activation

- documented signal purpose and retention;
- profile deletion propagation;
- no sensitive inference;
- stable editorial fallback;
- bounded online query;
- model/version metadata;
- explanation category;
- quality evaluation set;
- diversity and repetition controls;
- cold-start behavior;
- rollback to previous model;
- SLI for recommendation rail availability and freshness.

## Architecture

```text
Catalog events ─┐
                ├→ feature projection → ranking job → profile recommendations
Engagement events┘                                      │
                                                       Discovery GraphQL
```

Online GraphQL must not run expensive model training.

## Failure behavior

- stale recommendations within maximum age may be served;
- missing recommendations use editorial or trending rails;
- recommendation failure never blocks playback or Catalog;
- malformed model output is rejected before publication.

## Evaluation

Measure:

- coverage;
- diversity;
- novelty;
- repetition;
- click or play-start rate with careful interpretation;
- completion correlation;
- latency;
- freshness;
- fallback rate.

Do not optimize one engagement metric without product and privacy review.
