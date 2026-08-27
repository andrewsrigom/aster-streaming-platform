import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { request } from "node:http";
import { URL } from "node:url";

const args = process.argv.slice(2);
assert.ok(
  args.length === 0 ||
    (args.length === 1 && ["--direct-subgraph", "--compose-router"].includes(args[0])),
);
const origin = args[0] === "--direct-subgraph" ? "http://127.0.0.1:3100" : "http://127.0.0.1:4000";
const endpoint = args[0] === "--compose-router" ? "http://router:4000" : origin;
const signal = globalThis.AbortSignal.timeout(15_000);
let cookie = "";
let createdProfile;
let stage = "sign-in";
const call = async (query, variables = {}) => {
  const body = JSON.stringify({
    query,
    variables,
    operationName: /^(?:query|mutation)\s+(\w+)/.exec(query)?.[1],
  });
  const response = await new Promise((resolve, reject) => {
    const client = request(
      endpoint + "/graphql",
      {
        method: "POST",
        headers: {
          origin,
          host: new URL(origin).host,
          "x-aster-csrf": "1",
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
          connection: "close",
          ...(cookie ? { cookie } : {}),
        },
        signal,
      },
      (message) => {
        let text = "";
        message.setEncoding("utf8");
        message.on("data", (chunk) => {
          text += chunk;
          if (Buffer.byteLength(text) > 32768) {
            message.destroy(new Error("Demo response exceeded its bound."));
          }
        });
        message.on("error", reject);
        message.on("end", () =>
          resolve({ status: message.statusCode, headers: message.headers, text }),
        );
      },
    );
    client.on("error", reject);
    client.end(body);
  });
  const json = JSON.parse(response.text);
  assert.equal(response.status, 200);
  assert.equal(json.errors, undefined);
  const issued = response.headers["set-cookie"]?.[0];
  if (issued) {
    cookie = issued.split(";")[0];
  }
  return json.data;
};
const logout = () => call("mutation SignOut { signOut { code } }");
const remove = async () => {
  const result = await call(
    "mutation DeleteProfile($input:DeleteProfileInput!) { deleteProfile(input:$input) { code } }",
    { input: { mutationId: randomUUID(), profileId: createdProfile, expectedVersion: 1 } },
  );
  assert.equal(result.deleteProfile.code, "COMPLETED");
  createdProfile = undefined;
};

try {
  const signed = await call("mutation DemoSignIn { demoSignIn { code } }");
  assert.equal(signed.demoSignIn.code, "COMPLETED");
  stage = "create";
  const created = await call(
    "mutation CreateProfile($input:CreateProfileInput!) { createProfile(input:$input) { code profileId } }",
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
    "mutation SelectProfile($id:ID!) { selectProfile(id:$id) { code profile { id } } }",
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
