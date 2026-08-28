import { GraphQLError } from "graphql";

export class EngagementGraphqlError extends GraphQLError {
  constructor(code: string) {
    super("Engagement operation rejected.", { extensions: { code } });
  }
}
