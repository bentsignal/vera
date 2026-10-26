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

/**
 * Style properties that change layout. Animating one re-lays out its
 * screen (a whole message list, say) on every frame, which on a phone runs
 * at 30fps or worse. Animate `transform` and `opacity` instead, which move
 * and fade what's already laid out.
 */
const LAYOUT_PROPERTIES = new Set([
  "aspectRatio",
  "borderBottomWidth",
  "borderEndWidth",
  "borderLeftWidth",
  "borderRightWidth",
  "borderStartWidth",
  "borderTopWidth",
  "borderWidth",
  "bottom",
  "columnGap",
  "end",
  "flex",
  "flexBasis",
  "flexGrow",
  "flexShrink",
  "gap",
  "height",
  "inset",
  "left",
  "margin",
  "marginBottom",
  "marginEnd",
  "marginHorizontal",
  "marginLeft",
  "marginRight",
  "marginStart",
  "marginTop",
  "marginVertical",
  "maxHeight",
  "maxWidth",
  "minHeight",
  "minWidth",
  "padding",
  "paddingBottom",
  "paddingEnd",
  "paddingHorizontal",
  "paddingLeft",
  "paddingRight",
  "paddingStart",
  "paddingTop",
  "paddingVertical",
  "right",
  "rowGap",
  "start",
  "top",
  "width",
]);

const layoutMessage = (what: string) =>
  `${what} animates layout, which re-lays out the screen every frame (30fps or worse on a phone). Animate transform or opacity instead; if layout has to change, change it once and move things with a transform.`;

function keyName(property: { key: unknown; computed?: boolean }) {
  const key = property.key as { type: string; name?: string; value?: unknown };
  if (property.computed === true) return undefined;
  if (key.type === "Identifier") return key.name;
  if (key.type === "Literal" && typeof key.value === "string") return key.value;
  return undefined;
}

type ObjectNode = Extract<Rule.Node, { type: "ObjectExpression" }>;

/** The layout properties set in `object`. */
function layoutKeys(object: ObjectNode) {
  return object.properties.flatMap((property) => {
    if (property.type !== "Property") return [];
    const name = keyName(property);
    return name !== undefined && LAYOUT_PROPERTIES.has(name)
      ? [{ name, node: property }]
      : [];
  });
}

/** The strings in a literal or an array of literals. */
function strings(node: Rule.Node | undefined): string[] {
  if (node === undefined) return [];
  if (node.type === "Literal" && typeof node.value === "string") {
    return [node.value];
  }
  if (node.type === "ArrayExpression") {
    return node.elements.flatMap((element) =>
      element !== null && element.type !== "SpreadElement"
        ? strings(element as Rule.Node)
        : [],
    );
  }
  return [];
}

/**
 * Smooth animation is not optional, and a layout animation can't be
 * smooth: it re-lays out every frame. This catches the ways to write one:
 * a layout property in a Reanimated animated style, keyframe, or CSS
 * animation, and a CSS transition of one (or of "all", the default).
 */
const noLayoutAnimation: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: { description: "Disallow animating layout properties" },
    schema: [],
  },
  create(context) {
    function reportKeys(object: ObjectNode, what: string) {
      for (const { name, node } of layoutKeys(object)) {
        context.report({ message: layoutMessage(`${what} \`${name}\``), node });
      }
    }
    /** Objects a worklet returns: its body, or what its returns give. */
    function returnedObjects(fn: Rule.Node) {
      if (
        fn.type !== "ArrowFunctionExpression" &&
        fn.type !== "FunctionExpression"
      ) {
        return [];
      }
      if (fn.body.type === "ObjectExpression") return [fn.body as ObjectNode];
      const found: ObjectNode[] = [];
      const visit = (node: unknown) => {
        if (node === null || typeof node !== "object") return;
        const typed = node as Rule.Node;
        if (
          typed.type === "FunctionExpression" ||
          typed.type === "ArrowFunctionExpression" ||
          typed.type === "FunctionDeclaration"
        ) {
          return;
        }
        if (
          typed.type === "ReturnStatement" &&
          typed.argument?.type === "ObjectExpression"
        ) {
          found.push(typed.argument as ObjectNode);
        }
        for (const [key, value] of Object.entries(typed)) {
          if (key === "parent") continue;
          if (Array.isArray(value)) value.forEach(visit);
          else visit(value);
        }
      };
      visit(fn.body);
      return found;
    }
    return {
      CallExpression(node) {
        const callee = node.callee;
        const name = callee.type === "Identifier" ? callee.name : undefined;
        if (name === "useAnimatedStyle") {
          const [fn] = node.arguments;
          if (fn === undefined) return;
          for (const object of returnedObjects(fn as Rule.Node)) {
            reportKeys(object, "An animated style's");
          }
        }
      },
      NewExpression(node) {
        if (
          node.callee.type !== "Identifier" ||
          node.callee.name !== "Keyframe"
        ) {
          return;
        }
        const [frames] = node.arguments;
        if (frames?.type !== "ObjectExpression") return;
        for (const frame of frames.properties) {
          if (
            frame.type === "Property" &&
            frame.value.type === "ObjectExpression"
          ) {
            reportKeys(frame.value as ObjectNode, "A keyframe's");
          }
        }
      },
      ObjectExpression(node) {
        const byName = new Map(
          node.properties.flatMap((property) =>
            property.type === "Property"
              ? [[keyName(property), property] as const]
              : [],
          ),
        );
        const transition = byName.get("transitionProperty");
        const duration = byName.get("transitionDuration");
        if (transition !== undefined) {
          for (const value of strings(transition.value as Rule.Node)) {
            if (value === "all" || LAYOUT_PROPERTIES.has(value)) {
              context.report({
                message: layoutMessage(`A CSS transition of \`${value}\``),
                node: transition,
              });
            }
          }
        } else if (duration !== undefined) {
          context.report({
            message: layoutMessage(
              "A CSS transition without transitionProperty (so of every property)",
            ),
            node: duration,
          });
        }
        const animation = byName.get("animationName");
        if (animation?.value.type === "ObjectExpression") {
          for (const frame of animation.value.properties) {
            if (
              frame.type === "Property" &&
              frame.value.type === "ObjectExpression"
            ) {
              reportKeys(frame.value as ObjectNode, "A CSS animation's");
            }
          }
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
    plugins: {
      vera: {
        rules: {
          "debounced-search": debouncedSearch,
          "no-layout-animation": noLayoutAnimation,
        },
      },
    },
    rules: {
      "vera/debounced-search": "error",
      "vera/no-layout-animation": "error",
    },
  },
);
