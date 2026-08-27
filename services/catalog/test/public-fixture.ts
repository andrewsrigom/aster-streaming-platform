import type { CatalogPublicUnitOfWork } from "../src/application/public-ports.js";
import { createCatalogPublicQueries } from "../src/application/public-queries.js";
import { projectPublicTitle, type PublicCatalogCandidate } from "../src/domain/public-title.js";
import { catalogTestId as id, catalogTestTime as now } from "./rights-fixture.js";
import { metadataFixture, publicationFixture, rightsFacts } from "./workflow-fixture.js";

export function publicCandidate(number = 1): PublicCatalogCandidate {
  const titleId = id(number);
  return {
    title: {
      id: titleId,
      version: 5,
      state: "PUBLISHED",
      rightsRevision: 2,
      publicationId: id(200),
    },
    latestRightsRevision: 2,
    rights: {
      ...rightsFacts(),
      id: id(number + 300),
      titleId,
      revision: 2,
      status: "APPROVED",
      reviewedAt: now,
      reviewedBy: id(3),
    },
    metadata: metadataFixture(),
    publication: publicationFixture(titleId),
  };
}
export function publicFixture() {
  const state = {
    candidates: [publicCandidate(1), publicCandidate(2), publicCandidate(3)],
    calls: 0,
    time: now,
  };
  const transactions: CatalogPublicUnitOfWork = {
    run(work) {
      return work({
        browse(after, limit, scope) {
          state.calls++;
          return Promise.resolve(
            state.candidates
              .filter((value) => {
                const title = projectPublicTitle(value, scope.now, scope.policy);
                return title && (after === null || title.id > after);
              })
              .slice(0, limit),
          );
        },
        findMany(ids, scope) {
          state.calls++;
          return Promise.resolve(
            state.candidates.filter((value) => {
              const title = projectPublicTitle(value, scope.now, scope.policy);
              return title && ids.includes(title.id);
            }),
          );
        },
      });
    },
  };
  const queries = createCatalogPublicQueries({
    transactions,
    policy: { commercial: true },
    now: () => state.time,
  });
  return { queries, state, transactions };
}
