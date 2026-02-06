package com.ridernote.tracker

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
