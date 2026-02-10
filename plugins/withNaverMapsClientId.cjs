const { withAndroidManifest } = require("@expo/config-plugins");

module.exports = function withNaverMapsClientId(config) {
  return withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application?.[0];
    if (!app) return config;

    app["meta-data"] = app["meta-data"] || [];
    const metaData = app["meta-data"];

    const NAME = "com.naver.maps.map.CLIENT_ID";
    const VALUE = "1azmdmnk1m"; // ✅ 하드코딩(요청하신 값)

    // 기존 동일 key 제거 (중복 방지)
    for (let i = metaData.length - 1; i >= 0; i--) {
      if (metaData[i]?.$?.["android:name"] === NAME) metaData.splice(i, 1);
    }

    metaData.push({
      $: {
        "android:name": NAME,
        "android:value": VALUE,
      },
    });

    return config;
  });
};
