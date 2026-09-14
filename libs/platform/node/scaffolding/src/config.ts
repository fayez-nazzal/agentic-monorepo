/* eslint-disable */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { CreatorError, type CreatorConfig, validateConfig } from "@domains/scaffolding";

/** Read and strictly check a creator configuration file. */
export async function readConfig(filePath: string): Promise<CreatorConfig> {
  const absolutePath = resolve(process.cwd(), filePath);
  let source: string;
  try {
    source = await readFile(absolutePath, "utf8");
  } catch (cause) {
    throw new CreatorError("INVALID_CONFIG", `Unable to read configuration file ${absolutePath}`, {
      cause,
    });
  }

  let value: unknown;
  try {
    value = JSON.parse(source) as unknown;
  } catch (cause) {
    throw new CreatorError(
      "INVALID_CONFIG",
      `Configuration file ${absolutePath} is not valid JSON`,
      { cause },
    );
  }

  try {
    return validateConfig(value);
  } catch (cause) {
    if (cause instanceof CreatorError) {
      throw cause;
    }
    throw new CreatorError("INVALID_CONFIG", `Configuration file ${absolutePath} is invalid`, {
      cause,
    });
  }
}
