// @ts-check
import eslint from "@eslint/js";
import { globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default tseslint.config(
  globalIgnores(["dist"]),
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/explicit-member-accessibility": ["error"],
      "@typescript-eslint/explicit-function-return-type": ["error"],
    },
  },
);
