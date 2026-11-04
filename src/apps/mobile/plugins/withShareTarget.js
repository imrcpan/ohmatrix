// Makes the app a target of the system's share sheet: what another app shares (a picture, some files, a text or a link) can be sent to OhMatrix.
// MainActivity gets the two intent filters (one item, several), for any type: `*/*` is how a filter takes text as well as files (see
// shareFilters.cjs). The module modules/ohmatrix-share receives what is shared. MainActivity is `singleTask`, so a share while the app is
// running comes to the one that is there.
const { withAndroidManifest } = require("@expo/config-plugins");
const { addShareFilters } = require("./shareFilters.cjs");

module.exports = (config) =>
  withAndroidManifest(config, (c) => {
    addShareFilters(c.modResults);
    return c;
  });
