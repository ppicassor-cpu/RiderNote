// FILE: C:\RiderNote\plugins\withEdgeToEdgeOff.js
const { withGradleProperties, createRunOncePlugin } = require("@expo/config-plugins");

function withEdgeToEdgeOff(config) {
  return withGradleProperties(config, config2 => {
    const props = config2.modResults;

    const upsert = (key, value) => {
      const idx = props.findIndex(p => p.type === "property" && p.key === key);
      if (idx >= 0) props[idx].value = value;
      else props.push({ type: "property", key, value });
    };

    upsert("edgeToEdgeEnabled", "false");
    upsert("expo.edgeToEdgeEnabled", "false");

    return config2;
  });
}

module.exports = createRunOncePlugin(withEdgeToEdgeOff, "with-edge-to-edge-off", "1.0.0");
