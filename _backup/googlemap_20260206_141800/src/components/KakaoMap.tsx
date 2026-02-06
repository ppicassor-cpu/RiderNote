import React, { useEffect, useMemo, useRef } from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import WebView from "react-native-webview";

type Center = { lat: number; lng: number };

type Props = {
  kakaoJsKey: string;
  center: Center;
  style?: StyleProp<ViewStyle>;
};

export default function KakaoMap({ kakaoJsKey, center, style }: Props) {
  const ref = useRef<WebView>(null);

  const html = useMemo(() => {
    const key = (kakaoJsKey || "").trim();
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, height=device-height, initial-scale=1, maximum-scale=1" />
<style>
  html, body { width:100%; height:100%; margin:0; padding:0; background:#000; overflow:hidden; }
  #map { width:100%; height:100%; }
  .msg { color:#fff; font-family:sans-serif; padding:12px; }
</style>
</head>
<body>
  <div id="map"></div>
  <script>
    (function() {
      var KEY = ${JSON.stringify(key)};
      if (!KEY) {
        document.body.innerHTML = '<div class="msg">Kakao JavaScript Key가 비어있습니다. app.json  expo.extra.kakaoJavaScriptKey 설정 후 재실행하세요.</div>';
        return;
      }
      var script = document.createElement('script');
      script.src = 'https://dapi.kakao.com/v2/maps/sdk.js?appkey=' + encodeURIComponent(KEY) + '&autoload=false';
      script.onload = function() {
        if (!window.kakao || !window.kakao.maps) {
          document.body.innerHTML = '<div class="msg">Kakao Maps 로드 실패(네트워크/키 확인)</div>';
          return;
        }
        window.kakao.maps.load(function() {
          var container = document.getElementById('map');
          var centerLat = ${center.lat};
          var centerLng = ${center.lng};
          var map = new kakao.maps.Map(container, {
            center: new kakao.maps.LatLng(centerLat, centerLng),
            level: 3
          });
          var marker = new kakao.maps.Marker({ position: new kakao.maps.LatLng(centerLat, centerLng) });
          marker.setMap(map);

          window.__RN_SET_CENTER = function(lat, lng) {
            try {
              var ll = new kakao.maps.LatLng(lat, lng);
              marker.setPosition(ll);
              map.setCenter(ll);
            } catch (e) {}
          };

          // 초기 전달
          window.__RN_SET_CENTER(centerLat, centerLng);
        });
      };
      script.onerror = function() {
        document.body.innerHTML = '<div class="msg">Kakao SDK 스크립트 로드 실패(인터넷 확인)</div>';
      };
      document.head.appendChild(script);

      function onMsg(ev) {
        try {
          var data = JSON.parse(ev.data);
          if (data && data.type === "center" && window.__RN_SET_CENTER) {
            window.__RN_SET_CENTER(data.lat, data.lng);
          }
        } catch (e) {}
      }

      document.addEventListener("message", onMsg);
      window.addEventListener("message", onMsg);
    })();
  </script>
</body>
</html>`;
  }, [kakaoJsKey, center.lat, center.lng]);

  useEffect(() => {
    if (!ref.current) return;
    const msg = JSON.stringify({ type: "center", lat: center.lat, lng: center.lng });
    ref.current.postMessage(msg);
  }, [center.lat, center.lng]);

  if (!kakaoJsKey || !(kakaoJsKey || "").trim()) {
    return (
      <View style={[styles.fallback, style]}>
        <Text style={styles.fallbackText}>
          Kakao JavaScript Key가 없습니다.{"\n"}
          C:\RiderMemoTracker\app.json  expo.extra.kakaoJavaScriptKey 설정 후 재실행하세요.
        </Text>
      </View>
    );
  }

  return (
    <WebView
      ref={ref}
      originWhitelist={["*"]}
      source={{ html }}
      javaScriptEnabled
      domStorageEnabled
      style={[styles.web, style]}
      onError={(e) => {
        // WebView 레벨 에러는 화면에 표시되도록 fallback 처리(무반응 방지)
      }}
    />
  );
}

const styles = StyleSheet.create({
  web: { flex: 1, backgroundColor: "#000" },
  fallback: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center", padding: 16 },
  fallbackText: { color: "#fff", textAlign: "center", lineHeight: 20 }
});
