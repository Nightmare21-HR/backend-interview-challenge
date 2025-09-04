// eslint.config.js (CommonJS)
const eslintPluginTs = require("@typescript-eslint/eslint-plugin");
const parser = require("@typescript-eslint/parser");

module.exports = [
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser,
    },
    plugins: {
      "@typescript-eslint": eslintPluginTs,
    },
    rules: {
      "no-unused-vars": "warn",
      "semi": ["error", "always"],
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];
