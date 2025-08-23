import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
    eslint.configs.recommended,
    tseslint.configs.recommended,
    {
        files: ["**/*.ts"],
        languageOptions: {
            parser: tseslint.parser,
            parserOptions: { project: ["./apps/*/tsconfig.json", "./packages/*/tsconfig.json"] },
        },
        plugins: { "@typescript-eslint": tseslint.plugin },
        rules: {
            indent: ["error", 4],
            "linebreak-style": ["error", "unix"],
            quotes: ["error", "double"],
            semi: ["error", "always"],
            "@typescript-eslint/no-explicit-any": "off",
        },
    },
    eslintConfigPrettier
);
