import { printSubgraphSchema } from "@apollo/subgraph";
import { createPlaybackSchema } from "./transport/playback-schema.js";

process.stdout.write(printSubgraphSchema(createPlaybackSchema()) + "\n");
