package com.ridernote.tracker

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
