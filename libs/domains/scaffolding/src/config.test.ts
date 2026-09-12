/* eslint-disable */
import { expect, test } from "vitest";

import { resolveOptions, validateConfig, type CreatorOverrides } from "./config.js";

test("rejects conflicting preset and app selections at either level", () => {
  expect(() => validateConfig({ schemaVersion: 1, preset: "web", apps: ["cli"] })).toThrowError(
    expect.objectContaining({ code: "INVALID_CONFIG" }),
  );
  expect(() =>
    resolveOptions({ schemaVersion: 1 }, { preset: "web", apps: ["cli"] }, "product"),
  ).toThrowError(expect.objectContaining({ code: "INVALID_ARGUMENT" }));
});

test("an explicit apps selection replaces config-level preset selection", () => {
  const options = resolveOptions({ schemaVersion: 1, preset: "web" }, { apps: ["cli"] }, "product");

  expect(options.apps).toEqual(["cli"]);
  expect(options.components).toEqual(["base", "search-domain", "cli"]);
});

test("an explicit false rust override wins over a preset default", () => {
  const options = resolveOptions({ schemaVersion: 1 }, { preset: "full", rust: false }, "product");

  expect(options.apps).toEqual(["web", "cli", "mac"]);
  expect(options.rust).toBe(false);
  expect(options.components).not.toContain("rust");
});

test("disabled capabilities are rejected rather than entering a plan", () => {
  expect(() => validateConfig({ schemaVersion: 1, apps: ["nextjs"] })).toThrowError(
    expect.objectContaining({ code: "UNSUPPORTED_OPTION" }),
  );
  expect(() =>
    resolveOptions(
      { schemaVersion: 1 },
      { apps: ["react"] } as unknown as CreatorOverrides,
      "product",
    ),
  ).toThrowError(expect.objectContaining({ code: "UNSUPPORTED_OPTION" }));
});
