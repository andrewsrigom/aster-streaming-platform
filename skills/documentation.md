# Skill: Documentation and Code Commentary

## Purpose

Keep public writing precise, useful for implementation and operation, and consistent with the maturity of the system.

## Scope

Repository documentation describes Aster as a real product and engineering system. It does not discuss private motivation, external evaluation, or why the repository may be read by others.

## Language

- Write in English.
- Use direct, professional sentences.
- Prefer concrete nouns and verbs.
- Use canonical terms from `GLOSSARY.md`.
- Avoid filler such as “obviously,” “simply,” “just,” or “magic.”
- Define specialized terms on first use or link to the glossary.
- Keep abbreviations limited and expanded when first introduced.

## Truth and tense

Use:

- present tense for behavior that exists and is verified;
- “planned,” “will,” or requirement language for future behavior;
- exact status labels from `AGENTS.md`.

Never convert a target diagram into an implementation claim.

## Structure

A technical document should answer, as applicable:

1. What problem does this solve?
2. What behavior is required?
3. Who owns the decision and data?
4. What invariants must hold?
5. What happens when dependencies fail?
6. How is security enforced?
7. How is it observed?
8. How is it tested?
9. How is it operated and recovered?
10. What trade-offs or non-goals apply?

Use diagrams only when they clarify a relationship or flow. Keep prose consistent with diagrams.

## Code examples

Examples must:

- use current project vocabulary;
- preserve security and cancellation assumptions;
- show bounded input and concurrency;
- avoid fake APIs presented as implemented;
- be complete enough to understand the relevant mechanism;
- state when pseudocode is conceptual;
- avoid invented benchmark numbers.

## Code comments

Comments explain:

- why an invariant requires unusual code;
- why an ordering or lock strategy is safe;
- why a retry is permitted or prohibited;
- why a workaround exists;
- what external constraint is not visible from code;
- when an approach can be removed.

Do not comment:

- obvious assignments;
- function names repeated in prose;
- ordinary control flow;
- types already expressed by TypeScript;
- stale history that belongs in version control or an ADR.

## API documentation

Describe observable contract, authorization, limits, errors, idempotency, ordering, and examples. Do not expose internal implementation details as promises unless clients depend on them.

## Review

Before completing a documentation change:

- verify links;
- verify terminology;
- verify current versus planned status;
- verify diagrams;
- verify commands;
- remove unsupported claims;
- update related state and decision files.
