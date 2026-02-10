// FILE: C:\RiderNote\plugins\withProguardRelease.cjs
const { withAppBuildGradle } = require("@expo/config-plugins");

module.exports = function withProguardRelease(config) {
  return withAppBuildGradle(config, (config) => {
    let src = config.modResults.contents;

    const buildTypes = findNamedBlock(src, "buildTypes");
    if (!buildTypes) {
      config.modResults.contents = src;
      return config;
    }

    const release = findNamedBlock(src, "release", buildTypes.open + 1, buildTypes.close - 1);
    if (!release) {
      // buildTypes는 있는데 release 블록이 없으면, buildTypes 끝나기 직전에 추가
      const indent = guessIndent(src, buildTypes.start) + "    ";
      const innerIndent = indent + "    ";
      const newRelease =
        `\n${indent}release {\n` +
        `${innerIndent}minifyEnabled true\n` +
        `${innerIndent}shrinkResources true\n` +
        `${innerIndent}proguardFiles getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro"\n` +
        `${indent}}\n`;

      src = src.slice(0, buildTypes.close) + newRelease + src.slice(buildTypes.close);
      config.modResults.contents = src;
      return config;
    }

    // release 블록 내부만 안전하게 수정
    const releaseHeaderIndent = guessIndent(src, release.start);
    const lineIndent = releaseHeaderIndent + "    ";

    const bodyStart = release.open + 1;
    const bodyEnd = release.close;

    let body = src.slice(bodyStart, bodyEnd);

    body = ensureSingleLineDirective(body, "minifyEnabled", "true", lineIndent);
    body = ensureSingleLineDirective(body, "shrinkResources", "true", lineIndent);
    body = ensureProguardFiles(body, lineIndent);

    src = src.slice(0, bodyStart) + body + src.slice(bodyEnd);
    config.modResults.contents = src;
    return config;
  });
};

// ---------------------------
// Brace-matching block finder
// ---------------------------
function findNamedBlock(src, name, fromIndex = 0, toIndex = src.length) {
  const i = findIdentifier(src, name, fromIndex, toIndex);
  if (i < 0) return null;

  // name 다음의 { 찾기 (공백/주석 스킵)
  const open = findNextNonTriviaChar(src, i + name.length, toIndex);
  if (open < 0 || src[open] !== "{") return null;

  const close = findMatchingBrace(src, open, toIndex);
  if (close < 0) return null;

  return { start: i, open, close };
}

function findIdentifier(src, ident, fromIndex, toIndex) {
  let inS = false;
  let inD = false;
  let inLineC = false;
  let inBlockC = false;
  let esc = false;

  for (let i = fromIndex; i < toIndex; i++) {
    const ch = src[i];
    const nxt = i + 1 < toIndex ? src[i + 1] : "";

    if (inLineC) {
      if (ch === "\n") inLineC = false;
      continue;
    }
    if (inBlockC) {
      if (ch === "*" && nxt === "/") {
        inBlockC = false;
        i++;
      }
      continue;
    }

    if (!inS && !inD) {
      if (ch === "/" && nxt === "/") {
        inLineC = true;
        i++;
        continue;
      }
      if (ch === "/" && nxt === "*") {
        inBlockC = true;
        i++;
        continue;
      }
    }

    if (esc) {
      esc = false;
      continue;
    }
    if (ch === "\\") {
      if (inS || inD) esc = true;
      continue;
    }

    if (!inD && ch === "'") {
      inS = !inS;
      continue;
    }
    if (!inS && ch === '"') {
      inD = !inD;
      continue;
    }
    if (inS || inD) continue;

    if (ch !== ident[0]) continue;

    // 단어 경계 확인
    const before = i > 0 ? src[i - 1] : "";
    const after = i + ident.length < src.length ? src[i + ident.length] : "";

    if (isIdentChar(before)) continue;
    if (src.slice(i, i + ident.length) !== ident) continue;
    if (isIdentChar(after)) continue;

    return i;
  }
  return -1;
}

function findNextNonTriviaChar(src, fromIndex, toIndex) {
  let inLineC = false;
  let inBlockC = false;

  for (let i = fromIndex; i < toIndex; i++) {
    const ch = src[i];
    const nxt = i + 1 < toIndex ? src[i + 1] : "";

    if (inLineC) {
      if (ch === "\n") inLineC = false;
      continue;
    }
    if (inBlockC) {
      if (ch === "*" && nxt === "/") {
        inBlockC = false;
        i++;
      }
      continue;
    }

    if (ch === "/" && nxt === "/") {
      inLineC = true;
      i++;
      continue;
    }
    if (ch === "/" && nxt === "*") {
      inBlockC = true;
      i++;
      continue;
    }

    if (/\s/.test(ch)) continue;
    return i;
  }
  return -1;
}

function findMatchingBrace(src, openIndex, toIndex) {
  let depth = 0;
  let inS = false;
  let inD = false;
  let esc = false;
  let inLineC = false;
  let inBlockC = false;

  for (let i = openIndex; i < toIndex; i++) {
    const ch = src[i];
    const nxt = i + 1 < toIndex ? src[i + 1] : "";

    if (inLineC) {
      if (ch === "\n") inLineC = false;
      continue;
    }
    if (inBlockC) {
      if (ch === "*" && nxt === "/") {
        inBlockC = false;
        i++;
      }
      continue;
    }

    if (!inS && !inD) {
      if (ch === "/" && nxt === "/") {
        inLineC = true;
        i++;
        continue;
      }
      if (ch === "/" && nxt === "*") {
        inBlockC = true;
        i++;
        continue;
      }
    }

    if (esc) {
      esc = false;
      continue;
    }
    if (ch === "\\") {
      if (inS || inD) esc = true;
      continue;
    }

    if (!inD && ch === "'") {
      inS = !inS;
      continue;
    }
    if (!inS && ch === '"') {
      inD = !inD;
      continue;
    }
    if (inS || inD) continue;

    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function guessIndent(src, index) {
  const nl = src.lastIndexOf("\n", index);
  if (nl < 0) return "";
  const line = src.slice(nl + 1, index);
  const m = line.match(/^\s*/);
  return m ? m[0] : "";
}

function isIdentChar(ch) {
  return /[A-Za-z0-9_.$]/.test(ch || "");
}

// ---------------------------
// Release block editors
// ---------------------------
function ensureSingleLineDirective(body, key, value, indent) {
  const re = new RegExp(`(^|\\n)\\s*${escapeRe(key)}\\s+[^\\n]*`, "m");
  if (re.test(body)) {
    return body.replace(re, (m, g1) => `${g1}${indent}${key} ${value}`);
  }

  // 맨 앞(공백 제외) 근처에 넣기
  const insertAt = body.match(/^\s*\n/) ? 0 : 0;
  const prefix = body.slice(0, insertAt);
  const rest = body.slice(insertAt);
  return prefix + `\n${indent}${key} ${value}` + rest;
}

function ensureProguardFiles(body, indent) {
  const re = /(^|\n)\s*proguardFiles\s+[^\n]*/m;
  if (!re.test(body)) {
    return `\n${indent}proguardFiles getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro"` + body;
  }

  return body.replace(re, (m, g1) => {
    let line = m.slice(g1.length);

    // 기본 파일 optimize로 통일(있으면 교체)
    line = line.replace(/getDefaultProguardFile\(\s*["']proguard-android\.txt["']\s*\)/g, `getDefaultProguardFile("proguard-android-optimize.txt")`);
    line = line.replace(/getDefaultProguardFile\(\s*["']proguard-android-optimize\.txt["']\s*\)/g, `getDefaultProguardFile("proguard-android-optimize.txt")`);

    // proguard-rules.pro 보장
    if (!/proguard-rules\.pro/.test(line)) {
      line = line.trimEnd();
      line = line.endsWith(",") ? line + ` "proguard-rules.pro"` : line + `, "proguard-rules.pro"`;
    }

    return `${g1}${indent}${line.trim()}`;
  });
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
