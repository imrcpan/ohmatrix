import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.expo/**",
      "src/apps/mobile/.generated/**", // made at build time from the logo, not written by hand
      "src/apps/desktop/linux/react-native-skia-linux/**", // a submodule: someone else's code, checked by its own rules
      "src/e2e/.out/**",
      "src/e2e/test-results/**",
      "src/dev/synapse/data/**",
      "src/packages/engine-rust/{src/generated,cpp,android,ios,rust_modules}/**",
      "src/packages/engine-rust/src/Native*.ts",
      "src/apps/mobile/android/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Tool configuration files that the tools load as CommonJS (an Expo config plugin is one too).
    files: ["**/*.config.js", "**/react-native.config.js", "src/apps/mobile/plugins/*.js"],
    languageOptions: { sourceType: "commonjs", globals: { module: "writable", require: "readonly", __dirname: "readonly" } },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports", disallowTypeAnnotations: false }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  { files: ["**/*.cjs"], rules: { "@typescript-eslint/no-require-imports": "off" } },
  { files: ["**/*.{mjs,js,cjs}", "dev/**"], languageOptions: { globals: globals.node } },
  { files: ["src/apps/web/**", "src/e2e/**"], languageOptions: { globals: { ...globals.browser, ...globals.node } } },
);
