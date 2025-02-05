import { expect, test, describe, it } from "vitest";

// @FIXME: How to test cli commands in nodejs?
// import * as index from "../index.js";

describe("workspace", () => {
  it("current", async () => {
    expect("default").toBe("default");
  });
});
