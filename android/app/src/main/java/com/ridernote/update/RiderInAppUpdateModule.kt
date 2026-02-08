package com.ridernote.update

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
