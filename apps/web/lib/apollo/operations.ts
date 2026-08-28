import { gql, type TypedDocumentNode } from "@apollo/client";

export interface PublicTitle {
  __typename?: "Title";
  id: string;
  localized: { locale: string; title: string; synopsis: string };
  runtimeSeconds: number | null;
  releaseYear: number | null;
  languages: string[];
  genres: string[];
  accessibility: string[];
  editorialLabels: string[];
  credits: { name: string; role: string }[];
  artwork: {
    url: string;
    altText: string;
    attribution: { creator: string; licenseUrl: string };
  } | null;
  attribution: {
    workTitle: string;
    creator: string;
    copyrightHolder: string;
    sourceUrl: string;
    licenseName: string;
    licenseVersion: string;
    licenseUrl: string;
    attributionText: string;
    modificationNotice: string;
  };
}
export interface BrowseData {
  titles: {
    __typename?: string;
    edges: { cursor: string; node: PublicTitle }[];
    pageInfo: { __typename?: string; endCursor: string | null; hasNextPage: boolean };
  };
}
export interface BrowseVariables {
  first: number;
  after: string | null;
  locale: string;
}

export const BROWSE: TypedDocumentNode<BrowseData, BrowseVariables> = gql`
  query Browse($first: Int! = 20, $after: String, $locale: String! = "en") {
    titles(first: $first, after: $after) {
      edges {
        cursor
        node {
          id
          localized(locale: $locale) {
            locale
            title
            synopsis
          }
          runtimeSeconds
          releaseYear
          languages
          genres
          accessibility
          editorialLabels
          credits {
            name
            role
          }
          artwork {
            url
            altText
            attribution {
              creator
              licenseUrl
            }
          }
          attribution {
            workTitle
            creator
            copyrightHolder
            sourceUrl
            licenseName
            licenseVersion
            licenseUrl
            attributionText
            modificationNotice
          }
        }
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
`;

export interface DetailData {
  title: PublicTitle | null;
}
export const TITLE_DETAIL: TypedDocumentNode<DetailData, { id: string; locale: string }> = gql`
  query TitleDetail($id: ID!, $locale: String! = "en") {
    title(id: $id) {
      id
      localized(locale: $locale) {
        locale
        title
        synopsis
      }
      runtimeSeconds
      releaseYear
      languages
      genres
      accessibility
      editorialLabels
      credits {
        name
        role
      }
      artwork {
        url
        altText
        attribution {
          creator
          licenseUrl
        }
      }
      attribution {
        workTitle
        creator
        copyrightHolder
        sourceUrl
        licenseName
        licenseVersion
        licenseUrl
        attributionText
        modificationNotice
      }
    }
  }
`;

export function browseVariables(
  input: Record<string, string | string[] | undefined>,
): BrowseVariables {
  const locale = input["locale"] === "pt-BR" ? "pt-BR" : "en";
  const after = input["after"];
  if (
    after !== undefined &&
    (typeof after !== "string" || after.length > 256 || !/^[A-Za-z0-9_-]+$/u.test(after))
  ) {
    throw new Error("Invalid Catalog page.");
  }
  return { first: 20, after: after ?? null, locale };
}

export function titleIdentifier(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);
}
