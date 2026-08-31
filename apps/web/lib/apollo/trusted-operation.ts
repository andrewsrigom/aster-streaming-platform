import { addTypenameToDocument } from "@apollo/client/utilities";
import { print, type DocumentNode } from "graphql";

export function apolloOperationBody(document: DocumentNode): string {
  return print(addTypenameToDocument(document));
}
