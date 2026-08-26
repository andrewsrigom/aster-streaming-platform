# Handoff

P00-R01, the Phase 00 alignment audit, P00-R11, P00-R03, P00-R02, P00-R04, P00-R05, and P00-R06 are complete. No application implementation has started.

The repository has an exact Node.js and pnpm toolchain, deterministic root-only workspace, strict source and documentation gates, lightweight repository hooks, bounded redacting secret scans, and a locally validated CI workflow. The complete forced graph passes sixteen tasks and 52 focused tests. Passing evidence is indexed under `evidence/phase-00/`, including `ci-security-foundation.txt` for the latest work item.

The repository owner authorized the future public target `andrewsrigom/aster-streaming-platform`; it does not exist yet. The checked-in workflow, dependency review, Dependabot policy, secret-scanning integration, and immutable action pins are locally verified. No hosted workflow result, public setting, secret-protection result, or required status check is claimed.

## Resume point

1. Read `AGENTS.md`.
2. Read `.ai/CONTEXT.md`.
3. Read `.ai/CURRENT_STATE.md`.
4. Read `docs/specs/phase-00-foundation.md`.
5. Select only the first `READY` item: P00-R07 contribution governance and repository templates.
6. Move the template item to `IN_PROGRESS` and create `.ai/CHANGE_PLAN.md` from `docs/templates/WORK_ITEM_TEMPLATE.md`.
7. Add focused public contribution, issue, security-reporting, and pull-request guidance that matches the executable commands and MIT contribution terms.
8. Validate template syntax, links, truthfulness, and the full local gate before closing the item.
9. Only then confirm the configured GitHub identity and target absence before the separately queued public-repository creation and settings audit.

## Do not do yet

- Do not scaffold all services.
- Do not download media.
- Do not provision hosted infrastructure.
- Do not implement GraphQL schemas.
- Do not create placeholder dashboards.
- Do not scaffold future application or service packages merely to populate the workspace.
- Do not create the authorized public remote before local Git initialization, initial checks, and CI are ready according to `docs/operations/REPOSITORY_GOVERNANCE.md`.
- Do not lock shadcn/ui or Media Chrome before their owning phase records current compatibility and acceptance evidence.
- Do not mark any planned feature as implemented.
