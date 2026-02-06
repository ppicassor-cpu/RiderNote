const { withAppBuildGradle, createRunOncePlugin } = require("@expo/config-plugins");

function ensureFinalNewline(s) {
  const out = String(s ?? "").replace(/\r\n/g, "\n");
  return out.endsWith("\n") ? out : out + "\n";
}

function findMatchingBraceGroovy(src, openIndex) {
  let depth = 0;

  let inLineC = false;
  let inBlockC = false;

  let inS = false;   
  let inD = false;   
  let inTS = false;  
  let inTD = false;  
  let esc = false;

  for (let i = openIndex; i < src.length; i++) {
    const ch = src[i];
    const nx = src[i + 1] ?? "";
    const nx2 = src[i + 2] ?? "";

    if (inLineC) {
      if (ch === "\n") inLineC = false;
      continue;
    }
    if (inBlockC) {
      if (ch === "*" && nx === "/") {
        inBlockC = false;
        i++;
      }
      continue;
    }

    if (inTS) {
      if (ch === "'" && nx === "'" && nx2 === "'") {
        inTS = false;
        i += 2;
      }
      continue;
    }
    if (inTD) {
      if (ch === '"' && nx === '"' && nx2 === '"') {
        inTD = false;
        i += 2;
      }
      continue;
    }

    if (inS) {
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === "'") inS = false;
      continue;
    }
    if (inD) {
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === '"') inD = false;
      continue;
    }

    if (ch === "/" && nx === "/") { inLineC = true; i++; continue; }
    if (ch === "/" && nx === "*") { inBlockC = true; i++; continue; }

    if (ch === "'" && nx === "'" && nx2 === "'") { inTS = true; i += 2; continue; }
    if (ch === '"' && nx === '"' && nx2 === '"') { inTD = true; i += 2; continue; }

    if (ch === "'") { inS = true; continue; }
    if (ch === '"') { inD = true; continue; }

    if (ch === "{") { depth++; continue; }
    if (ch === "}") {
      depth--;
      if (depth === 0) return i;
      continue;
    }
  }
  return -1;
}

function findNextKeywordBlock(src, keyword, fromIndex) {
  const re = new RegExp(`\\b${keyword}\\s*\\{`, "g");
  re.lastIndex = fromIndex || 0;

  const m = re.exec(src);
  if (!m) return null;

  const start = m.index;
  const open = src.indexOf("{", start);
  if (open < 0) return null;

  const end = findMatchingBraceGroovy(src, open);
  if (end < 0) return null;

  return { start, open, end };
}

function findKeywordBlockInRange(src, keyword, rangeStart, rangeEnd, fromRel = 0) {
  const sub = src.slice(rangeStart, rangeEnd + 1);
  const blk = findNextKeywordBlock(sub, keyword, fromRel);
  if (!blk) return null;
  return { start: rangeStart + blk.start, open: rangeStart + blk.open, end: rangeStart + blk.end };
}

function replaceRange(src, start, end, replacement) {
  return src.slice(0, start) + replacement + src.slice(end + 1);
}

function upsertBlockInsideAndroid(src, keyword, newBlock) {
  const androidBlk = findNextKeywordBlock(src, "android", 0);
  if (!androidBlk) return src;

  const innerStart = androidBlk.open + 1;
  const innerEnd = androidBlk.end - 1;

  const blk = findKeywordBlockInRange(src, keyword, innerStart, innerEnd, 0);
  if (blk) {
    return replaceRange(src, blk.start, blk.end, newBlock);
  }

  const insertPos = innerStart;
  return src.slice(0, insertPos) + "\n" + newBlock + src.slice(insertPos);
}

function patchBuildTypesReleaseSigning(src) {
  const androidBlk = findNextKeywordBlock(src, "android", 0);
  if (!androidBlk) return src;

  const innerStart = androidBlk.open + 1;
  const innerEnd = androidBlk.end - 1;

  const bt = findKeywordBlockInRange(src, "buildTypes", innerStart, innerEnd, 0);
  if (!bt) return src;

  const rel = findKeywordBlockInRange(src, "release", bt.open + 1, bt.end - 1, 0);
  if (!rel) return src;

  const blockText = src.slice(rel.start, rel.end + 1);

  if (blockText.includes("RN_USE_RELEASE_SIGNING") && blockText.includes("_useRel ? signingConfigs.release")) {
    return src;
  }

  let fixed = blockText.replace(/^\s*signingConfig\s+signingConfigs\.[A-Za-z0-9_]+\s*$/gm, "");

  const inject =
`            def _useRel = (findProperty('RN_USE_RELEASE_SIGNING') ?: 'true').toBoolean()
            signingConfig _useRel ? signingConfigs.release : signingConfigs.debug
`;
  fixed = fixed.replace(/release\s*\{\s*\n/, (m) => `${m}${inject}`);

  return replaceRange(src, rel.start, rel.end, fixed);
}

function setSigningConfigSafe(buildGradle) {
  let src = String(buildGradle ?? "");

  const signingConfigsBlock =
`    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }

        release {
            def storeFilePath = (findProperty('RN_STORE_FILE') ?: '../../release.keystore')
            storeFile file(storeFilePath)
            storePassword (findProperty('RN_STORE_PASSWORD') ?: '123456')
            keyAlias (findProperty('RN_KEY_ALIAS') ?: 'my-key-alias')
            keyPassword (findProperty('RN_KEY_PASSWORD') ?: '123456')
        }
    }
`;

  src = upsertBlockInsideAndroid(src, "signingConfigs", signingConfigsBlock);

  src = patchBuildTypesReleaseSigning(src);

  return ensureFinalNewline(src);
}

function withAndroidSigning(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language === "groovy") {
      config.modResults.contents = setSigningConfigSafe(config.modResults.contents);
    }
    return config;
  });
}

module.exports = createRunOncePlugin(withAndroidSigning, "withAndroidSigning", "2.0.0");