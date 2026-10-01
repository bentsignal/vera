import type {
  DiscoveredPds,
  FederationConnection,
  FederationMutationReference,
  FederationQueryReference,
} from "@decentralized-convex/client";
import type { Message } from "@decentralized-convex/messages";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import {
  DecentralizedConvexClient,
  pdsApiRequirements,
} from "@decentralized-convex/client";
import { pdsQuery, PdsQueryClient } from "@decentralized-convex/tanstack-query";
import { pds } from "@vera/backend/pds";

export type PdsSsrValidationMode = "error" | "success";

const requirements = pdsApiRequirements(pds);

export function pdsSsrValidationQuery(mode: PdsSsrValidationMode) {
  return pdsQuery({
    args: { conversationId: `ssr-validation-${mode}` },
    options: { requireCompleteResults: true },
    query: pds.messages.list,
  });
}

export function createPdsSsrValidationClient(mode: PdsSsrValidationMode) {
  const client = new DecentralizedConvexClient({
    connectionFactory: (url) => new SsrValidationConnection(mode, url),
    pds: {
      discover: (domain) => Promise.resolve(validationPds(domain)),
      home: validationPds("ssr-home.test"),
    },
  });
  return { client, pdsQueryClient: new PdsQueryClient(client) };
}

class SsrValidationConnection implements FederationConnection {
  readonly #mode;
  readonly #url;

  constructor(mode: PdsSsrValidationMode, url: string) {
    this.#mode = mode;
    this.#url = url;
  }

  close() {
    return Promise.resolve();
  }

  mutation<Mutation extends FederationMutationReference>(): Promise<
    FunctionReturnType<Mutation>
  > {
    return Promise.reject(
      new Error("The SSR validation connection is read-only"),
    );
  }

  query<Query extends FederationQueryReference>(
    _query: Query,
    _args: FunctionArgs<Query>,
  ): Promise<FunctionReturnType<Query>> {
    if (this.#mode === "error" && this.#url === "https://ssr-remote.test") {
      return new Promise(() => undefined);
    }
    return Promise.resolve(this.#result("SSR initial data"));
  }

  subscribe<Query extends FederationQueryReference>(
    _query: Query,
    _args: FunctionArgs<Query>,
    onResult: (result: FunctionReturnType<Query>) => void,
  ) {
    if (this.#mode === "error" && this.#url === "https://ssr-remote.test") {
      return () => undefined;
    }
    onResult(this.#result("SSR initial data"));
    const timer =
      this.#url === "https://ssr-home.test"
        ? setTimeout(() => onResult(this.#result("Hydrated live update")), 100)
        : undefined;
    return () => {
      if (timer !== undefined) clearTimeout(timer);
    };
  }

  #result(label: string) {
    const domain = new URL(this.#url).hostname;
    const result = {
      routes: this.#url === "https://ssr-home.test" ? ["ssr-remote.test"] : [],
      value: [validationMessage(`${label} from ${domain}`, domain)],
    };
    // This fixture implements the transport's single dispatcher query.
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    return result as FunctionReturnType<FederationQueryReference>;
  }
}

function validationMessage(body: string, domain: string): Message {
  return {
    authorId: `validator@${domain}`,
    authorName: "SSR validator",
    body,
    conversationId: "ssr-validation",
    messageId: `message-${domain}`,
    sentAt: domain === "ssr-home.test" ? 1 : 2,
  };
}

function validationPds(domain: string): DiscoveredPds {
  return {
    domain,
    manifest: {
      accountDomain: domain,
      capabilities: requirements.capabilities,
      deploymentUrl: `https://${domain}`,
      httpUrl: `https://${domain}`,
      lastChanged: requirements.lastChanged,
      version: requirements.version,
    },
    manifestUrl: `https://${domain}/.well-known/pds.json`,
  };
}
