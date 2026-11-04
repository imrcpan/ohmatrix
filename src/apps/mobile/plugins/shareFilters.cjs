// The intent filters that make MainActivity a target of the system's share sheet (the plugin withShareTarget.js puts them in; kept apart so that
// it can be tested: a plugin is a file that only the build loads).
const ACTIONS = ["android.intent.action.SEND", "android.intent.action.SEND_MULTIPLE"];

/** Adds the filters to MainActivity of a parsed manifest (once: running it again changes nothing). */
function addShareFilters(manifest) {
  const activity = manifest.manifest.application?.[0]?.activity?.find((a) => a.$["android:name"] === ".MainActivity");
  if (!activity) throw new Error("withShareTarget: no MainActivity in the manifest");
  const filters = (activity["intent-filter"] ??= []);
  for (const action of ACTIONS) {
    if (filters.some((f) => f.action?.some((a) => a.$["android:name"] === action))) continue;
    filters.push({
      action: [{ $: { "android:name": action } }],
      category: [{ $: { "android:name": "android.intent.category.DEFAULT" } }],
      data: [{ $: { "android:mimeType": "*/*" } }],
    });
  }
  return manifest;
}

module.exports = { addShareFilters };
