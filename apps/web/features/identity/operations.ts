import { gql, type TypedDocumentNode } from "@apollo/client";

export interface Viewer {
  accountId: string;
  expiresAt: string;
}
export interface Profile {
  id: string;
  displayName: string;
  locale: string;
  maturity: "GENERAL" | "TEEN" | "MATURE";
  avatarRef: string | null;
  version: number;
}
export interface ProfilePreferences {
  displayName: string;
  locale: string;
  maturity: Profile["maturity"];
}
interface Outcome {
  code: string;
  correlationId: string;
}
export const VIEWER: TypedDocumentNode<{ me: Viewer | null }> = gql`
  query Viewer {
    me {
      accountId
      expiresAt
    }
  }
`;
export const PROFILES: TypedDocumentNode<{
  profiles: { profiles: Profile[]; activeProfileId: string | null };
}> = gql`
  query Profiles {
    profiles {
      profiles {
        id
        displayName
        locale
        maturity
        avatarRef
        version
      }
      activeProfileId
    }
  }
`;
export const DEMO_SIGN_IN: TypedDocumentNode<{ demoSignIn: Outcome & { viewer: Viewer | null } }> =
  gql`
    mutation DemoSignIn {
      demoSignIn {
        code
        correlationId
        viewer {
          accountId
          expiresAt
        }
      }
    }
  `;
export const SIGN_OUT: TypedDocumentNode<{
  signOut: Outcome & { viewer: { accountId: string } | null };
}> = gql`
  mutation SignOut {
    signOut {
      code
      correlationId
      viewer {
        accountId
      }
    }
  }
`;
export const CREATE_PROFILE: TypedDocumentNode<
  { createProfile: Outcome & { profileId: string | null; version: number | null } },
  { input: { mutationId: string; profile: ProfilePreferences } }
> = gql`
  mutation CreateProfile($input: CreateProfileInput!) {
    createProfile(input: $input) {
      code
      correlationId
      profileId
      version
    }
  }
`;
export const SELECT_PROFILE: TypedDocumentNode<
  { selectProfile: Outcome & { profile: { id: string; displayName: string } | null } },
  { id: string }
> = gql`
  mutation SelectProfile($id: ID!) {
    selectProfile(id: $id) {
      code
      correlationId
      profile {
        id
        displayName
      }
    }
  }
`;
export const identityOperations = {
  Viewer: VIEWER,
  Profiles: PROFILES,
  DemoSignIn: DEMO_SIGN_IN,
  SignOut: SIGN_OUT,
  CreateProfile: CREATE_PROFILE,
  SelectProfile: SELECT_PROFILE,
};
