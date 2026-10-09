import type { Rule } from "eslint";
import { defineConfig } from "eslint/config";

import { baseConfig, strictConfig } from "@acme/eslint-config/base";
import { reactConfig } from "@acme/eslint-config/react";
import { createStrictSyntax } from "@acme/eslint-config/syntax";

/** PDS functions that search by name: `pds.accounts.searchProfiles`, ... */
const SEARCH_FUNCTION = /^search|search$|^lookup/i;
/** Query arguments that carry typed search text. */
const SEARCH_ARGUMENT = /^(query|search|searchText|term|text|prefix|needle)$/;

const searchMessage =
  "Run PDS searches through `useSearchQuery` with the query from `useSearchText` (~/features/search/use-search-query), so typing is debounced and earlier results stay up while the next ones load.";

/**
 * Searches run as people type, so each one must be debounced and keep its
 * previous results while the next load, or results flicker. The shared
 * hooks do both; this rule keeps PDS searches inside `useSearchQuery(...)`.
 * It flags a `pds.<module>.<search function>` reference, or a `pdsQuery`
 * whose args carry search text, anywhere else.
 */
const debouncedSearch: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: { description: "Require PDS searches to use useSearchQuery" },
    schema: [],
  },
  create(context) {
    function insideSearchQuery(node: Rule.Node) {
      return context.sourceCode
        .getAncestors(node)
        .some(
          (ancestor) =>
            ancestor.type === "CallExpression" &&
            ancestor.callee.type === "Identifier" &&
            ancestor.callee.name === "useSearchQuery",
        );
    }
    return {
      MemberExpression(node) {
        const { object, property } = node;
        if (
          object.type === "MemberExpression" &&
          object.object.type === "Identifier" &&
          object.object.name === "pds" &&
          property.type === "Identifier" &&
          SEARCH_FUNCTION.test(property.name) &&
          !insideSearchQuery(node)
        ) {
          context.report({ message: searchMessage, node });
        }
      },
      "CallExpression[callee.name='pdsQuery'] > ObjectExpression > Property[key.name='args'] > ObjectExpression > Property"(
        node: Rule.Node,
      ) {
        if (
          node.type === "Property" &&
          node.key.type === "Identifier" &&
          SEARCH_ARGUMENT.test(node.key.name) &&
          !insideSearchQuery(node)
        ) {
          context.report({ message: searchMessage, node });
        }
      },
    };
  },
};

export default defineConfig(
  // Expo config plugins are build-time CommonJS scripts.
  { ignores: ["plugins/**"] },
  baseConfig,
  strictConfig,
  reactConfig,
  createStrictSyntax({ ts: true, react: true }),
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    plugins: { vera: { rules: { "debounced-search": debouncedSearch } } },
    rules: { "vera/debounced-search": "error" },
  },
);
