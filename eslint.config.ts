import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

const config: tseslint.ConfigArray = tseslint.config(
    eslint.configs.recommended,
    tseslint.configs.recommended,
    {
        ignores: [
            "**/dist/**",
            "**/node_modules/**",
            "**/src-appmeta/**",
            "**/*.d.ts",
            "**/coverage/**",
            "src/**",
        ],
    },
    {
        files: ["**/*.ts"],
        languageOptions: {
            parser: tseslint.parser,
            parserOptions: {
                project: ["./tsconfig.json", "./packages/*/tsconfig.json"],
            },
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
    {
        files: ["**/*.test.ts", "**/*.spec.ts"],
        rules: {
            "@typescript-eslint/no-unused-expressions": "off",
        },
    },
    eslintConfigPrettier
);

export default config;
