import eslint from "@eslint/js";
import typescriptEslint from "typescript-eslint";

const nodeGlobals = {
  Buffer: "readonly",
  console: "readonly",
  process: "readonly",
};
const typedFiles = ["**/*.{ts,tsx,mts,cts}"];
const strictTypeChecked = typescriptEslint.configs.strictTypeChecked.map((configuration) => ({
  ...configuration,
  files: typedFiles,
}));

export default typescriptEslint.config(
  {
    ignores: [
      ".git/**",
      ".turbo/**",
      "coverage/**",
      "dist/**",
      "docs/**",
      "evidence/**",
      "node_modules/**",
      "pnpm-lock.yaml",
    ],
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
  },
  eslint.configs.recommended,
  ...strictTypeChecked,
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx,mts,cts}"],
    languageOptions: {
      globals: nodeGlobals,
    },
    rules: {
      curly: ["error", "all"],
      eqeqeq: ["error", "always"],
    },
  },
  {
    files: typedFiles,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      "@typescript-eslint/switch-exhaustiveness-check": "error",
    },
  },
  {
    files: ["**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
    },
  },
);
