// FILE: C:\RiderNote\plugins\withRiderTracker.js
const fs = require("fs");
const path = require("path");

const {
  AndroidConfig,
  withAndroidManifest,
  withAppBuildGradle,
  withMainApplication,
  withDangerousMod,
  createRunOncePlugin
} = require("@expo/config-plugins");

// ------------------------------------------------------------------
// 1. Constants & Configuration
// ------------------------------------------------------------------
const PLAY_SERVICES_LOCATION = "com.google.android.gms:play-services-location:21.3.0";
const PLAY_APP_UPDATE = "com.google.android.play:app-update:2.1.0";
const PLAY_APP_UPDATE_KTX = "com.google.android.play:app-update-ktx:2.1.0";
const IGNORE_ASSETS_PATTERN = "!.svn:!.git:!.ds_store:!*.scc:!CVS:!thumbs.db:!picasa.ini:!*~";

const PERMS = [
  "android.permission.INTERNET",
  "android.permission.ACCESS_FINE_LOCATION",
  "android.permission.ACCESS_COARSE_LOCATION",
  "android.permission.ACCESS_BACKGROUND_LOCATION",
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_LOCATION",
  "android.permission.SYSTEM_ALERT_WINDOW",
  "com.android.vending.BILLING",
  "android.permission.POST_NOTIFICATIONS"
];

// ------------------------------------------------------------------
// 2. Main Plugin Entry
// ------------------------------------------------------------------
function withRiderTracker(config) {
  config = withDangerousMod(config, ["android", generateJavaFilesMod]);
  config = withAndroidManifest(config, updateManifestMod);
  config = withAppBuildGradle(config, updateBuildGradleMod);
  config = withMainApplication(config, updateMainApplicationMod);
  return config;
}

// ------------------------------------------------------------------
// 3. Mod Implementations
// ------------------------------------------------------------------

/** 1) Android 소스 파일 생성 */
async function generateJavaFilesMod(config) {
  const pkg = safeGetPackage(config);
  const androidRoot = config.modRequest.platformProjectRoot;

  const javaDir = path.join(androidRoot, "app", "src", "main", "java", ...pkg.split("."), "tracker");
  ensureDir(javaDir);
  const files = getJavaTemplates(pkg);

  // ✅ 중복 클래스 방지: 기존 .java 삭제 후 .kt 생성
  deleteIfExists(path.join(javaDir, "TrackerPrefs.java"));
  deleteIfExists(path.join(javaDir, "MemoStore.java"));
  deleteIfExists(path.join(javaDir, "TrackingService.java"));
  deleteIfExists(path.join(javaDir, "TrackerModule.java"));
  deleteIfExists(path.join(javaDir, "TrackerPackage.java"));

  // ✅ 앱 전환 완전 금지: ClipboardCaptureActivity 소스/클래스 제거
  deleteIfExists(path.join(javaDir, "ClipboardCaptureActivity.java"));
  deleteIfExists(path.join(javaDir, "ClipboardCaptureActivity.kt"));

  writeFileIfChanged(path.join(javaDir, "TrackerPrefs.kt"), files.TrackerPrefs);
  writeFileIfChanged(path.join(javaDir, "MemoStore.kt"), files.MemoStore);
  writeFileIfChanged(path.join(javaDir, "TrackingService.kt"), files.TrackingService);
  writeFileIfChanged(path.join(javaDir, "TrackerModule.kt"), files.TrackerModule);
  writeFileIfChanged(path.join(javaDir, "TrackerPackage.kt"), files.TrackerPackage);

  // ✅ RiderInAppUpdate 네이티브 모듈 생성
  const updateDir = path.join(androidRoot, "app", "src", "main", "java", ...pkg.split("."), "update");
  ensureDir(updateDir);
  const up = getInAppUpdateTemplates(pkg);

  deleteIfExists(path.join(updateDir, "RiderInAppUpdateModule.java"));
  deleteIfExists(path.join(updateDir, "RiderInAppUpdatePackage.java"));

  writeFileIfChanged(path.join(updateDir, "RiderInAppUpdateModule.kt"), up.RiderInAppUpdateModule);
  writeFileIfChanged(path.join(updateDir, "RiderInAppUpdatePackage.kt"), up.RiderInAppUpdatePackage);

  return config;
}

/** 2) Manifest 권한 등록 */
function updateManifestMod(config) {
  const pkg = safeGetPackage(config);
  const manifest = config.modResults;

  manifest.manifest["uses-permission"] = manifest.manifest["uses-permission"] || [];
  for (const p of PERMS) {
    const exists = manifest.manifest["uses-permission"].some((x) => x && x.$ && x.$["android:name"] === p);
    if (!exists) manifest.manifest["uses-permission"].push({ $: { "android:name": p } });
  }

  const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  const trackingName = `${pkg}.tracker.TrackingService`;

  app.service = app.service || [];
  if (!app.service.some((s) => s && s.$ && s.$["android:name"] === trackingName)) {
    app.service.push({
      $: { "android:name": trackingName, "android:exported": "false", "android:foregroundServiceType": "location" }
    });
  }

  // ✅ 앱 전환 완전 금지: ClipboardCaptureActivity 미등록
  return config;
}

/** 3) Build Gradle 수정 */
function updateBuildGradleMod(config) {
  let src = config.modResults.contents;

  // 1. 의존성 추가
  src = addDependencyIfMissing(src);
  src = addInAppUpdateDependenciesIfMissing(src);

  // 2. ignoreAssetsPattern 처리
  src = ensureIgnoreAssetsPattern(src);

  // 3. signingConfigs 처리 로직 제거 (withAndroidSigning.js가 전담)

  // 4. 깨진 중괄호 블록 정리
  src = removeDanglingBraces(src);

  config.modResults.contents = src;
  return config;
}

/** 4) MainApplication 패키지 등록 */
function updateMainApplicationMod(config) {
  const pkg = safeGetPackage(config);

  let src = config.modResults.contents;
  src = ensureImportAndRegisterInMainApplication(src, pkg);
  src = ensureImportAndRegisterInMainApplication_InAppUpdate(src, pkg);

  config.modResults.contents = src;
  return config;
}
function ensureImportAndRegisterInMainApplication_InAppUpdate(src, pkg) {
  const importKt = `import ${pkg}.update.RiderInAppUpdatePackage`;
  const importJava = `import ${pkg}.update.RiderInAppUpdatePackage;`;
  const isJava = /(^\s*package\s+[a-zA-Z0-9_.]+\s*;\s*$)/m.test(src);

  // 1) import 추가
  if (src.includes("class MainApplication") || src.includes("MainApplication")) {
    if (isJava) {
      if (!src.includes(importJava)) {
        src = src.replace(/(^\s*package\s+[a-zA-Z0-9_.]+\s*;\s*$)/m, `$1\n${importJava}`);
      }
    } else {
      if (!src.includes(importKt)) {
        src = src.replace(/(^\s*package\s+[a-zA-Z0-9_.]+\s*$)/m, `$1\n${importKt}`);
      }
    }
  }

  // 이미 등록돼 있으면 종료
  if (src.includes("RiderInAppUpdatePackage()") || src.includes("new RiderInAppUpdatePackage()")) return src;

  // 2) Kotlin(MainApplication.kt) 패턴들 처리
  if (!isJava) {
    // (a) 이미 Tracker가 return을 toMutableList().apply { ... } 형태로 바꿔둔 케이스 포함
    if (/PackageList\(this\)\.packages\.toMutableList\(\)\.apply\s*\{\s*/m.test(src)) {
      src = src.replace(
        /PackageList\(this\)\.packages\.toMutableList\(\)\.apply\s*\{\s*/m,
        (m) => `${m}\n      add(RiderInAppUpdatePackage())\n      `
      );
      return src;
    }

    // (b) packages.apply { ... } 케이스
    if (src.includes("PackageList(this).packages.apply")) {
      src = src.replace(
        /PackageList\(this\)\.packages\.apply\s*\{/m,
        "PackageList(this).packages.apply {\n      add(RiderInAppUpdatePackage())"
      );
      return src;
    }

    // (c) return PackageList(this).packages 케이스
    if (/return\s+PackageList\(this\)\.packages\b/m.test(src)) {
      src = src.replace(
        /return\s+PackageList\(this\)\.packages\b/m,
        "return PackageList(this).packages.toMutableList().apply { add(RiderInAppUpdatePackage()) }"
      );
      return src;
    }

    // (d) val packages = PackageList(this).packages 케이스
    if (/val\s+packages\s*=\s*PackageList\(this\)\.packages\b/m.test(src)) {
      src = src.replace(
        /val\s+packages\s*=\s*PackageList\(this\)\.packages\b/m,
        "val packages = PackageList(this).packages.toMutableList()"
      );

      if (!src.includes("packages.add(RiderInAppUpdatePackage())")) {
        src = src.replace(
          /(val packages = PackageList\(this\)\.packages\.toMutableList\(\)\s*\n)/,
          `$1    packages.add(RiderInAppUpdatePackage())\n`
        );
      }
      return src;
    }

    // (e) 마지막 fallback: PackageList(this).packages 단독 사용 케이스
    if (src.includes("PackageList(this).packages") && !src.includes(".toMutableList()")) {
      src = src.replace(
        "PackageList(this).packages",
        "PackageList(this).packages.toMutableList().apply { add(RiderInAppUpdatePackage()) }"
      );
      return src;
    }

    return src;
  }

  // 3) Java(MainApplication.java) 패턴 처리
  if (src.includes("new PackageList(this).getPackages()") && !src.includes("new RiderInAppUpdatePackage()")) {
    src = src.replace(
      /List<ReactPackage>\s+packages\s*=\s*new\s+PackageList\(this\)\.getPackages\(\)\s*;/m,
      (m) => `${m}\n    packages.add(new RiderInAppUpdatePackage());`
    );
    return src;
  }

  return src;
}
// ------------------------------------------------------------------
// 4. Utilities
// ------------------------------------------------------------------

function addInAppUpdateDependenciesIfMissing(src) {
  if (src.includes("com.google.android.play:app-update")) return src;

  const depLines = [
    `    implementation "${PLAY_APP_UPDATE}"`,
    `    implementation "${PLAY_APP_UPDATE_KTX}"`
  ].join("\n");

  return src.replace(/dependencies\s*\{\s*/m, (m) => `${m}\n${depLines}\n`);
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function deleteIfExists(p) {
  try {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {}
}

function writeFileIfChanged(p, content) {
  ensureDir(path.dirname(p));
  if (fs.existsSync(p)) {
    const prev = fs.readFileSync(p, "utf8");
    if (prev === content) return;
  }
  fs.writeFileSync(p, content, "utf8");
}

function safeGetPackage(config) {
  const pkg = AndroidConfig.Package.getPackage(config);
  if (!pkg) throw new Error("android.package 가 설정되어야 합니다 (app.json / app.config.*).");
  return pkg;
}

function addDependencyIfMissing(src) {
  if (src.includes("play-services-location")) return src;
  const depLine = `    implementation "${PLAY_SERVICES_LOCATION}"`;
  return src.replace(/dependencies\s*\{\s*/m, (m) => `${m}\n${depLine}\n`);
}

function ensureImportAndRegisterInMainApplication(src, pkg) {
  const importKt = `import ${pkg}.tracker.TrackerPackage`;
  const importJava = `import ${pkg}.tracker.TrackerPackage;`;
  const isJava = /(^\s*package\s+[a-zA-Z0-9_.]+\s*;\s*$)/m.test(src);

  if (src.includes("class MainApplication") || src.includes("MainApplication")) {
    if (isJava) {
      if (!src.includes(importJava)) src = src.replace(/(^\s*package\s+[a-zA-Z0-9_.]+\s*;\s*$)/m, `$1\n${importJava}`);
    } else {
      if (!src.includes(importKt)) src = src.replace(/(^\s*package\s+[a-zA-Z0-9_.]+\s*$)/m, `$1\n${importKt}`);
    }
  }

  if (!src.includes("TrackerPackage()")) {
    if (src.includes("PackageList(this).packages.apply")) {
      if (!src.includes("add(TrackerPackage())")) {
        src = src.replace(/PackageList\(this\)\.packages\.apply\s*\{/m, "PackageList(this).packages.apply {\n      add(TrackerPackage())");
      }
      return src;
    }
    if (src.match(/return\s+PackageList\(this\)\.packages\b/)) {
      src = src.replace(/return\s+PackageList\(this\)\.packages\b/m, "return PackageList(this).packages.toMutableList().apply { add(TrackerPackage()) }");
      return src;
    }
    if (src.match(/val\s+packages\s*=\s*PackageList\(this\)\.packages\b/)) {
      src = src.replace(/val\s+packages\s*=\s*PackageList\(this\)\.packages\b/m, "val packages = PackageList(this).packages.toMutableList()");
      if (!src.includes("packages.add(TrackerPackage())")) {
        src = src.replace(/(val packages = PackageList\(this\)\.packages\.toMutableList\(\)\s*\n)/, `$1    packages.add(TrackerPackage())\n`);
      }
      return src;
    }
    if (src.includes("PackageList(this).packages") && !src.includes(".toMutableList()")) {
      src = src.replace("PackageList(this).packages", "PackageList(this).packages.toMutableList().apply { add(TrackerPackage()) }");
      return src;
    }
  }

  if (src.includes("new PackageList(this).getPackages()") && !src.includes("new TrackerPackage()")) {
    src = src.replace(/List<ReactPackage>\s+packages\s*=\s*new\s+PackageList\(this\)\.getPackages\(\)\s*;/m, (m) => `${m}\n    packages.add(new TrackerPackage());`);
    return src;
  }
  return src;
}

// --- Gradle Processing Logic ---

function ensureIgnoreAssetsPattern(src) {
  src = src.replace(/androidResources\s*\{\s*[^}]*\s*\}/gm, "");
  src = src.replace(/^\s*ignoreAssetsPattern\s+['"][^'"]+['"]\s*$/gm, "");
  src = src.replace(/^\s*ignoreAssetsPattern\s*=\s*['"][^'"]+['"]\s*$/gm, "");

  const androidMatch = /\bandroid\s*\{/.exec(src);
  if (!androidMatch) return src;
  const androidStart = androidMatch.index;
  const androidOpen = src.indexOf("{", androidStart);
  if (androidOpen < 0) return src;
  const androidClose = findMatchingBrace(src, androidOpen);
  if (androidClose < 0) return src;

  let androidBlock = src.slice(androidStart, androidClose + 1);
  let aapt = findBlockByKeyword(androidBlock, "aaptOptions", 0);

  if (!aapt) {
    const aaptBlock = reindentBlock(
      `aaptOptions {
      ignoreAssetsPattern '${IGNORE_ASSETS_PATTERN}'
    }`,
      "    "
    );
    androidBlock = androidBlock.replace(/\}\s*$/, (m) => `\n\n${aaptBlock}\n${m}`);
  } else {
    let aaptBlock = androidBlock.slice(aapt.start, aapt.end + 1);
    aaptBlock = aaptBlock.replace(/^\s*ignoreAssetsPattern\s+['"][^'"]+['"]\s*$/gm, "");
    aaptBlock = aaptBlock.replace(/^\s*ignoreAssetsPattern\s*=\s*['"][^'"]+['"]\s*$/gm, "");
    aaptBlock = aaptBlock.replace(/\}\s*$/, (m) => `\n      ignoreAssetsPattern '${IGNORE_ASSETS_PATTERN}'\n${m}`);
    androidBlock = androidBlock.slice(0, aapt.start) + aaptBlock + androidBlock.slice(aapt.end + 1);
  }

  src = src.slice(0, androidStart) + androidBlock + src.slice(androidClose + 1);
  return src;
}

function removeDanglingBraces(src) {
  let prev;
  do {
    prev = src;
    src = src.replace(/^\s*\{\s*\}\s*$/gm, "");
    src = src.replace(/\n\s*\{\s*\n\s*\}\s*\n/g, "\n");
  } while (src !== prev);

  src = src.trim();
  while (true) {
    const original = src;
    src = src.replace(/\s*\{\s*\n*\s*\}\s*\}\s*$/, "");
    src = src.replace(/\s*\{\s*\n*\s*\}\s*$/, "");
    if (src === original) break;
  }

  src = src.replace(/\s*{\s*}\s*/g, "");
  src = src.replace(/\n{2,}/g, "\n");
  return src + "\n";
}

function findMatchingBrace(src, openIndex) {
  let depth = 0;
  let inS = false;
  let inD = false;
  let esc = false;
  let inC = false;

  for (let i = openIndex; i < src.length; i++) {
    const ch = src[i];
    if (inC) {
      if (ch === "\n") inC = false;
      continue;
    }
    if (!inS && !inD && ch === "/" && src[i + 1] === "/") {
      inC = true;
      i++;
      continue;
    }
    if (esc) {
      esc = false;
      continue;
    }
    if (ch === "\\") {
      esc = true;
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

function findBlockByKeyword(src, keyword, fromIndex = 0) {
  const re = new RegExp(`\\b${keyword}\\s*\\{`, "m");
  const m = re.exec(src.slice(fromIndex));
  if (!m) return null;
  const start = fromIndex + m.index;
  const open = src.indexOf("{", start);
  if (open < 0) return null;
  const end = findMatchingBrace(src, open);
  if (end < 0) return null;
  return { start, open, end };
}

function reindentBlock(block, indent) {
  const s = String(block || "").replace(/\r\n/g, "\n");
  const lines = s.split("\n");
  let min = Infinity;
  for (const line of lines) {
    if (!line.trim()) continue;
    const m = line.match(/^\s*/);
    const n = m ? m[0].length : 0;
    if (n < min) min = n;
  }
  if (!Number.isFinite(min)) min = 0;
  return lines.map((line) => indent + line.slice(min)).join("\n");
}

// ------------------------------------------------------------------
// 5. Kotlin Templates (Native 저장: 앱 전환 없음)
// ------------------------------------------------------------------
function getInAppUpdateTemplates(pkg) {
  const P = pkg;

const RiderInAppUpdateModule = `package ${P}.update

import android.app.Activity
import android.content.Intent
import android.net.Uri
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.android.play.core.appupdate.AppUpdateManager
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.UpdateAvailability

class RiderInAppUpdateModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

  companion object {
    private const val REQ_CODE = 9237
  }

  private val appUpdateManager: AppUpdateManager = AppUpdateManagerFactory.create(reactContext)
  private var pendingPromise: Promise? = null

  private val listener = object : BaseActivityEventListener() {
    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
      if (requestCode != REQ_CODE) return
      val p = pendingPromise ?: return
      pendingPromise = null
      // Activity.RESULT_OK / Activity.RESULT_CANCELED 등
      p.resolve(resultCode)
    }
  }

  init {
    reactContext.addActivityEventListener(listener)
  }

  override fun getName(): String = "RiderInAppUpdate"

  @ReactMethod
  fun check(promise: Promise) {
    try {
      val task = appUpdateManager.appUpdateInfo
      task.addOnSuccessListener { info ->
        val out = Arguments.createMap()
        out.putInt("availability", info.updateAvailability())
        out.putBoolean("immediateAllowed", info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE))
        out.putBoolean("flexibleAllowed", info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE))
        out.putInt("availableVersionCode", info.availableVersionCode())
        val staleness = info.clientVersionStalenessDays()
        if (staleness != null) out.putInt("stalenessDays", staleness) else out.putNull("stalenessDays")
        out.putInt("updatePriority", info.updatePriority())
        promise.resolve(out)
      }.addOnFailureListener { e ->
        promise.reject("ERR_CHECK", e)
      }
    } catch (e: Exception) {
      promise.reject("ERR_CHECK", e)
    }
  }

  @ReactMethod
  fun startImmediate(promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "No currentActivity")
      return
    }
    if (pendingPromise != null) {
      promise.reject("BUSY", "Update flow already running")
      return
    }

    try {
      appUpdateManager.appUpdateInfo
        .addOnSuccessListener { info ->
          val availability = info.updateAvailability()
          val canImmediate = info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE)

          val okToStart =
            (availability == UpdateAvailability.UPDATE_AVAILABLE || availability == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS) &&
              canImmediate

          if (!okToStart) {
            // 시작할 업데이트 없음
            promise.resolve(-1)
            return@addOnSuccessListener
          }

          pendingPromise = promise
          try {
            val opts = AppUpdateOptions.newBuilder(AppUpdateType.IMMEDIATE).build()
            appUpdateManager.startUpdateFlowForResult(info, activity, opts, REQ_CODE)
          } catch (e: Exception) {
            pendingPromise = null
            promise.reject("ERR_START", e)
          }
        }
        .addOnFailureListener { e ->
          promise.reject("ERR_START", e)
        }
    } catch (e: Exception) {
      promise.reject("ERR_START", e)
    }
  }

  @ReactMethod
  fun openStore(promise: Promise) {
    val c = reactContext
    val id = c.packageName

    try {
      val i = Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$id"))
      i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      c.startActivity(i)
      promise.resolve(true)
    } catch (_: Exception) {
      try {
        val i2 = Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$id"))
        i2.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        c.startActivity(i2)
        promise.resolve(true)
      } catch (e2: Exception) {
        promise.reject("ERR_STORE", e2)
      }
    }
  }
}
`;

  const RiderInAppUpdatePackage = `package ${P}.update

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import java.util.Collections

class RiderInAppUpdatePackage : ReactPackage {
  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    return Collections.emptyList()
  }

  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(RiderInAppUpdateModule(reactContext))
  }
}
`;

  return { RiderInAppUpdateModule, RiderInAppUpdatePackage };
}

function getJavaTemplates(pkg) {
  const P = pkg;
  const TRACKING_ACTION_START = `${P}.ACTION_TRACKING_START`;
  const TRACKING_ACTION_STOP = `${P}.ACTION_TRACKING_STOP`;
  const OVERLAY_ACTION_SHOW = `${P}.ACTION_OVERLAY_SHOW`;
  const OVERLAY_ACTION_HIDE = `${P}.ACTION_OVERLAY_HIDE`;

  const TrackerPrefs = `package ${P}.tracker

import android.content.Context
import android.content.SharedPreferences

object TrackerPrefs {
  private const val PREF = "RiderNotePrefs"

  const val KEY_ACTIVE_SESSION = "activeSessionId"
  const val KEY_START_TIME = "startTime"

  const val KEY_LAST_LAT = "lastLat"
  const val KEY_LAST_LNG = "lastLng"
  const val KEY_LAST_ACC = "lastAcc"
  const val KEY_LAST_T = "lastT"

  const val KEY_MEMOS_JSON = "memosJson"
  const val KEY_ROUTE_JSON = "routeJson"

  // ✅ 버블 위치 저장/복원
  const val KEY_BUBBLE_X = "bubbleX"
  const val KEY_BUBBLE_Y = "bubbleY"

  fun sp(c: Context): SharedPreferences {
    return c.getSharedPreferences(PREF, Context.MODE_PRIVATE)
  }
}
`;

  const MemoStore = `package ${P}.tracker

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

object MemoStore {

  fun getMemos(c: Context): JSONArray {
    return try {
      val sp: SharedPreferences = TrackerPrefs.sp(c)
      val raw = sp.getString(TrackerPrefs.KEY_MEMOS_JSON, "[]") ?: "[]"
      JSONArray(raw)
    } catch (e: Exception) {
      JSONArray()
    }
  }

  fun clear(c: Context) {
    TrackerPrefs.sp(c).edit().putString(TrackerPrefs.KEY_MEMOS_JSON, "[]").apply()
  }

  fun append(c: Context, memo: JSONObject) {
    try {
      val arr = getMemos(c)
      arr.put(memo)
      TrackerPrefs.sp(c).edit().putString(TrackerPrefs.KEY_MEMOS_JSON, arr.toString()).apply()
    } catch (_: Exception) {}
  }
}
`;

  const TrackingService = `package ${P}.tracker

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.text.InputType
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.annotation.Nullable
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.abs

class TrackingService : Service() {

  companion object {
    const val ACTION_START = "${TRACKING_ACTION_START}"
    const val ACTION_STOP = "${TRACKING_ACTION_STOP}"

    const val ACTION_OVERLAY_SHOW = "${OVERLAY_ACTION_SHOW}"
    const val ACTION_OVERLAY_HIDE = "${OVERLAY_ACTION_HIDE}"

    const val NOTI_CH_ID = "ridernote_tracking_channel"
    const val NOTI_ID = 11021

    private const val ROUTE_MAX_POINTS = 5000
  }

  private lateinit var fused: FusedLocationProviderClient
  private lateinit var callback: LocationCallback

  private var wm: WindowManager? = null

  private var bubble: View? = null
  private var bubbleLp: WindowManager.LayoutParams? = null
  private var bubbleBg: GradientDrawable? = null

  private var memoPanel: View? = null
  private var memoPanelLp: WindowManager.LayoutParams? = null
  private var memoInput: EditText? = null

  override fun onCreate() {
    super.onCreate()
    fused = LocationServices.getFusedLocationProviderClient(this)
    wm = getSystemService(WINDOW_SERVICE) as WindowManager

    callback = object : LocationCallback() {
      override fun onLocationResult(locationResult: LocationResult) {
        val loc = locationResult.lastLocation ?: return

        val sp = TrackerPrefs.sp(this@TrackingService)
        val sessionId = sp.getString(TrackerPrefs.KEY_ACTIVE_SESSION, null)
        if (sessionId == null || sessionId.trim().isEmpty()) {
          hideBubble()
          stopUpdates()
          try { stopForeground(true) } catch (_: Exception) {}
          stopSelf()
          return
        }

        val now = System.currentTimeMillis()

        sp.edit()
          .putFloat(TrackerPrefs.KEY_LAST_LAT, loc.latitude.toFloat())
          .putFloat(TrackerPrefs.KEY_LAST_LNG, loc.longitude.toFloat())
          .putFloat(TrackerPrefs.KEY_LAST_ACC, loc.accuracy)
          .putLong(TrackerPrefs.KEY_LAST_T, now)
          .apply()

        try {
          val raw = sp.getString(TrackerPrefs.KEY_ROUTE_JSON, "[]") ?: "[]"
          var arr = JSONArray(raw)

          val pt = JSONObject()
          pt.put("lat", loc.latitude)
          pt.put("lng", loc.longitude)
          pt.put("t", now)
          pt.put("acc", loc.accuracy)
          arr.put(pt)

          if (arr.length() > ROUTE_MAX_POINTS) {
            val trimmed = JSONArray()
            val start = arr.length() - ROUTE_MAX_POINTS
            var i = start
            while (i < arr.length()) {
              trimmed.put(arr.get(i))
              i++
            }
            arr = trimmed
          }

          sp.edit().putString(TrackerPrefs.KEY_ROUTE_JSON, arr.toString()).apply()
        } catch (_: Exception) {}

        updateNotification("기록 중")
      }
    }
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
      val ch = NotificationChannel(NOTI_CH_ID, "RiderNote Tracking", NotificationManager.IMPORTANCE_LOW)
      nm.createNotificationChannel(ch)
    }
  }

  private fun buildNotification(text: String): Notification {
    val b = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, NOTI_CH_ID)
    } else {
      Notification.Builder(this)
    }

    b.setContentTitle("RiderNote")
      .setContentText(text)
      .setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setOngoing(true)

    return b.build()
  }

  private fun startForegroundSafe(text: String) {
    ensureChannel()
    val n = buildNotification(text)
    if (Build.VERSION.SDK_INT >= 29) {
      startForeground(NOTI_ID, n, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
    } else {
      startForeground(NOTI_ID, n)
    }
  }

  private fun updateNotification(text: String) {
    ensureChannel()
    val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
    nm.notify(NOTI_ID, buildNotification(text))
  }

  private fun startUpdates() {
    try {
      val req = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 5000L)
        .setMinUpdateIntervalMillis(2000L)
        .setMinUpdateDistanceMeters(5f)
        .build()
      fused.requestLocationUpdates(req, callback, mainLooper)
    } catch (_: SecurityException) {}
  }

  private fun stopUpdates() {
    try { fused.removeLocationUpdates(callback) } catch (_: Exception) {}
  }

  private fun overlayType(): Int {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    else WindowManager.LayoutParams.TYPE_PHONE
  }

  private fun dp(v: Int): Int {
    val d = resources.displayMetrics.density
    return (v * d).toInt()
  }

  private fun canDrawOverlay(): Boolean {
    return if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) true
    else Settings.canDrawOverlays(this)
  }

  private fun hasActiveSession(): Boolean {
    return try {
      val sid = TrackerPrefs.sp(this).getString(TrackerPrefs.KEY_ACTIVE_SESSION, null)
      sid != null && sid.trim().isNotEmpty()
    } catch (_: Exception) {
      false
    }
  }

  private fun showBubble() {
    if (!hasActiveSession()) return
    if (bubble != null) return
    val w = wm ?: return
    if (!canDrawOverlay()) return

    val root = FrameLayout(this)

    val tv = TextView(this)
    tv.text = "📝"
    tv.textSize = 22f
    tv.typeface = Typeface.DEFAULT_BOLD
    tv.gravity = Gravity.CENTER
    tv.setPadding(dp(10), dp(8), dp(10), dp(8))

    val bg = GradientDrawable()
    bg.setColor(0x99EFF7FF.toInt())
    bg.cornerRadius = dp(22).toFloat()
    bg.setStroke(dp(1), 0x332FB7A3)
    tv.background = bg
    bubbleBg = bg
    tv.setTextColor(0xFF0B1220.toInt())

    root.addView(tv, FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.WRAP_CONTENT,
      FrameLayout.LayoutParams.WRAP_CONTENT,
      Gravity.CENTER
    ))

    // ✅ 살짝 반투명 유지(전체 알파)
    root.alpha = 1.0f

    val baseFlags =
      WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
      WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN

    val notFocusableFlags = baseFlags or WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE

    val lp = WindowManager.LayoutParams(
      WindowManager.LayoutParams.WRAP_CONTENT,
      WindowManager.LayoutParams.WRAP_CONTENT,
      overlayType(),
      notFocusableFlags,
      PixelFormat.TRANSLUCENT
    )

    fun setWindowFocusable(focusable: Boolean) {
      val w2 = wm ?: return
      val newFlags = if (focusable) baseFlags else notFocusableFlags
      if (lp.flags != newFlags) {
        lp.flags = newFlags
        try { w2.updateViewLayout(root, lp) } catch (_: Exception) {}
      }
      if (focusable) {
        root.isFocusable = true
        root.isFocusableInTouchMode = true
        root.requestFocus()
      }
    }

    lp.gravity = Gravity.END or Gravity.CENTER_VERTICAL

    // ✅ 저장된 위치 복원(없으면 기본값)
    val sp: SharedPreferences = TrackerPrefs.sp(this)
    if (sp.contains(TrackerPrefs.KEY_BUBBLE_X) && sp.contains(TrackerPrefs.KEY_BUBBLE_Y)) {
      lp.x = sp.getInt(TrackerPrefs.KEY_BUBBLE_X, dp(18))
      lp.y = sp.getInt(TrackerPrefs.KEY_BUBBLE_Y, 0)
    } else {
      lp.x = dp(18)
      lp.y = 0
    }

    // ✅ "짧은 탭" = 저장, "길게 누름" = 이동 모드, 이동 중 클릭 방지, 이동 후 위치 저장
    var downRawX = 0f
    var downRawY = 0f
    var startX = 0
    var startY = 0

    var moved = false
    var longPressed = false

    val slop = ViewConfiguration.get(this).scaledTouchSlop
    val longPressTimeout = ViewConfiguration.getLongPressTimeout().toLong()
    val h = android.os.Handler(mainLooper)

    val longPressRunnable = Runnable {
      longPressed = true
    }

    root.setOnTouchListener { _, ev ->
      when (ev.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          moved = false
          longPressed = false

          downRawX = ev.rawX
          downRawY = ev.rawY
          startX = lp.x
          startY = lp.y

          // ✅ 탭 순간 포커스 획득(가능 기기에서 클립보드 접근 성공률 ↑)
          setWindowFocusable(true)

          h.removeCallbacks(longPressRunnable)
          h.postDelayed(longPressRunnable, longPressTimeout)
          true
        }

        MotionEvent.ACTION_MOVE -> {
          val dx = ev.rawX - downRawX
          val dy = ev.rawY - downRawY

          if (!moved && (abs(dx) > slop || abs(dy) > slop)) {
            moved = true
            // ✅ 롱프레스 이전에 움직이면 이동 모드 진입 취소(오탭/오동작 방지)
            if (!longPressed) {
              h.removeCallbacks(longPressRunnable)
            }
          }

          if (longPressed) {
            // gravity END 기준: 오른쪽에서의 거리(lp.x)를 dx에 반대로 반영
            lp.x = startX - dx.toInt()
            lp.y = startY + dy.toInt()
            try { w.updateViewLayout(root, lp) } catch (_: Exception) {}
          }
          true
        }

        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
          h.removeCallbacks(longPressRunnable)

          if (!longPressed) {
            // ✅ 짧은 탭만 저장(움직였으면 저장 안 함)
            if (!moved) {
              moved = false
              longPressed = false
              root.post {
                saveMemoFromClipboard()
                setWindowFocusable(false)
              }
              return@setOnTouchListener true
            }
          } else {
            // ✅ 길게 누름은 "이동했을 때만" 의미가 있음 + 위치 저장
            if (moved) {
              try {
                TrackerPrefs.sp(this).edit()
                  .putInt(TrackerPrefs.KEY_BUBBLE_X, lp.x)
                  .putInt(TrackerPrefs.KEY_BUBBLE_Y, lp.y)
                  .apply()
              } catch (_: Exception) {}
            }
          }

          moved = false
          longPressed = false

          // ✅ 기본은 다시 비포커스(원래처럼)
          setWindowFocusable(false)
          true
        }

        else -> true
      }
    }

    bubble = root
    bubbleLp = lp

    try {
      w.addView(root, lp)
    } catch (_: Exception) {
      bubble = null
      bubbleLp = null
    }
  }

  private fun hideBubble() {
    val w = wm ?: return
    bubble?.let {
      try { w.removeView(it) } catch (_: Exception) {}
    }
    bubble = null
    bubbleLp = null
    bubbleBg = null
    hideMemoPanel()
  }

  private fun toggleMemoPanel() {
    if (memoPanel != null) {
      hideMemoPanel()
    } else {
      showMemoPanel()
    }
  }

  private fun showMemoPanel() {
    if (memoPanel != null) return
    val w = wm ?: return
    if (!canDrawOverlay()) return

    val wrap = LinearLayout(this)
    wrap.orientation = LinearLayout.VERTICAL
    wrap.setPadding(dp(12), dp(12), dp(12), dp(12))

    val cardBg = GradientDrawable()
    cardBg.setColor(0xFFFFFFFF.toInt())
    cardBg.cornerRadius = dp(18).toFloat()
    cardBg.setStroke(dp(1), 0x1F1D2C3B)
    wrap.background = cardBg

    val title = TextView(this)
    title.text = "빠른 메모"
    title.textSize = 13f
    title.typeface = Typeface.DEFAULT_BOLD
    title.setTextColor(0xFF1D2C3B.toInt())

    val input = EditText(this)
    input.setText("")
    input.hint = "여기에 메모를 입력/붙여넣기"
    input.setHintTextColor(0x662D3B3B)
    input.setTextColor(0xFF1D2C3B.toInt())
    input.setPadding(dp(12), dp(10), dp(12), dp(10))
    input.setBackgroundColor(0x19BDEBFF)
    input.inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE
    input.minLines = 2
    input.maxLines = 6

    val btnRow = LinearLayout(this)
    btnRow.orientation = LinearLayout.HORIZONTAL
    btnRow.gravity = Gravity.END
    btnRow.setPadding(0, dp(10), 0, 0)

    fun makeBtn(text: String, bgColor: Int, strokeColor: Int, textColor: Int): TextView {
      val b = TextView(this)
      b.text = text
      b.textSize = 12f
      b.typeface = Typeface.DEFAULT_BOLD
      b.setTextColor(textColor)
      b.gravity = Gravity.CENTER
      b.setPadding(dp(12), dp(10), dp(12), dp(10))
      val g = GradientDrawable()
      g.setColor(bgColor)
      g.cornerRadius = dp(14).toFloat()
      g.setStroke(dp(1), strokeColor)
      b.background = g
      return b
    }

    val closeBtn = makeBtn("닫기", 0x14D9FFF2, 0x332FB7A3, 0xFF13443D.toInt())
    val saveBtn = makeBtn("저장", 0x14FFD6E7, 0x33FF8CBE, 0xFF3B2A3F.toInt())

    closeBtn.setOnClickListener { hideMemoPanel() }
    saveBtn.setOnClickListener {
      val t = (input.text?.toString() ?: "").trim()
      if (t.isEmpty()) {
        Toast.makeText(this, "텍스트 없음", Toast.LENGTH_SHORT).show()
      } else {

        try {
          val arr = MemoStore.getMemos(this)
          var i = 0
          while (i < arr.length()) {
            val o = arr.optJSONObject(i)
            val prev = ((o?.optString("text", "")) ?: "").trim()
            if (prev == t) {
              bubbleBg?.setColor(0x99FF3B30.toInt())
              Toast.makeText(this, "클립보드 복사를 잊으신거 같아요.", Toast.LENGTH_SHORT).show()
              return@setOnClickListener
            }
            i++
          }
        } catch (_: Exception) {}

        saveMemoNative(t)
        bubbleBg?.setColor(0x99EFF7FF.toInt())
        Toast.makeText(this, "메모 저장됨", Toast.LENGTH_SHORT).show()
        input.setText("")
        hideMemoPanel()
      }
    }

    btnRow.addView(closeBtn, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
      rightMargin = dp(8)
    })
    btnRow.addView(saveBtn, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT))

    wrap.addView(title, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    wrap.addView(input, LinearLayout.LayoutParams(dp(320), LinearLayout.LayoutParams.WRAP_CONTENT).apply {
      topMargin = dp(10)
    })
    wrap.addView(btnRow, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))

    val lp = WindowManager.LayoutParams(
      dp(340),
      WindowManager.LayoutParams.WRAP_CONTENT,
      overlayType(),
      WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
        WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      PixelFormat.TRANSLUCENT
    )

    // 버블 근처에 표시(오른쪽 중앙 기준)
    lp.gravity = Gravity.END or Gravity.CENTER_VERTICAL
    lp.x = dp(18 + 8)
    lp.y = dp(-40)
    lp.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE

    memoPanel = wrap
    memoPanelLp = lp
    memoInput = input

    try {
      w.addView(wrap, lp)
      input.requestFocus()
      val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
      imm.showSoftInput(input, InputMethodManager.SHOW_IMPLICIT)
    } catch (_: Exception) {
      memoPanel = null
      memoPanelLp = null
      memoInput = null
    }
  }

  private fun hideMemoPanel() {
    val w = wm ?: return
    val input = memoInput
    if (input != null) {
      try {
        val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
        imm.hideSoftInputFromWindow(input.windowToken, 0)
      } catch (_: Exception) {}
    }

    memoPanel?.let {
      try { w.removeView(it) } catch (_: Exception) {}
    }
    memoPanel = null
    memoPanelLp = null
    memoInput = null
  }

  private fun readClipboardText(): String? {
    return try {
      val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager?
      if (cm == null) return null
      if (!cm.hasPrimaryClip()) return null
      val clip: ClipData? = cm.primaryClip
      if (clip == null || clip.itemCount <= 0) return null

      val item = clip.getItemAt(0) ?: return null

      val direct = item.text
      if (direct != null) {
        val s = direct.toString()
        if (s.trim().isNotEmpty()) return s
      }

      val cs = item.coerceToText(this) ?: return null
      val s2 = cs.toString()
      if (s2.trim().isEmpty()) null else s2
    } catch (_: Exception) {
      null
    }
  }

  private fun saveMemoFromClipboard() {
    val t = try { (readClipboardText() ?: "").trim() } catch (_: Exception) { "" }
    if (t.isEmpty()) {
      Toast.makeText(this, "클립보드 텍스트 없음", Toast.LENGTH_SHORT).show()
      return
    }

    try {
      val arr = MemoStore.getMemos(this)
      var i = 0
      while (i < arr.length()) {
        val o = arr.optJSONObject(i)
        val prev = ((o?.optString("text", "")) ?: "").trim()
        if (prev == t) {
          bubbleBg?.setColor(0x99FF3B30.toInt())
          Toast.makeText(this, "클립보드 복사를 잊으신거 같아요.", Toast.LENGTH_SHORT).show()
          return
        }
        i++
      }
    } catch (_: Exception) {}

    saveMemoNative(t)
    bubbleBg?.setColor(0x99EFF7FF.toInt())
    Toast.makeText(this, "메모 저장됨", Toast.LENGTH_SHORT).show()
  }

  // ✅ 네이티브 저장 (앱 전환 없음)
  private fun saveMemoNative(text: String) {
    try {
      val sp: SharedPreferences = TrackerPrefs.sp(this)
      val sessionId = sp.getString(TrackerPrefs.KEY_ACTIVE_SESSION, null) ?: return

      val lat = sp.getFloat(TrackerPrefs.KEY_LAST_LAT, 0f).toDouble()
      val lng = sp.getFloat(TrackerPrefs.KEY_LAST_LNG, 0f).toDouble()
      val acc = sp.getFloat(TrackerPrefs.KEY_LAST_ACC, 0f).toDouble()
      val locT = sp.getLong(TrackerPrefs.KEY_LAST_T, 0L).toDouble()
      val now = System.currentTimeMillis()

      val memo = JSONObject()
      memo.put("sessionId", sessionId)
      memo.put("text", text)
      memo.put("savedAt", now)
      memo.put("lat", lat)
      memo.put("lng", lng)
      memo.put("acc", acc)
      memo.put("locT", locT)

      MemoStore.append(this, memo)
      updateNotification("기록 중")
    } catch (_: Exception) {}
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val hasSession = hasActiveSession()

    if (intent == null) {
      hideBubble()
      stopUpdates()
      try { stopForeground(true) } catch (_: Exception) {}
      stopSelf()
      return START_NOT_STICKY
    }

    val action = intent.action
    if (action == null) {
      if (!hasSession) hideBubble()
      return START_NOT_STICKY
    }

    if (ACTION_START == action) {
      startForegroundSafe("기록 중")
      startUpdates()
      if (hasSession) showBubble() else hideBubble()
      return START_NOT_STICKY
    }

    if (ACTION_OVERLAY_SHOW == action) {
      if (hasSession) showBubble() else hideBubble()
      return START_NOT_STICKY
    }

    if (ACTION_OVERLAY_HIDE == action) {
      hideBubble()
      return START_NOT_STICKY
    }

    if (ACTION_STOP == action) {
      hideBubble()
      stopUpdates()
      stopForeground(true)
      stopSelf()
      return START_NOT_STICKY
    }

    if (!hasSession) hideBubble()
    return START_NOT_STICKY
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    hideBubble()
    stopUpdates()
    try { stopForeground(true) } catch (_: Exception) {}
    stopSelf()
    super.onTaskRemoved(rootIntent)
  }

  override fun onDestroy() {
    hideBubble()
    stopUpdates()
    super.onDestroy()
  }

  @Nullable
  override fun onBind(intent: Intent?): IBinder? {
    return null
  }
}
`;

  const TrackerModule = `package ${P}.tracker

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

class TrackerModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String {
    return "Tracker"
  }

  @ReactMethod
  fun canDrawOverlays(promise: Promise) {
    try {
      val ok = if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) true else Settings.canDrawOverlays(reactApplicationContext)
      promise.resolve(ok)
    } catch (e: Exception) {
      promise.reject("ERR", e)
    }
  }

  @ReactMethod
  fun openOverlaySettings(promise: Promise) {
    try {
      val c = reactApplicationContext
      val i = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + c.packageName))
      i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      c.startActivity(i)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("ERR", e)
    }
  }

  private fun startTrackingService(c: ReactApplicationContext) {
    val ts = Intent(c, TrackingService::class.java)
    ts.action = TrackingService.ACTION_START
    if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(ts) else c.startService(ts)
  }

  private fun stopTrackingService(c: ReactApplicationContext) {
    val ts = Intent(c, TrackingService::class.java)
    ts.action = TrackingService.ACTION_STOP
    if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(ts) else c.startService(ts)
  }

  private fun showOverlay(c: ReactApplicationContext) {
    val ts = Intent(c, TrackingService::class.java)
    ts.action = TrackingService.ACTION_OVERLAY_SHOW
    try {
      if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(ts) else c.startService(ts)
    } catch (_: Exception) {}
  }

  private fun hideOverlay(c: ReactApplicationContext) {
    val ts = Intent(c, TrackingService::class.java)
    ts.action = TrackingService.ACTION_OVERLAY_HIDE
    try {
      if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(ts) else c.startService(ts)
    } catch (_: Exception) {}
  }

  @ReactMethod
  fun startSession(promise: Promise) {
    try {
      val c = reactApplicationContext

      val existing = TrackerPrefs.sp(c).getString(TrackerPrefs.KEY_ACTIVE_SESSION, null)
      if (existing != null) {
        startTrackingService(c)
        showOverlay(c)

        val out = Arguments.createMap()
        out.putString("sessionId", existing)
        out.putDouble("startTime", TrackerPrefs.sp(c).getLong(TrackerPrefs.KEY_START_TIME, System.currentTimeMillis()).toDouble())
        promise.resolve(out)
        return
      }

      val sessionId = UUID.randomUUID().toString()
      val now = System.currentTimeMillis()

      TrackerPrefs.sp(c).edit()
        .putString(TrackerPrefs.KEY_ACTIVE_SESSION, sessionId)
        .putLong(TrackerPrefs.KEY_START_TIME, now)
        .putString(TrackerPrefs.KEY_ROUTE_JSON, "[]")
        .apply()

      startTrackingService(c)
      showOverlay(c)

      val out = Arguments.createMap()
      out.putString("sessionId", sessionId)
      out.putDouble("startTime", now.toDouble())
      promise.resolve(out)
    } catch (e: Exception) {
      promise.reject("ERR", e)
    }
  }

  @ReactMethod
  fun stopSession(promise: Promise) {
    try {
      val c = reactApplicationContext
      val sessionId = TrackerPrefs.sp(c).getString(TrackerPrefs.KEY_ACTIVE_SESSION, null)
      if (sessionId == null) {
        promise.reject("ERR", "No active session")
        return
      }

      val end = System.currentTimeMillis()

      TrackerPrefs.sp(c).edit()
        .remove(TrackerPrefs.KEY_ACTIVE_SESSION)
        .apply()

      hideOverlay(c)
      stopTrackingService(c)

      val out = Arguments.createMap()
      out.putString("sessionId", sessionId)
      out.putDouble("endTime", end.toDouble())
      promise.resolve(out)
    } catch (e: Exception) {
      promise.reject("ERR", e)
    }
  }

  @ReactMethod
  fun getLastLocation(promise: Promise) {
    try {
      val c = reactApplicationContext
      val lat = TrackerPrefs.sp(c).getFloat(TrackerPrefs.KEY_LAST_LAT, 0f)
      val lng = TrackerPrefs.sp(c).getFloat(TrackerPrefs.KEY_LAST_LNG, 0f)
      val acc = TrackerPrefs.sp(c).getFloat(TrackerPrefs.KEY_LAST_ACC, 0f)
      val t = TrackerPrefs.sp(c).getLong(TrackerPrefs.KEY_LAST_T, 0L)

      val out = Arguments.createMap()
      out.putDouble("lat", lat.toDouble())
      out.putDouble("lng", lng.toDouble())
      out.putDouble("acc", acc.toDouble())
      out.putDouble("t", t.toDouble())
      promise.resolve(out)
    } catch (e: Exception) {
      promise.reject("ERR", e)
    }
  }

  @ReactMethod
  fun getRoute(promise: Promise) {
    try {
      val c = reactApplicationContext
      val raw = TrackerPrefs.sp(c).getString(TrackerPrefs.KEY_ROUTE_JSON, "[]") ?: "[]"
      val arr = JSONArray(raw)

      val out: WritableArray = Arguments.createArray()
      for (i in 0 until arr.length()) {
        val o: JSONObject? = arr.optJSONObject(i)
        if (o != null) {
          val m: WritableMap = Arguments.createMap()
          m.putDouble("lat", o.optDouble("lat", 0.0))
          m.putDouble("lng", o.optDouble("lng", 0.0))
          m.putDouble("t", o.optDouble("t", 0.0))
          m.putDouble("acc", o.optDouble("acc", 0.0))
          out.pushMap(m)
        }
      }

      promise.resolve(out)
    } catch (e: Exception) {
      promise.reject("ERR", e)
    }
  }

  @ReactMethod
  fun clearRoute(promise: Promise) {
    try {
      val c = reactApplicationContext
      TrackerPrefs.sp(c).edit().putString(TrackerPrefs.KEY_ROUTE_JSON, "[]").apply()
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("ERR", e)
    }
  }

  @ReactMethod
  fun getMemos(promise: Promise) {
    try {
      val c = reactApplicationContext
      val arr = MemoStore.getMemos(c)

      val out: WritableArray = Arguments.createArray()
      for (i in 0 until arr.length()) {
        val o: JSONObject? = arr.optJSONObject(i)
        if (o != null) {
          val m: WritableMap = Arguments.createMap()
          m.putString("sessionId", o.optString("sessionId", ""))
          m.putString("text", o.optString("text", ""))
          m.putDouble("savedAt", o.optDouble("savedAt", 0.0))
          m.putDouble("lat", o.optDouble("lat", 0.0))
          m.putDouble("lng", o.optDouble("lng", 0.0))
          m.putDouble("acc", o.optDouble("acc", 0.0))
          m.putDouble("locT", o.optDouble("locT", 0.0))
          out.pushMap(m)
        }
      }

      promise.resolve(out)
    } catch (e: Exception) {
      promise.reject("ERR", e)
    }
  }

  @ReactMethod
  fun clearMemos(promise: Promise) {
    try {
      val c = reactApplicationContext
      MemoStore.clear(c)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("ERR", e)
    }
  }
}
`;

  const TrackerPackage = `package ${P}.tracker

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import java.util.Collections

class TrackerPackage : ReactPackage {
  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    return Collections.emptyList()
  }

  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(TrackerModule(reactContext))
  }
}
`;

  return { TrackerPrefs, MemoStore, TrackingService, TrackerModule, TrackerPackage };
}

module.exports = createRunOncePlugin(withRiderTracker, "withRiderTracker", "1.0.12");
