import { defineConfig } from "vitest/config";
import * as path from "path";

export default defineConfig({
    test: {
        include: ["unit/**/*.test.ts", "unit/**/*.spec.ts"],
        globals: true,
        environment: "node",
    },
    resolve: {
        alias: {
            "@jaculus/link": path.resolve(__dirname, "./packages/link/dist"),
        },
    },
});
