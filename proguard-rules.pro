# FILE: C:\RiderNote\proguard-rules.pro

# ----------------------------
# 0) 공통: 스택트레이스/리플렉션 안정성
# ----------------------------
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod

# @Keep 붙은 것들은 반드시 유지
-keep @androidx.annotation.Keep class * { *; }
-keepclassmembers class * { @androidx.annotation.Keep *; }
-keep @android.support.annotation.Keep class * { *; }
-keepclassmembers class * { @android.support.annotation.Keep *; }

# JNI / Native 메서드 이름 유지
-keepclasseswithmembernames class * { native <methods>; }

# Parcelable / Serializable 기본 안전장치
-keepclassmembers class * implements android.os.Parcelable {
  public static final android.os.Parcelable$Creator *;
}
-keepclassmembers class * implements java.io.Serializable {
  static final long serialVersionUID;
  private static final java.io.ObjectStreamField[] serialPersistentFields;
  private void writeObject(java.io.ObjectOutputStream);
  private void readObject(java.io.ObjectInputStream);
  java.lang.Object writeReplace();
  java.lang.Object readResolve();
}

# ----------------------------
# 1) Kotlin
# ----------------------------
-keep class kotlin.Metadata { *; }
-dontwarn kotlin.**
-dontwarn kotlinx.coroutines.**

# ----------------------------
# 2) React Native / Hermes (과보호 X, 핵심만)
# ----------------------------
-keep class com.facebook.react.bridge.** { *; }
-keep class com.facebook.jni.** { *; }
-dontwarn com.facebook.react.**
-dontwarn com.facebook.jni.**
-dontwarn com.facebook.hermes.**
-dontwarn com.facebook.soloader.**

# ----------------------------
# 3) Expo Modules
# ----------------------------
-dontwarn expo.**
-dontwarn expo.modules.**

# ----------------------------
# 4) Google Mobile Ads / UMP (과한 internal keep 제거)
# ----------------------------
-keep class com.google.android.gms.ads.** { *; }
-dontwarn com.google.android.gms.ads.**
-dontwarn com.google.android.ump.**
-dontwarn com.google.android.gms.**

# ----------------------------
# 5) RevenueCat
# ----------------------------
-keep class com.revenuecat.purchases.** { *; }
-dontwarn com.revenuecat.purchases.**

# ----------------------------
# 6) OkHttp / Okio (경고 억제만)
# ----------------------------
-dontwarn okhttp3.**
-dontwarn okio.**
