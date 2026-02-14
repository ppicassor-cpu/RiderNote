package com.ridernote.tracker

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
    const val ACTION_START = "com.ridernote.ACTION_TRACKING_START"
    const val ACTION_STOP = "com.ridernote.ACTION_TRACKING_STOP"

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

    if (ACTION_STOP == action) {
      startForegroundSafe("정리 중")
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
