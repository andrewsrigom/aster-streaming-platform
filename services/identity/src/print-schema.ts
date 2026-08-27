import { printSubgraphSchema } from "@apollo/subgraph";
import { createIdentitySchema } from "./transport/identity-schema.js";

process.stdout.write(printSubgraphSchema(createIdentitySchema()) + "\n");
