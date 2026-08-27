# Phase 05 — Clean-checkout acceptance

Status: IN_PROGRESS. Native screen-reader review remains separate and incomplete.

## Build-context correction

The first preflight incorrectly treated missing explicit verifier-path declarations as proof that Docker omitted the files. A real build from clean source 60364aa passed, including the public-build scanner, and inspection of the earlier running image showed the same scanner command and axe dev dependency. This contradicted the inference.

[Docker's documented matching](https://docs.docker.com/build/concepts/context/#syntax) ignores trailing slashes. Directory exceptions such as `!apps/web/**/` and `!evidence/` therefore admitted unlisted descendants. The old policy test compared text but did not exercise those matching semantics. No claim of an observed production secret leak is made.

`node tools/verify-docker-context.mjs` now runs a network-free scratch build of thirty synthetic canaries and exports only to an owned temporary directory. The first run failed: ten of fifteen forbidden files were included, covering browser traces/reports, unreviewed media/text and evidence/tool artifacts. Five existing exclusions (environment, key, dependency, compiled-output and unrelated documentation cases) still held. After removing directory exceptions and retaining explicit file patterns, the actual Docker result contains exactly fifteen approved files and none of the fifteen forbidden files. The two build verifier files remain explicitly included. Temporary fixtures are removed in `finally`; no runtime containers, published images or retained data are changed.

The probe is required once in the existing protected source job for platform changes, with a one-minute CI deadline and a thirty-second child-process deadline. Its own path selects that CI scope. Forty-seven focused platform, classifier and CI-policy tests pass. No pipeline has been submitted for this unpublished candidate.

## Clean build and startup

Disposable checkout: `/tmp/aster-p05-clean-pDkoZQ`. Proof project: `aster-p05-clean-proof`. Initial read-only inventory found no containers, networks or volumes with that project label. Docker context is local `default`; Engine 26.0.0, Compose 2.26.1, Linux/WSL amd64. Git checkout initially had no node_modules or .next output; source status was clean. Registry access and cached base layers are available, so this is not an empty-cache or offline claim.

The preliminary build from 60364aa passed and ran the public scanner. The later context correction requires repeating the affected clean build before acceptance. Development Web/Router and retained `aster` remain running; no proof startup or full clean browser acceptance is claimed yet.

## Remaining

Run the final clean-source gate, Docker build/start, functional browser journeys and image/runtime isolation checks. Record the exact candidate, results and cleanup here. Preserve the independent quiet-host baseline and all earlier timing misses. Complete actual screen-reader review before protected Phase 05 publication.
