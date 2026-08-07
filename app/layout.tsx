import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { SERVICE_NAME, SERVICE_TAGLINE, SERVICE_SUBTITLE } from "@/lib/constants";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const description = `${SERVICE_TAGLINE} — ${SERVICE_SUBTITLE}`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: SERVICE_NAME,
  description,
  // 이 서비스는 URL 공유가 유일한 배포 경로다. OG 태그가 없으면 카카오톡·인스타에
  // 맨 링크로만 뜬다. 미리보기 이미지는 app/opengraph-image.tsx 가 생성한다.
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: siteUrl,
    siteName: SERVICE_NAME,
    title: SERVICE_NAME,
    description,
  },
  twitter: {
    card: "summary_large_image",
    title: SERVICE_NAME,
    description,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        {children}
        {/* 개인정보 처리방침은 상시 공개해야 한다.
            예전에는 온보딩 화면에서만 도달할 수 있어, 가입을 마친 이용자는
            앱 어디에서도 처리방침을 다시 볼 수 없었다. */}
        <footer className="border-t mt-8 py-5 px-6 flex justify-center gap-4 text-[11px] text-gray-500">
          <Link href="/terms" className="hover:underline">
            이용약관
          </Link>
          <span aria-hidden>·</span>
          <Link href="/privacy" className="hover:underline">
            개인정보 처리방침
          </Link>
        </footer>
      </body>
    </html>
  );
}
