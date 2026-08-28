# Durable processing and retained-candidate replay

Status: implemented and locally verified; Phase 06 remains IN_PROGRESS. This is private technical work, not a public publication or trusted attestation.

2026-08-28, branch feat/p06-media-pipeline after decoder commit 5d4e0e9, local Docker project aster-p04-development. Exact coordinator image: sha256:c8bcb094a6a24eb99dbf682b624dd3c6d5e193838e3c29c4df30eaa4c144e87a. Affected source is captured in processing-source.sha256. [ADR-0024](../../docs/adr/0024-durable-media-processing.md).

## Commands and result

After building the current catalog-init/media-prepare image, the local initializer applied only migration 6. Existing serving containers, databases, originals and the private HLS candidate were preserved; unrelated overlay orphans were not removed.

~~~sh
docker compose -p aster-p04-development -f infra/compose/compose.yml --profile integration run --rm --no-deps catalog-init
pnpm media:candidate aster-p04-development eca2fa7f-87ec-4056-9a61-2d95b6ee81d8 --reuse 80f3b48f46729d8c84d6a5c4cc5c76c889090381c7b1acab17fbb45b1658d51c 23ba545346b3c19fda0a39a1d9816f3652f931ca039aefcac95587a0df4098f1
pnpm media:candidate aster-p04-development eca2fa7f-87ec-4056-9a61-2d95b6ee81d8
~~~

[Adoption](processing-adopt.jsonl) streams and checks the retained report plus every referenced object, then completes durable attempt 68e41f87-ca12-44ff-96d3-8a9e66d67795. [Default replay](processing-replay.jsonl) returns that same successful attempt and immutable candidate after current rights/storage verification. Neither invocation starts the decoder or writes media. The runner now builds the decoder only when computation is needed. Both invocations finish with scoped scratch/container cleanup.

[Independent SQL readback](processing-readback.jsonl) confirms exactly one processing attempt, 203 objects / 95430911 bytes, schema versions 1–6 and title version 3 / rights revision 2 / RIGHTS_REVIEWED / no publication. The adoption attempt took five whole seconds. Request-to-start age was 5204 seconds, including manual development/staging; it is not a scheduler queue SLO or encoding duration. Original full-film measurements remain in [decoder evidence](decoder.md).

## Verification

- Focused domain/handoff/coordinator tests: 19/19, including bounded states/identities, private-only references, missing/corrupt/oversized objects, explicit adoption, default replay, conflicting selectors, no repeated writes/decoder start and cancellation with a separate bounded audit signal. Raw processing-focused.txt.
- [Disposable PostgreSQL](processing-postgres.jsonl): eight competing claims admit one; same checksum/recipe reuses across currently approved requests; disputed requesting rights refuse reuse; leases fence stale completion, retire the final expired attempt and enforce three attempts; cancellation retries, invalid output is terminal, injected insertion rolls back, readers cannot access attempts, nonempty down is refused and no editorial state changes. Fixture cleanup reports zero remaining containers in 31473 ms.
- The final affected source gate passed 61/61 tasks, 44 cached, 136.578 seconds (processing-quality.txt). Initial review corrected conflicting-selector handling and kept graceful owner termination before exact-container removal. Confirmation covers current focused tests and actual adoption/replay; only formatter/test/documentation changes followed the passing transaction experiment.

No new source download, film encoding, Web benchmark or Windows resource diagnostic was run. Publication still requires reviewed artwork, truthful modification attribution, a separately restricted attestation boundary and complete public-origin/playback acceptance. A crash between private retention and durable completion can be recovered using the explicit recorded manifest/report selector; never delete audit to regain retry capacity.
