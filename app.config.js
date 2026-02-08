const appJson = require("./app.json");

module.exports = ({ config }) => {
  const expo = appJson.expo || config;

  const pkg = (expo.android && expo.android.package) ? expo.android.package : "com.ridermemotracker";

  const plugins = Array.isArray(expo.plugins) ? expo.plugins.slice() : [];
  const p = "./plugins/withRiderTracker";
  if (!plugins.includes(p)) plugins.push(p);

  return {
    expo: {
      ...expo,
      android: {
        ...(expo.android || {}),
        package: pkg,
      },
      plugins,
    },
  };
};

