import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { readSloSources, validateSloContract } from "./verify-slo-contract.mjs";

const sources = await readSloSources(resolve(import.meta.dirname, ".."));
const cloneContract = () => JSON.parse(JSON.stringify(sources.contract));

test("critical-journey SLI contract is finite, executable and internally consistent", () => {
  assert.deepEqual(validateSloContract(sources), []);
});

test("SLO objectives cannot drift from their error budgets", () => {
  const contract = cloneContract();
  contract.slis[0].objective.errorBudgetFraction = 0.01;
  assert.ok(validateSloContract({ ...sources, contract }).length > 0);
});

test("recording rules cannot add high-cardinality labels or artificial no-traffic success", () => {
  const contract = cloneContract();
  contract.slis[1].recordingQueries.good += '+sum(rate(metric{profile_id="private"}[5m]))';
  assert.ok(validateSloContract({ ...sources, contract }).length > 0);
  assert.ok(
    validateSloContract({
      ...sources,
      rules: sources.rules.replace(
        "(aster:sli:good:rate5m / aster:sli:population:rate5m) and on(sli) (aster:sli:population:rate5m > 0)",
        "aster:sli:good:rate5m / aster:sli:population:rate5m or vector(1)",
      ),
    }).length > 0,
  );
  const missingRecordingZero = cloneContract();
  missingRecordingZero.slis[0].recordingQueries.good =
    missingRecordingZero.slis[0].recordingQueries.good.split(" or on()")[0];
  assert.ok(validateSloContract({ ...sources, contract: missingRecordingZero }).length > 0);

  const missingObjectiveZero = cloneContract();
  missingObjectiveZero.slis[0].objectiveQuery = missingObjectiveZero.slis[0].objectiveQuery
    .replace(/^\(/u, "")
    .replace(/ or on\(\) \(0 \* .*\)\) \/ /u, " / ");
  assert.ok(validateSloContract({ ...sources, contract: missingObjectiveZero }).length > 0);

  const missingObjectivePositiveFilter = cloneContract();
  missingObjectivePositiveFilter.slis[0].objectiveQuery =
    missingObjectivePositiveFilter.slis[0].objectiveQuery.split(") and on() (")[0];
  assert.ok(
    validateSloContract({ ...sources, contract: missingObjectivePositiveFilter }).length > 0,
  );
});

test("Router classification and private scrape boundaries are mandatory", () => {
  assert.ok(
    validateSloContract({
      ...sources,
      routerPolicy: sources.routerPolicy.replace('else if rejected { "rejected" }', ""),
    }).length > 0,
  );
  assert.ok(
    validateSloContract({
      ...sources,
      prometheusConfig: sources.prometheusConfig.replace("router:9091", "router:9092"),
    }).length > 0,
  );
  assert.ok(
    validateSloContract({
      ...sources,
      routerConfig: sources.routerConfig.replace("0.3,", ""),
    }).length > 0,
  );
  assert.ok(
    validateSloContract({
      ...sources,
      metricCatalog: sources.metricCatalog.replace("0.4,", ""),
    }).length > 0,
  );
});
