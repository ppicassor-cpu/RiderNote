/* FILE: C:\RiderNote\plugins\withRiderTrackerFixed.js */
const fs = require("fs");
const path = require("path");

const {
  AndroidConfig,
  withAndroidManifest,
  withMainApplication,
  withDangerousMod,
  createRunOncePlugin
} = require("@expo/config-plugins");

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

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
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

function ensureImportAndRegisterInMainApplication(src, pkg) {
  const importKt = `import ${pkg}.tracker.TrackerPackage`;
  const importJava = `import ${pkg}.tracker.TrackerPackage;`;
  const isJava = /(^\s*package\s+[a-zA-Z0-9_.]+\s*;\s*$)/m.test(src);

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

  if (!src.includes("TrackerPackage()")) {
    if (src.includes("PackageList(this).packages.apply")) {
      if (!src.includes("add(TrackerPackage())")) {
        src = src.replace(
          /PackageList\(this\)\.packages\.apply\s*\{/m,
          "PackageList(this).packages.apply {\n      add(TrackerPackage())"
        );
      }
      return src;
    }

    if (src.match(/return\s+PackageList\(this\)\.packages\b/)) {
      src = src.replace(
        /return\s+PackageList\(this\)\.packages\b/m,
        "return PackageList(this).packages.toMutableList().apply { add(TrackerPackage()) }"
      );
      return src;
    }

    if (src.match(/val\s+packages\s*=\s*PackageList\(this\)\.packages\b/)) {
      src = src.replace(
        /val\s+packages\s*=\s*PackageList\(this\)\.packages\b/m,
        "val packages = PackageList(this).packages.toMutableList()"
      );
      if (!src.includes("packages.add(TrackerPackage())")) {
        src = src.replace(
          /(val packages = PackageList\(this\)\.packages\.toMutableList\(\)\s*\n)/,
          `$1    packages.add(TrackerPackage())\n`
        );
      }
      return src;
    }

    if (src.includes("PackageList(this).packages") && !src.includes(".toMutableList()")) {
      src = src.replace(
        "PackageList(this).packages",
        "PackageList(this).packages.toMutableList().apply { add(TrackerPackage()) }"
      );
      return src;
    }
  }

  if (src.includes("new PackageList(this).getPackages()") && !src.includes("new TrackerPackage()")) {
    src = src.replace(
      /List<ReactPackage>\s+packages\s*=\s*new\s+PackageList\(this\)\.getPackages\(\)\s*;/m,
      (m) => `${m}\n    packages.add(new TrackerPackage());`
    );
    return src;
  }

  return src;
}

// ------------------------------------------------------------------
// ✅ Google Play Services 의존성 제거: LocationManager 사용 (build.gradle 수정 필요 없음)
// ------------------------------------------------------------------
function javaFiles(pkg) {
  const P = pkg;

  const TRACKING_ACTION_START = `${P}.ACTION_TRACKING_START`;
  const TRACKING_ACTION_STOP  = `${P}.ACTION_TRACKING_STOP`;
  const OVERLAY_ACTION_SHOW = `${P}.ACTION_OVERLAY_SHOW`;
  const OVERLAY_ACTION_HIDE = `${P}.ACTION_OVERLAY_HIDE`;

  const TrackerPrefs = `package ${P}.tracker;

import android.content.Context;
import android.content.SharedPreferences;

public final class TrackerPrefs {
  private static final String PREF = "RiderNotePrefs";

  public static final String KEY_ACTIVE_SESSION = "activeSessionId";
  public static final String KEY_START_TIME = "startTime";

  public static final String KEY_LAST_LAT = "lastLat";
  public static final String KEY_LAST_LNG = "lastLng";
  public static final String KEY_LAST_ACC = "lastAcc";
  public static final String KEY_LAST_T   = "lastT";

  public static final String KEY_MEMOS_JSON = "memosJson";
  public static final String KEY_ROUTE_JSON = "routeJson";

  private TrackerPrefs(){}

  public static SharedPreferences sp(Context c) {
    return c.getSharedPreferences(PREF, Context.MODE_PRIVATE);
  }
}
`;

  const MemoStore = `package ${P}.tracker;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

public final class MemoStore {

  private MemoStore(){}

  public static JSONArray getMemos(Context c) {
    try {
      SharedPreferences sp = TrackerPrefs.sp(c);
      String raw = sp.getString(TrackerPrefs.KEY_MEMOS_JSON, "[]");
      return new JSONArray(raw);
    } catch (Exception e) {
      return new JSONArray();
    }
  }

  public static void clear(Context c) {
    TrackerPrefs.sp(c).edit().putString(TrackerPrefs.KEY_MEMOS_JSON, "[]").apply();
  }

  public static void append(Context c, JSONObject memo) {
    try {
      JSONArray arr = getMemos(c);
      arr.put(memo);
      TrackerPrefs.sp(c).edit().putString(TrackerPrefs.KEY_MEMOS_JSON, arr.toString()).apply();
    } catch (Exception ignored) {}
  }
}
`;

  const TrackingService = `package ${P}.tracker;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.TextView;

import androidx.annotation.Nullable;

import org.json.JSONArray;
import org.json.JSONObject;

public class TrackingService extends Service {

  public static final String ACTION_START = "${TRACKING_ACTION_START}";
  public static final String ACTION_STOP  = "${TRACKING_ACTION_STOP}";

  public static final String ACTION_OVERLAY_SHOW = "${OVERLAY_ACTION_SHOW}";
  public static final String ACTION_OVERLAY_HIDE = "${OVERLAY_ACTION_HIDE}";

  public static final String NOTI_CH_ID = "ridernote_tracking_channel";
  public static final int NOTI_ID = 11021;

  private static final int ROUTE_MAX_POINTS = 5000;

  private LocationManager lm;
  private LocationListener listener;

  private WindowManager wm;
  private View bubble;

  @Override
  public void onCreate() {
    super.onCreate();
    lm = (LocationManager) getSystemService(LOCATION_SERVICE);
    wm = (WindowManager) getSystemService(WINDOW_SERVICE);

    listener = new LocationListener() {
      @Override
      public void onLocationChanged(Location loc) {
        if (loc == null) return;

        SharedPreferences sp = TrackerPrefs.sp(TrackingService.this);
        String sessionId = sp.getString(TrackerPrefs.KEY_ACTIVE_SESSION, null);
        if (sessionId == null) return;

        long now = System.currentTimeMillis();

        sp.edit()
          .putFloat(TrackerPrefs.KEY_LAST_LAT, (float) loc.getLatitude())
          .putFloat(TrackerPrefs.KEY_LAST_LNG, (float) loc.getLongitude())
          .putFloat(TrackerPrefs.KEY_LAST_ACC, loc.getAccuracy())
          .putLong(TrackerPrefs.KEY_LAST_T, now)
          .apply();

        try {
          String raw = sp.getString(TrackerPrefs.KEY_ROUTE_JSON, "[]");
          JSONArray arr = new JSONArray(raw);

          JSONObject pt = new JSONObject();
          pt.put("lat", loc.getLatitude());
          pt.put("lng", loc.getLongitude());
          pt.put("t", now);
          pt.put("acc", loc.getAccuracy());
          arr.put(pt);

          if (arr.length() > ROUTE_MAX_POINTS) {
            JSONArray trimmed = new JSONArray();
            int start = arr.length() - ROUTE_MAX_POINTS;
            for (int i = start; i < arr.length(); i++) {
              trimmed.put(arr.get(i));
            }
            arr = trimmed;
          }

          sp.edit().putString(TrackerPrefs.KEY_ROUTE_JSON, arr.toString()).apply();
        } catch (Exception ignored) {}

        updateNotification("기록 중");
      }

      @Override public void onProviderEnabled(String provider) {}
      @Override public void onProviderDisabled(String provider) {}
      @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
    };
  }

  private void ensureChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
      NotificationChannel ch = new NotificationChannel(NOTI_CH_ID, "RiderNote Tracking", NotificationManager.IMPORTANCE_LOW);
      nm.createNotificationChannel(ch);
    }
  }

  private Notification buildNotification(String text) {
    Notification.Builder b = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
      ? new Notification.Builder(this, NOTI_CH_ID)
      : new Notification.Builder(this);

    b.setContentTitle("RiderNote")
     .setContentText(text)
     .setSmallIcon(android.R.drawable.ic_menu_mylocation)
     .setOngoing(true);

    return b.build();
  }

  private void startForegroundSafe(String text) {
    ensureChannel();
    Notification n = buildNotification(text);
    if (Build.VERSION.SDK_INT >= 29) {
      startForeground(NOTI_ID, n, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
    } else {
      startForeground(NOTI_ID, n);
    }
  }

  private void updateNotification(String text) {
    ensureChannel();
    NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
    nm.notify(NOTI_ID, buildNotification(text));
  }

  private void startUpdates() {
    if (lm == null || listener == null) return;
    try {
      long minTimeMs = 5000L;
      float minDistM = 5f;

      if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
        lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, minTimeMs, minDistM, listener);
      }
      if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
        lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, minTimeMs, minDistM, listener);
      }
    } catch (SecurityException ignored) {}
    catch (Exception ignored) {}
  }

  private void stopUpdates() {
    if (lm == null || listener == null) return;
    try { lm.removeUpdates(listener); } catch (Exception ignored) {}
  }

  private int overlayType() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) return WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY;
    return WindowManager.LayoutParams.TYPE_PHONE;
  }

  private void showBubble() {
    if (bubble != null) return;
    if (wm == null) return;

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      if (!Settings.canDrawOverlays(this)) return;
    }

    final FrameLayout root = new FrameLayout(this);

    final TextView tv = new TextView(this);
    tv.setText("📝");
    tv.setTextSize(20f);
    tv.setTypeface(Typeface.DEFAULT_BOLD);
    tv.setGravity(Gravity.CENTER);
    tv.setPadding(22, 18, 22, 18);

    tv.setBackgroundColor(0xFFEFF7FF);
    tv.setTextColor(0xFF0B1220);

    root.addView(tv, new FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.WRAP_CONTENT,
      FrameLayout.LayoutParams.WRAP_CONTENT,
      Gravity.CENTER
    ));

    root.setOnClickListener(v -> launchClipboardCapture());

    WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
      WindowManager.LayoutParams.WRAP_CONTENT,
      WindowManager.LayoutParams.WRAP_CONTENT,
      overlayType(),
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
        | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      PixelFormat.TRANSLUCENT
    );

    lp.gravity = Gravity.END | Gravity.CENTER_VERTICAL;
    lp.x = 24;
    lp.y = 0;

    bubble = root;
    try {
      wm.addView(bubble, lp);
    } catch (Exception e) {
      bubble = null;
    }
  }

  private void hideBubble() {
    if (bubble == null) return;
    try { wm.removeView(bubble); } catch (Exception ignored) {}
    bubble = null;
  }

  private void launchClipboardCapture() {
    try {
      Intent i = new Intent(this, ClipboardCaptureActivity.class);
      i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      i.addFlags(Intent.FLAG_ACTIVITY_NO_ANIMATION);
      i.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
      i.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
      i.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
      startActivity(i);
    } catch (Exception ignored) {}
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    if (intent == null) return START_STICKY;
    String action = intent.getAction();

    if (ACTION_START.equals(action)) {
      startForegroundSafe("기록 중");
      startUpdates();
      showBubble();
      return START_STICKY;
    }

    if (ACTION_OVERLAY_SHOW.equals(action)) {
      showBubble();
      return START_STICKY;
    }

    if (ACTION_OVERLAY_HIDE.equals(action)) {
      hideBubble();
      return START_STICKY;
    }

    if (ACTION_STOP.equals(action)) {
      hideBubble();
      stopUpdates();
      stopForeground(true);
      stopSelf();
      return START_NOT_STICKY;
    }

    return START_STICKY;
  }

  @Override
  public void onDestroy() {
    hideBubble();
    stopUpdates();
    super.onDestroy();
  }

  @Nullable
  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }
}
`;

  const ClipboardCaptureActivity = `package ${P}.tracker;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.view.View;
import android.widget.Toast;

import org.json.JSONObject;

public class ClipboardCaptureActivity extends Activity {

  private boolean handled = false;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
  }

  @Override
  protected void onResume() {
    super.onResume();

    if (handled) return;
    handled = true;

    try {
      final View v = getWindow().getDecorView();
      v.postDelayed(new Runnable() {
        @Override
        public void run() {
          captureOnce();
        }
      }, 120);
    } catch (Exception e) {
      captureOnce();
    }
  }

  private void captureOnce() {
    try {
      SharedPreferences sp = TrackerPrefs.sp(this);
      String sessionId = sp.getString(TrackerPrefs.KEY_ACTIVE_SESSION, null);
      if (sessionId == null) {
        finishNoAnim();
        return;
      }

      String text = readClipboardText();
      if (text == null) {
        Toast.makeText(this, "클립보드 텍스트 없음", Toast.LENGTH_SHORT).show();
        finishNoAnim();
        return;
      }

      double lat = (double) sp.getFloat(TrackerPrefs.KEY_LAST_LAT, 0f);
      double lng = (double) sp.getFloat(TrackerPrefs.KEY_LAST_LNG, 0f);
      double acc = (double) sp.getFloat(TrackerPrefs.KEY_LAST_ACC, 0f);
      double locT = (double) sp.getLong(TrackerPrefs.KEY_LAST_T, 0L);

      long now = System.currentTimeMillis();

      JSONObject memo = new JSONObject();
      memo.put("sessionId", sessionId);
      memo.put("text", text);
      memo.put("savedAt", now);
      memo.put("lat", lat);
      memo.put("lng", lng);
      memo.put("acc", acc);
      memo.put("locT", locT);

      MemoStore.append(this, memo);

      Toast.makeText(this, "메모 저장됨", Toast.LENGTH_SHORT).show();
    } catch (Exception e) {
    }

    finishNoAnim();
  }

  private void finishNoAnim() {
    try { finish(); } catch (Exception ignored) {}
    try { overridePendingTransition(0, 0); } catch (Exception ignored) {}
  }

  private String readClipboardText() {
    try {
      ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
      if (cm == null) return null;
      if (!cm.hasPrimaryClip()) return null;
      ClipData clip = cm.getPrimaryClip();
      if (clip == null || clip.getItemCount() <= 0) return null;

      ClipData.Item item = clip.getItemAt(0);
      if (item == null) return null;

      CharSequence direct = item.getText();
      if (direct != null) {
        String s = direct.toString();
        if (!s.trim().isEmpty()) return s;
      }

      CharSequence cs = item.coerceToText(this);
      if (cs == null) return null;
      String s2 = cs.toString();
      if (s2.trim().isEmpty()) return null;
      return s2;
    } catch (Exception e) {
      return null;
    }
  }
}
`;

  const TrackerModule = `package ${P}.tracker;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;

import org.json.JSONArray;

import java.util.UUID;

public class TrackerModule extends ReactContextBaseJavaModule {

  public TrackerModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return "Tracker";
  }

  @ReactMethod
  public void canDrawOverlays(Promise promise) {
    try {
      boolean ok;
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) ok = true;
      else ok = Settings.canDrawOverlays(getReactApplicationContext());
      promise.resolve(ok);
    } catch (Exception e) {
      promise.reject("ERR", e);
    }
  }

  @ReactMethod
  public void openOverlaySettings(Promise promise) {
    try {
      ReactApplicationContext c = getReactApplicationContext();
      Intent i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + c.getPackageName()));
      i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      c.startActivity(i);
      promise.resolve(null);
    } catch (Exception e) {
      promise.reject("ERR", e);
    }
  }

  private void startTrackingService(ReactApplicationContext c) {
    Intent ts = new Intent(c, TrackingService.class);
    ts.setAction(TrackingService.ACTION_START);
    if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(ts);
    else c.startService(ts);
  }

  private void stopTrackingService(ReactApplicationContext c) {
    Intent ts = new Intent(c, TrackingService.class);
    ts.setAction(TrackingService.ACTION_STOP);
    if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(ts);
    else c.startService(ts);
  }

  private void showOverlay(ReactApplicationContext c) {
    Intent ts = new Intent(c, TrackingService.class);
    ts.setAction(TrackingService.ACTION_OVERLAY_SHOW);
    try {
      if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(ts);
      else c.startService(ts);
    } catch (Exception ignored) {}
  }

  private void hideOverlay(ReactApplicationContext c) {
    Intent ts = new Intent(c, TrackingService.class);
    ts.setAction(TrackingService.ACTION_OVERLAY_HIDE);
    try {
      if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(ts);
      else c.startService(ts);
    } catch (Exception ignored) {}
  }

  @ReactMethod
  public void startSession(Promise promise) {
    try {
      ReactApplicationContext c = getReactApplicationContext();

      String existing = TrackerPrefs.sp(c).getString(TrackerPrefs.KEY_ACTIVE_SESSION, null);
      if (existing != null) {
        startTrackingService(c);
        showOverlay(c);

        WritableMap out = Arguments.createMap();
        out.putString("sessionId", existing);
        out.putDouble("startTime", TrackerPrefs.sp(c).getLong(TrackerPrefs.KEY_START_TIME, System.currentTimeMillis()));
        promise.resolve(out);
        return;
      }

      String sessionId = UUID.randomUUID().toString();
      long now = System.currentTimeMillis();

      TrackerPrefs.sp(c).edit()
        .putString(TrackerPrefs.KEY_ACTIVE_SESSION, sessionId)
        .putLong(TrackerPrefs.KEY_START_TIME, now)
        .putString(TrackerPrefs.KEY_ROUTE_JSON, "[]")
        .apply();

      startTrackingService(c);
      showOverlay(c);

      WritableMap out = Arguments.createMap();
      out.putString("sessionId", sessionId);
      out.putDouble("startTime", now);
      promise.resolve(out);
    } catch (Exception e) {
      promise.reject("ERR", e);
    }
  }

  @ReactMethod
  public void stopSession(Promise promise) {
    try {
      ReactApplicationContext c = getReactApplicationContext();
      String sessionId = TrackerPrefs.sp(c).getString(TrackerPrefs.KEY_ACTIVE_SESSION, null);
      if (sessionId == null) {
        promise.reject("ERR", "No active session");
        return;
      }

      long end = System.currentTimeMillis();

      TrackerPrefs.sp(c).edit()
        .remove(TrackerPrefs.KEY_ACTIVE_SESSION)
        .apply();

      hideOverlay(c);
      stopTrackingService(c);

      WritableMap out = Arguments.createMap();
      out.putString("sessionId", sessionId);
      out.putDouble("endTime", end);
      promise.resolve(out);
    } catch (Exception e) {
      promise.reject("ERR", e);
    }
  }

  @ReactMethod
  public void getLastLocation(Promise promise) {
    try {
      ReactApplicationContext c = getReactApplicationContext();
      float lat = TrackerPrefs.sp(c).getFloat(TrackerPrefs.KEY_LAST_LAT, 0f);
      float lng = TrackerPrefs.sp(c).getFloat(TrackerPrefs.KEY_LAST_LNG, 0f);
      float acc = TrackerPrefs.sp(c).getFloat(TrackerPrefs.KEY_LAST_ACC, 0f);
      long t = TrackerPrefs.sp(c).getLong(TrackerPrefs.KEY_LAST_T, 0L);

      WritableMap out = Arguments.createMap();
      out.putDouble("lat", (double) lat);
      out.putDouble("lng", (double) lng);
      out.putDouble("acc", (double) acc);
      out.putDouble("t", (double) t);
      promise.resolve(out);
    } catch (Exception e) {
      promise.reject("ERR", e);
    }
  }

  @ReactMethod
  public void getRoute(Promise promise) {
    try {
      ReactApplicationContext c = getReactApplicationContext();
      String raw = TrackerPrefs.sp(c).getString(TrackerPrefs.KEY_ROUTE_JSON, "[]");
      JSONArray arr = new JSONArray(raw);

      WritableArray out = Arguments.createArray();
      for (int i = 0; i < arr.length(); i++) {
        org.json.JSONObject o = arr.optJSONObject(i);
        if (o == null) continue;

        WritableMap m = Arguments.createMap();
        m.putDouble("lat", o.optDouble("lat", 0));
        m.putDouble("lng", o.optDouble("lng", 0));
        m.putDouble("t", o.optDouble("t", 0));
        m.putDouble("acc", o.optDouble("acc", 0));
        out.pushMap(m);
      }

      promise.resolve(out);
    } catch (Exception e) {
      promise.reject("ERR", e);
    }
  }

  @ReactMethod
  public void clearRoute(Promise promise) {
    try {
      ReactApplicationContext c = getReactApplicationContext();
      TrackerPrefs.sp(c).edit().putString(TrackerPrefs.KEY_ROUTE_JSON, "[]").apply();
      promise.resolve(null);
    } catch (Exception e) {
      promise.reject("ERR", e);
    }
  }

  @ReactMethod
  public void getMemos(Promise promise) {
    try {
      ReactApplicationContext c = getReactApplicationContext();
      org.json.JSONArray arr = MemoStore.getMemos(c);

      WritableArray out = Arguments.createArray();
      for (int i = 0; i < arr.length(); i++) {
        org.json.JSONObject o = arr.optJSONObject(i);
        if (o == null) continue;

        WritableMap m = Arguments.createMap();
        m.putString("sessionId", o.optString("sessionId", ""));
        m.putString("text", o.optString("text", ""));
        m.putDouble("savedAt", o.optDouble("savedAt", 0));
        m.putDouble("lat", o.optDouble("lat", 0));
        m.putDouble("lng", o.optDouble("lng", 0));
        m.putDouble("acc", o.optDouble("acc", 0));
        m.putDouble("locT", o.optDouble("locT", 0));
        out.pushMap(m);
      }

      promise.resolve(out);
    } catch (Exception e) {
      promise.reject("ERR", e);
    }
  }

  @ReactMethod
  public void clearMemos(Promise promise) {
    try {
      ReactApplicationContext c = getReactApplicationContext();
      MemoStore.clear(c);
      promise.resolve(null);
    } catch (Exception e) {
      promise.reject("ERR", e);
    }
  }
}
`;

  const TrackerPackage = `package ${P}.tracker;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class TrackerPackage implements ReactPackage {
  @Override
  public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {
    return Collections.emptyList();
  }

  @Override
  public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
    List<NativeModule> modules = new ArrayList<>();
    modules.add(new TrackerModule(reactContext));
    return modules;
  }
}
`;

  return { TrackerPrefs, MemoStore, TrackingService, ClipboardCaptureActivity, TrackerModule, TrackerPackage };
}

function withRiderTrackerFixed(config) {
  config = withDangerousMod(config, [
    "android",
    async (config) => {
      const pkg = safeGetPackage(config);
      const androidRoot = config.modRequest.platformProjectRoot;
      const javaDir = path.join(androidRoot, "app", "src", "main", "java", ...pkg.split("."), "tracker");
      ensureDir(javaDir);

      const files = javaFiles(pkg);

      writeFileIfChanged(path.join(javaDir, "TrackerPrefs.java"), files.TrackerPrefs);
      writeFileIfChanged(path.join(javaDir, "MemoStore.java"), files.MemoStore);
      writeFileIfChanged(path.join(javaDir, "TrackingService.java"), files.TrackingService);
      writeFileIfChanged(path.join(javaDir, "ClipboardCaptureActivity.java"), files.ClipboardCaptureActivity);
      writeFileIfChanged(path.join(javaDir, "TrackerModule.java"), files.TrackerModule);
      writeFileIfChanged(path.join(javaDir, "TrackerPackage.java"), files.TrackerPackage);

      return config;
    }
  ]);

  config = withAndroidManifest(config, (config) => {
    const pkg = safeGetPackage(config);
    const manifest = config.modResults;

    manifest.manifest["uses-permission"] = manifest.manifest["uses-permission"] || [];
    for (const p of PERMS) {
      const exists = manifest.manifest["uses-permission"].some((x) => x && x.$ && x.$["android:name"] === p);
      if (!exists) manifest.manifest["uses-permission"].push({ $: { "android:name": p } });
    }

    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);

    app.service = app.service || [];
    const trackingName = `${pkg}.tracker.TrackingService`;
    if (!app.service.some((s) => s && s.$ && s.$["android:name"] === trackingName)) {
      app.service.push({
        $: {
          "android:name": trackingName,
          "android:exported": "false",
          "android:foregroundServiceType": "location"
        }
      });
    }

    app.activity = app.activity || [];
    const captureName = `${pkg}.tracker.ClipboardCaptureActivity`;
    if (!app.activity.some((a) => a && a.$ && a.$["android:name"] === captureName)) {
      app.activity.push({
        $: {
          "android:name": captureName,
          "android:exported": "false",
          "android:excludeFromRecents": "true",
          "android:noHistory": "true",
          "android:finishOnTaskLaunch": "true",
          "android:theme": "@android:style/Theme.Translucent.NoTitleBar"
        }
      });
    }

    return config;
  });

  config = withMainApplication(config, (config) => {
    const pkg = safeGetPackage(config);
    config.modResults.contents = ensureImportAndRegisterInMainApplication(config.modResults.contents, pkg);
    return config;
  });

  return config;
}

module.exports = createRunOncePlugin(withRiderTrackerFixed, "withRiderTrackerFixed", "1.0.0");
