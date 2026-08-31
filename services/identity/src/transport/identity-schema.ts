import { buildSubgraphSchema } from "@apollo/subgraph";
import DataLoader from "dataloader";
import { GraphQLError, parse } from "graphql";

import type { createIdentityProfiles } from "../application/profiles.js";
import type { createIdentitySessions } from "../application/sessions.js";
import type { ProfileRequest, ProfileResult } from "../application/profile-ports.js";
import { profileIdentifier, type ViewerProfile } from "../domain/profile.js";

export const IDENTITY_TYPE_DEFS = parse(`
  extend schema
    @link(
      url: "https://specs.apollo.dev/federation/v2.9"
      import: ["@key", "@inaccessible", "@cost", "@listSize"]
    )
  enum IdentityOutcome {
    COMPLETED UNAUTHENTICATED UNAVAILABLE CANCELLED INDETERMINATE
    LIMIT_EXCEEDED INVALID_INPUT NOT_FOUND CONFLICT BACKPRESSURE
  }
  enum ProfileMaturity { GENERAL TEEN MATURE }
  type Profile @key(fields: "id") @cost(weight: 4) {
    id: ID!
    displayName: String!
    locale: String!
    maturity: ProfileMaturity!
    avatarRef: String
    version: Int!
  }
  type Viewer { accountId: ID! expiresAt: String! }
  type EngagementProfileAuthority @inaccessible {
    code: IdentityOutcome! accountId: ID profileId: ID checkedAt: Float expiresAt: Float
  }
  type OwnedProfiles {
    profiles: [Profile!]! @listSize(assumedSize: 16)
    activeProfileId: ID
  }
  type SessionPayload { code: IdentityOutcome! correlationId: ID! viewer: Viewer }
  type ProfileMutationPayload {
    code: IdentityOutcome!
    correlationId: ID!
    profileId: ID
    version: Int
  }
  type ProfileSelectionPayload { code: IdentityOutcome! correlationId: ID! profile: Profile }
  input ProfilePreferencesInput {
    displayName: String!
    locale: String!
    maturity: ProfileMaturity!
  }
  input CreateProfileInput { mutationId: ID! profile: ProfilePreferencesInput! }
  input UpdateProfileInput {
    mutationId: ID!
    profileId: ID!
    expectedVersion: Int!
    profile: ProfilePreferencesInput!
  }
  input DeleteProfileInput { mutationId: ID! profileId: ID! expectedVersion: Int! }
  type Query {
    _engagementProfile(profileId: ID!): EngagementProfileAuthority! @inaccessible
    me: Viewer @cost(weight: 4)
    profiles: OwnedProfiles! @cost(weight: 6)
    profile(id: ID!): Profile @cost(weight: 4)
    activeProfile(id: ID!): Profile @cost(weight: 4)
  }
  type Mutation {
    demoSignIn: SessionPayload! @cost(weight: 12)
    signOut: SessionPayload! @cost(weight: 12)
    createProfile(input: CreateProfileInput!): ProfileMutationPayload! @cost(weight: 18)
    updateProfile(input: UpdateProfileInput!): ProfileMutationPayload! @cost(weight: 18)
    deleteProfile(input: DeleteProfileInput!): ProfileMutationPayload! @cost(weight: 18)
    selectProfile(id: ID!): ProfileSelectionPayload! @cost(weight: 12)
  }
`);

export interface IdentityGraphqlApplications {
  readonly sessions: ReturnType<typeof createIdentitySessions>;
  readonly profiles: ReturnType<typeof createIdentityProfiles>;
}

type ProfileSnapshot = Readonly<{
  profiles: readonly ViewerProfile[];
  activeProfileId: string | null;
}>;
const ownedContexts = new WeakSet<object>();
const CONTEXT_OWNER = Symbol("identity-request-owner");

export interface IdentityGraphqlContext {
  readonly request: ProfileRequest;
  readonly applications: IdentityGraphqlApplications;
  readonly profile: DataLoader<string, ViewerProfile | null>;
  readonly snapshot: () => Promise<ProfileSnapshot>;
  readonly issueCookie: (credential: string, expiresAt: number) => void;
  readonly clearCookie: () => void;
  readonly outcome: { code: string };
  readonly engagement: boolean;
}

export class IdentityGraphqlError extends GraphQLError {
  constructor(code: string) {
    super("Identity operation rejected.", { extensions: { code } });
  }
}

function identityContext(value: unknown): IdentityGraphqlContext {
  const owner: unknown =
    typeof value === "object" && value !== null
      ? Object.getOwnPropertyDescriptor(value, CONTEXT_OWNER)?.value
      : undefined;
  if (typeof owner !== "object" || owner === null || !ownedContexts.has(owner)) {
    throw new IdentityGraphqlError("UNAVAILABLE");
  }
  return owner as IdentityGraphqlContext;
}

function valueOrThrow<T>(result: ProfileResult<T>, context: IdentityGraphqlContext): T {
  if (result.status !== "completed") {
    context.outcome.code = result.status.toUpperCase();
    throw new IdentityGraphqlError(context.outcome.code);
  }
  return result.value;
}

function payload<T>(result: ProfileResult<T>, context: IdentityGraphqlContext) {
  const code = result.status.toUpperCase();
  context.outcome.code = code;
  return { code, correlationId: context.request.context.correlationId };
}

export function createIdentityGraphqlContext(
  applications: IdentityGraphqlApplications,
  request: ProfileRequest,
  cookies: Pick<IdentityGraphqlContext, "issueCookie" | "clearCookie">,
  engagement = false,
): IdentityGraphqlContext {
  let snapshot: Promise<ProfileSnapshot> | undefined;
  const context: IdentityGraphqlContext = {
    applications,
    request,
    ...cookies,
    engagement,
    outcome: { code: "COMPLETED" },
    snapshot: () => {
      snapshot ??= applications.profiles
        .list(request)
        .then((result) => valueOrThrow(result, context));
      return snapshot;
    },
    profile: new DataLoader<string, ViewerProfile | null>(
      async (ids) => {
        const owned = new Map(
          (await context.snapshot()).profiles.map((profile) => [profile.id, profile]),
        );
        return ids.map((id) => owned.get(id) ?? null);
      },
      { maxBatchSize: 16 },
    ),
  };
  ownedContexts.add(context);
  // Apollo shallow-clones its context envelope; preserve the one request owner across that clone.
  Object.defineProperty(context, CONTEXT_OWNER, { value: context, enumerable: true });
  return context;
}

export function createIdentitySchema() {
  return buildSubgraphSchema({
    typeDefs: IDENTITY_TYPE_DEFS,
    resolvers: {
      Query: {
        _engagementProfile: async (_: unknown, args: { profileId: unknown }, raw: unknown) => {
          const context = identityContext(raw);
          if (!context.engagement || context.request.signal.aborted) {
            throw new IdentityGraphqlError("UNAVAILABLE");
          }
          const result = await context.applications.profiles.authorize(
            context.request,
            args.profileId,
          );
          return {
            code: payload(result, context).code,
            ...(result.status === "completed" ? result.value : {}),
          };
        },
        me: async (_: unknown, _args: unknown, rawContext: unknown) => {
          const context = identityContext(rawContext);
          const result = await context.applications.sessions.restore(
            context.request.credential,
            context.request.signal,
          );
          if (result.status === "unauthenticated") {
            return null;
          }
          const session = valueOrThrow(result, context);
          return {
            accountId: session.accountId,
            expiresAt: new Date(session.expiresAt * 1_000).toISOString(),
          };
        },
        profiles: (_: unknown, _args: unknown, rawContext: unknown) =>
          identityContext(rawContext).snapshot(),
        profile: (_: unknown, args: { id: string }, rawContext: unknown) => {
          const context = identityContext(rawContext);
          if (!profileIdentifier(args.id)) {
            throw new IdentityGraphqlError("INVALID_INPUT");
          }
          return context.profile.load(args.id);
        },
        activeProfile: async (_: unknown, args: { id: string }, rawContext: unknown) => {
          const context = identityContext(rawContext);
          if (!profileIdentifier(args.id)) {
            throw new IdentityGraphqlError("INVALID_INPUT");
          }
          const snapshot = await context.snapshot();
          return snapshot.activeProfileId === args.id ? context.profile.load(args.id) : null;
        },
      },
      Profile: {
        __resolveReference: (reference: Record<string, unknown>, rawContext: unknown) => {
          const context = identityContext(rawContext);
          if (!profileIdentifier(reference["id"])) {
            throw new IdentityGraphqlError("INVALID_INPUT");
          }
          // Apollo annotates entity DTOs; copy only owned fields without mutating frozen domain rows.
          return context.profile.load(reference["id"]).then((profile) =>
            profile
              ? {
                  id: profile.id,
                  displayName: profile.displayName,
                  locale: profile.locale,
                  maturity: profile.maturity,
                  avatarRef: profile.avatarRef,
                  version: profile.version,
                }
              : null,
          );
        },
      },
      Mutation: {
        demoSignIn: async (_: unknown, _args: unknown, rawContext: unknown) => {
          const context = identityContext(rawContext);
          const result = await context.applications.sessions.signIn(context.request.signal);
          if (result.status !== "completed") {
            return payload(result, context);
          }
          context.issueCookie(result.value.credential, result.value.expiresAt);
          return {
            ...payload(result, context),
            viewer: {
              accountId: result.value.accountId,
              expiresAt: new Date(result.value.expiresAt * 1_000).toISOString(),
            },
          };
        },
        signOut: async (_: unknown, _args: unknown, rawContext: unknown) => {
          const context = identityContext(rawContext);
          const result = await context.applications.sessions.signOut(
            context.request.credential,
            context.request.signal,
          );
          if (result.status === "completed") {
            context.clearCookie();
          }
          return payload(result, context);
        },
        createProfile: async (_: unknown, args: { input: unknown }, rawContext: unknown) => {
          const context = identityContext(rawContext);
          const result = await context.applications.profiles.create(context.request, args.input);
          return {
            ...payload(result, context),
            ...(result.status === "completed" ? result.value : {}),
          };
        },
        updateProfile: async (_: unknown, args: { input: unknown }, rawContext: unknown) => {
          const context = identityContext(rawContext);
          const result = await context.applications.profiles.update(context.request, args.input);
          return {
            ...payload(result, context),
            ...(result.status === "completed" ? result.value : {}),
          };
        },
        deleteProfile: async (_: unknown, args: { input: unknown }, rawContext: unknown) => {
          const context = identityContext(rawContext);
          const result = await context.applications.profiles.delete(context.request, args.input);
          return {
            ...payload(result, context),
            ...(result.status === "completed" ? result.value : {}),
          };
        },
        selectProfile: async (_: unknown, args: { id: string }, rawContext: unknown) => {
          const context = identityContext(rawContext);
          const result = await context.applications.profiles.select(context.request, args.id);
          return {
            ...payload(result, context),
            profile: result.status === "completed" ? result.value : null,
          };
        },
      },
    },
  });
}
