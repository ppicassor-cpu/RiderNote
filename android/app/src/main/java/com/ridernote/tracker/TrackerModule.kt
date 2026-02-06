package com.ridernote.tracker

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
