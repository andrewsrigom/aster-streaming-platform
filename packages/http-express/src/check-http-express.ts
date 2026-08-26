import { once } from "node:events";
import { createServer, type Server } from "node:http";

import { ApolloServer } from "@apollo/server";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import { expressMiddleware } from "@as-integrations/express5";

import {
  ASTER_GRAPHQL_BODY_LIMIT_BYTES,
  createExpressHttpAdapter,
  getExpressRequestAbortSignal,
} from "./index.js";

interface DiagnosticContext {
  readonly signal: AbortSignal;
}

const HTTP_DIAGNOSTIC_REQUEST_DEADLINE_MS = 2_000;

function localUrl(server: Server): string {
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("HTTP diagnostic address is unavailable.");
  }
  return `http://127.0.0.1:${address.port}`;
}

async function requestDiagnostic(url: string): Promise<{
  readonly payload: unknown;
  readonly response: Response;
}> {
  const controller = new AbortController();
  const deadline = setTimeout(() => {
    controller.abort();
  }, HTTP_DIAGNOSTIC_REQUEST_DEADLINE_MS);
  deadline.unref();
  try {
    const response = await fetch(`${url}/graphql`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "query TransportCheck { transportCheck }" }),
      signal: controller.signal,
    });
    const payload: unknown = await response.json();
    return { payload, response };
  } finally {
    clearTimeout(deadline);
  }
}

async function run(): Promise<void> {
  const adapter = createExpressHttpAdapter();
  const httpServer = createServer(adapter.requestListener);
  const apollo = new ApolloServer<DiagnosticContext>({
    typeDefs: "type Query { transportCheck: String! }",
    resolvers: {
      Query: {
        transportCheck: (
          _parent: unknown,
          _arguments: Record<string, never>,
          context: DiagnosticContext,
        ): string => (context.signal.aborted ? "aborted" : "ok"),
      },
    },
    introspection: false,
    includeStacktraceInErrorResponses: false,
    plugins: [ApolloServerPluginDrainHttpServer({ httpServer, stopGracePeriodMillis: 1_000 })],
  });
  let apolloStarted = false;
  let apolloStopped = false;

  try {
    await apollo.start();
    apolloStarted = true;
    adapter.mountGraphql(
      expressMiddleware(apollo, {
        context: ({ res }) => Promise.resolve({ signal: getExpressRequestAbortSignal(res) }),
      }),
    );
    httpServer.listen(0, "127.0.0.1");
    await once(httpServer, "listening");

    const { payload, response } = await requestDiagnostic(localUrl(httpServer));
    if (
      response.status !== 200 ||
      !payload ||
      typeof payload !== "object" ||
      !("data" in payload) ||
      !payload.data ||
      typeof payload.data !== "object" ||
      !("transportCheck" in payload.data) ||
      payload.data.transportCheck !== "ok"
    ) {
      throw new Error("HTTP diagnostic response is invalid.");
    }

    await apollo.stop();
    apolloStopped = true;
    process.stdout.write(
      `${JSON.stringify({
        check: "http-express",
        status: "ok",
        statusCode: response.status,
        bodyLimitBytes: ASTER_GRAPHQL_BODY_LIMIT_BYTES,
        frameworkDisclosure: response.headers.has("x-powered-by"),
      })}\n`,
    );
  } catch {
    if (apolloStarted && !apolloStopped) {
      try {
        await apollo.stop();
      } catch {
        // The diagnostic emits only its stable failure code below.
      }
    }
    if (httpServer.listening) {
      httpServer.close();
      httpServer.closeAllConnections();
    }
    process.stderr.write(
      `${JSON.stringify({ check: "http-express", status: "error", code: "HTTP_CHECK_FAILED" })}\n`,
    );
    process.exitCode = 1;
  }
}

await run();
