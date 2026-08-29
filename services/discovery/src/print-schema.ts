import { printSubgraphSchema } from "@apollo/subgraph";
import { createDiscoverySchema } from "./transport/discovery-schema.js";

process.stdout.write(printSubgraphSchema(createDiscoverySchema()) + "\n");
