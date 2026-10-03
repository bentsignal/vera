import type { Rule } from "eslint";
import reactPlugin from "eslint-plugin-react";
import reactCompiler from "eslint-plugin-react-compiler";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig } from "eslint/config";

/**
 * React escape hatches need a reason. A comment that turns off the effect
 * ban (`no-restricted-syntax`), a hooks rule, or the React Compiler rule must
 * say why after `--`, as in
 * `// eslint-disable-next-line no-restricted-syntax -- Subscribes to the OS keyboard.`
 */
const GUARDED =
  /\b(no-restricted-syntax|no-restricted-imports|react-hooks\/[\w-]+|react-compiler\/react-compiler)\b/;

const requireReason: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: { description: "Require a reason on disables of React rules" },
    schema: [],
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          const text = comment.value.trim();
          if (!text.startsWith("eslint-disable")) continue;
          const [directive = "", reason] = text.split(/\s--\s/);
          if (!GUARDED.test(directive)) continue;
          if (reason !== undefined && reason.trim().length >= 10) continue;
          context.report({
            loc: comment.loc ?? { line: 1, column: 0 },
            message:
              "Explain why this React rule is turned off: add ` -- <reason>` to the comment. Prefer fixing the code.",
          });
        }
      },
    };
  },
};

const explainedDisablesPlugin = {
  rules: { "require-reason": requireReason },
};

export const reactConfig = defineConfig(
  {
    files: ["**/*.ts", "**/*.tsx"],
    ...reactPlugin.configs.flat.recommended,
    ...reactPlugin.configs.flat["jsx-runtime"],
    ...reactCompiler.configs.recommended,
    plugins: {
      ...reactPlugin.configs.flat.recommended?.plugins,
      ...reactPlugin.configs.flat["jsx-runtime"]?.plugins,
      ...reactCompiler.configs.recommended.plugins,
      "explained-disables": explainedDisablesPlugin,
    },
    languageOptions: {
      ...reactPlugin.configs.flat.recommended?.languageOptions,
      ...reactPlugin.configs.flat["jsx-runtime"]?.languageOptions,
      globals: {
        React: "writable",
      },
    },
    rules: {
      "react-compiler/react-compiler": "error",
      "explained-disables/require-reason": "error",
      "react/no-unstable-nested-components": ["error", { allowAsProps: true }],
      "@typescript-eslint/only-throw-error": "off",
    },
  },
  reactHooks.configs.flat["recommended-latest"]!,
);
