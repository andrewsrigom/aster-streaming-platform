import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const origin = "http://127.0.0.1:3100";
const signal = globalThis.AbortSignal.timeout(15_000);
let cookie = "";
let createdProfile;
let stage = "sign-in";
const call = async (query, variables = {}) => {
  const response = await globalThis.fetch(origin + "/graphql", {
    method: "POST",
    headers: {
      origin,
      "x-aster-csrf": "1",
      "content-type": "application/json",
      connection: "close",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ query, variables }),
    signal,
  });
  const json = await response.json();
  assert.equal(response.status, 200);
  assert.equal(json.errors, undefined);
  const issued = response.headers.get("set-cookie");
  if (issued) {
    cookie = issued.split(";")[0];
  }
  return json.data;
};
const logout = () => call("mutation Logout { signOut { code } }");
const remove = async () => {
  const result = await call(
    "mutation Delete($input:DeleteProfileInput!) { deleteProfile(input:$input) { code } }",
    { input: { mutationId: randomUUID(), profileId: createdProfile, expectedVersion: 1 } },
  );
  assert.equal(result.deleteProfile.code, "COMPLETED");
  createdProfile = undefined;
};

try {
  const signed = await call("mutation Login { demoSignIn { code } }");
  assert.equal(signed.demoSignIn.code, "COMPLETED");
  stage = "create";
  const created = await call(
    "mutation Create($input:CreateProfileInput!) { createProfile(input:$input) { code profileId } }",
    {
      input: {
        mutationId: randomUUID(),
        profile: { displayName: "Docker synthetic", locale: "pt-BR", maturity: "GENERAL" },
      },
    },
  );
  assert.equal(created.createProfile.code, "COMPLETED");
  createdProfile = created.createProfile.profileId;
  stage = "select";
  const selected = await call(
    "mutation Select($id:ID!) { selectProfile(id:$id) { code profile { id } } }",
    { id: createdProfile },
  );
  assert.equal(selected.selectProfile.profile.id, createdProfile);
  stage = "list";
  const listed = await call("query Profiles { profiles { profiles { id } activeProfileId } }");
  assert.equal(listed.profiles.activeProfileId, createdProfile);
  stage = "delete";
  await remove();
  stage = "sign-out";
  assert.equal((await logout()).signOut.code, "COMPLETED");
  cookie = "";
  process.stdout.write(
    JSON.stringify({
      event: "aster.identity.demo_verified",
      steps: ["sign-in", "create", "select", "list", "delete", "sign-out"],
    }) + "\n",
  );
} catch {
  process.stderr.write(JSON.stringify({ event: "aster.identity.demo_failed", stage }) + "\n");
  process.exitCode = 1;
} finally {
  if (createdProfile) {
    await remove().catch(() => {
      process.exitCode = 1;
    });
  }
  if (cookie) {
    await logout().catch(() => {
      process.exitCode = 1;
    });
  }
}
