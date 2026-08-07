import { ImageResponse } from "next/og";
import { SERVICE_NAME, SERVICE_TAGLINE, SERVICE_SUBTITLE } from "@/lib/constants";

export const alt = `${SERVICE_NAME} — ${SERVICE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * 카카오톡·인스타에 링크를 붙였을 때 나오는 미리보기 카드 이미지.
 * URL 공유가 이 서비스의 유일한 배포 경로라 미리보기 유무가 클릭률을 좌우한다.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #faf6e8 0%, #fff3b0 50%, #ffd6e0 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", gap: 24, marginBottom: 56 }}>
          {["#fff3b0", "#ffd6e0", "#c8e6c9", "#b3e5fc"].map((c, i) => (
            <div
              key={c}
              style={{
                width: 120,
                height: 120,
                background: c,
                borderRadius: 6,
                boxShadow: "0 8px 20px rgba(0,0,0,0.10)",
                transform: `rotate(${(i % 2 === 0 ? -1 : 1) * 4}deg)`,
              }}
            />
          ))}
        </div>

        <div
          style={{
            fontSize: 34,
            letterSpacing: 10,
            color: "#6b7280",
            fontWeight: 700,
            marginBottom: 18,
          }}
        >
          {SERVICE_NAME}
        </div>
        <div style={{ fontSize: 78, fontWeight: 800, color: "#1f2937" }}>{SERVICE_TAGLINE}</div>
        <div style={{ fontSize: 36, color: "#4b5563", marginTop: 22 }}>{SERVICE_SUBTITLE}</div>
      </div>
    ),
    size
  );
}
