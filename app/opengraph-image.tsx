import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { SERVICE_NAME, SERVICE_TAGLINE, SERVICE_SUBTITLE } from "@/lib/constants";

export const alt = `${SERVICE_NAME} — ${SERVICE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const notoSansKr = readFile(join(process.cwd(), "public", "fonts", "NotoSansKR-OG.ttf"));

/**
 * 카카오톡·인스타에 링크를 붙였을 때 나오는 미리보기 카드 이미지.
 * URL 공유가 이 서비스의 유일한 배포 경로라 미리보기 유무가 클릭률을 좌우한다.
 */
export default async function OpengraphImage() {
  const fontData = await notoSansKr;

  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          background:
            "radial-gradient(circle at 50% 38%, rgba(255,255,255,.98) 0%, rgba(255,255,255,.72) 38%, transparent 67%), linear-gradient(145deg, #dceeff 0%, #f4f8ff 48%, #fff0f3 100%)",
          fontFamily: "Noto Sans KR",
        }}
      >
        {[
          { left: 105, top: 355, color: "#ffdce9", rotate: -24, scale: 0.76 },
          { left: 280, top: 92, color: "#eadcff", rotate: 18, scale: 0.54 },
          { left: 930, top: 105, color: "#d9ebff", rotate: -8, scale: 0.68 },
          { left: 1015, top: 390, color: "#ffdce9", rotate: 28, scale: 0.52 },
          { left: 815, top: 505, color: "#fff1bd", rotate: 8, scale: 0.38 },
        ].map((petal) => (
          <div
            key={`${petal.left}-${petal.top}`}
            style={{
              position: "absolute",
              left: petal.left,
              top: petal.top,
              width: 116,
              height: 76,
              borderRadius: "76% 8% 76% 42%",
              background: `linear-gradient(145deg, #ffffff 0%, ${petal.color} 82%)`,
              boxShadow: "0 12px 26px rgba(70,103,150,.12)",
              transform: `rotate(${petal.rotate}deg) scale(${petal.scale})`,
            }}
          />
        ))}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 15,
            color: "#071b33",
            fontSize: 25,
            fontWeight: 800,
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 11,
              background: "#071b33",
              color: "white",
              fontSize: 18,
            }}
          >
            S
          </div>
          {SERVICE_NAME}
        </div>

        <div
          style={{
            marginTop: 34,
            display: "flex",
            fontSize: 25,
            letterSpacing: 11,
            color: "#6983a6",
            fontWeight: 800,
          }}
        >
          SAME CAMPUS · NEW CONNECTIONS
        </div>
        <div style={{ marginTop: 21, display: "flex", fontSize: 72, fontWeight: 900, color: "#10243f", letterSpacing: -4 }}>
          한 줄로 시작하는
        </div>
        <div style={{ display: "flex", alignItems: "center", fontSize: 82, fontWeight: 900, color: "#10243f", letterSpacing: -5 }}>
          <span style={{ color: "#4a79d2" }}>인스타</span>
          <span style={{ marginLeft: 22 }}>매칭</span>
        </div>
        <div style={{ display: "flex", fontSize: 29, color: "#526985", marginTop: 23, fontWeight: 700 }}>
          {SERVICE_SUBTITLE} · 같은 캠퍼스, 새로운 인연
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "Noto Sans KR",
          data: fontData,
          style: "normal",
          weight: 700,
        },
      ],
    }
  );
}
