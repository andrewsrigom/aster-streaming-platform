import { createAsterDeadline } from "../../src/index.js";

createAsterDeadline({ timeoutMs: 300_000 });
process.stdout.write("CREATED\n");
