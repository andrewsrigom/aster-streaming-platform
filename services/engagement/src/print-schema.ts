import { printSubgraphSchema } from "@apollo/subgraph";
import { createEngagementSchema } from "./transport/engagement-schema.js";

process.stdout.write(printSubgraphSchema(createEngagementSchema()) + "\n");
