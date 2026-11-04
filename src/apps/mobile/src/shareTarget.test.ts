import { expect, test } from "vitest";
import { addShareFilters } from "../plugins/shareFilters.cjs";

type Filter = { action?: { $: Record<string, string> }[]; category?: { $: Record<string, string> }[]; data?: { $: Record<string, string> }[] };
const manifest = () => ({
  manifest: {
    application: [
      {
        activity: [
          { $: { "android:name": ".MainActivity" }, "intent-filter": [{ action: [{ $: { "android:name": "android.intent.action.VIEW" } }] }] },
          { $: { "android:name": ".Other" } },
        ],
      },
    ],
  },
});
const filtersOf = (m: ReturnType<typeof manifest>) => (m.manifest.application[0]!.activity[0] as { "intent-filter": Filter[] })["intent-filter"];

test("MainActivity takes what is shared to the app: one item and several, of any type", () => {
  const m = manifest();
  addShareFilters(m);
  const filters = filtersOf(m);
  const send = filters.find((f) => f.action?.[0]?.$["android:name"] === "android.intent.action.SEND");
  const many = filters.find((f) => f.action?.[0]?.$["android:name"] === "android.intent.action.SEND_MULTIPLE");
  for (const f of [send, many]) {
    expect(f?.category?.[0]?.$["android:name"]).toBe("android.intent.category.DEFAULT"); // without it the share sheet does not list the app
    expect(f?.data?.[0]?.$["android:mimeType"]).toBe("*/*"); // files and text
  }
  // What was there stays, and no other activity is touched.
  expect(filters.some((f) => f.action?.[0]?.$["android:name"] === "android.intent.action.VIEW")).toBe(true);
  expect((m.manifest.application[0]!.activity[1] as { "intent-filter"?: unknown })["intent-filter"]).toBeUndefined();
});

test("running it again adds nothing", () => {
  const m = manifest();
  addShareFilters(m);
  const once = filtersOf(m).length;
  addShareFilters(m);
  expect(filtersOf(m)).toHaveLength(once);
});

test("a manifest with no MainActivity is an error, not a silent no-op", () => {
  expect(() => addShareFilters({ manifest: { application: [{ activity: [] }] } })).toThrow(/MainActivity/);
});
