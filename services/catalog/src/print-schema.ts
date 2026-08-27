import { printSubgraphSchema } from "@apollo/subgraph";
import { createCatalogSchema } from "./transport/catalog-schema.js";

process.stdout.write(printSubgraphSchema(createCatalogSchema()) + "\n");
