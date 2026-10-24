import { describe, expect, it } from "vitest";
import { withoutFilters } from "./logoXml.js";

describe("withoutFilters", () => {
  it("drops the filter attributes and keeps the shapes", () => {
    const xml = '<g filter="url(#drop)"><path d="M0 0" fill="#fff"/></g>';
    expect(withoutFilters(xml)).toBe('<g><path d="M0 0" fill="#fff"/></g>');
  });
});
