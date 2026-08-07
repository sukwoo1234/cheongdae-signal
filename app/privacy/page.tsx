import Link from "next/link";
import { CONTACT_EMAIL, CONTACT_TEAM_NAME } from "@/lib/constants";

export const metadata = {
  title: "개인정보 처리방침 — 청대 시그널",
};

export default function Privacy() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-10 text-sm leading-relaxed text-gray-700">
      <h1 className="text-2xl font-bold mb-2">개인정보 처리방침</h1>
      <p className="text-xs text-gray-500 mb-8">
        청대 시그널(이하 &quot;서비스&quot;)은 개인정보보호법에 따라 이용자의 개인정보를 보호하며,
        관련 법령이 정한 사항을 아래와 같이 안내합니다.
      </p>

      <section className="mb-6">
        <h2 className="font-bold text-base mb-2">1. 수집하는 개인정보 항목</h2>
        <p className="mb-2 font-semibold text-gray-800">이용자가 직접 입력하는 정보</p>
        <ul className="list-disc pl-5 space-y-1 mb-3">
          <li>이메일 주소 (@cju.ac.kr) — 본인 확인 및 로그인</li>
          <li>성별 (남/여) — 이성 카드 노출을 위한 필수 항목</li>
          <li>한 줄 소개 (최대 20자)</li>
          <li>인스타그램 ID</li>
        </ul>
        <p className="mb-2 font-semibold text-gray-800">서비스 이용 과정에서 자동 생성·수집되는 정보</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>접속 IP 주소, 접속 일시, 서비스 이용 기록(카드 열람 이력)</li>
          <li>인증 및 세션 유지를 위한 쿠키</li>
        </ul>
        <p className="mt-2 text-xs text-gray-500">
          주민등록번호, 연락처, 실명 등 위 항목 외의 개인정보는 수집하지 않습니다.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="font-bold text-base mb-2">2. 개인정보의 처리 목적</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>청주대학교 재학생 여부 확인 및 로그인 인증</li>
          <li>카드 게시 및 이성 이용자에게 한 줄 소개 노출</li>
          <li>1인 1회에 한한 인스타그램 ID 공개(매칭)</li>
          <li>부적절한 게시물에 대한 운영자의 사후 조치</li>
        </ul>
        <p className="mt-2">위 목적 외의 용도로는 이용하지 않으며, 마케팅·광고에 활용하지 않습니다.</p>
      </section>

      <section className="mb-6">
        <h2 className="font-bold text-base mb-2">3. 개인정보의 처리 및 보유 기간</h2>
        <p>
          행사 종료 시각 도달 시 서비스가 자동으로 잠기며, 운영자가 데이터 폐기를 실행하는 시점까지
          보유합니다. 폐기는 <strong>행사 종료 후 7일 이내</strong>에 실행하는 것을 원칙으로 합니다.
        </p>
        <p className="mt-2">
          이용자가 서비스 내에서 직접 삭제를 요청한 경우에는 즉시 파기합니다.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="font-bold text-base mb-2">4. 개인정보의 제3자 제공</h2>
        <p>
          서비스는 이용자의 개인정보를 제3자에게 제공하지 않습니다. 다만 매칭 기능의 성격상,
          이용자가 등록한 <strong>한 줄 소개는 이성 이용자에게 공개</strong>되며,
          <strong> 인스타그램 ID는 슬롯을 사용해 해당 카드를 열람한 이용자 1명에게만 공개</strong>됩니다.
          이는 서비스의 본질적 기능이며, 카드 등록 시 이에 동의한 것으로 봅니다.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="font-bold text-base mb-2">5. 개인정보 처리의 위탁 및 국외 이전</h2>
        <p className="mb-2">
          서비스는 아래 사업자에게 개인정보 처리를 위탁하고 있으며, 해당 사업자의 서버가 국외에 있어
          개인정보가 국외로 이전됩니다.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse mb-2">
            <thead>
              <tr className="bg-gray-50">
                <th className="border px-2 py-1.5 text-left">이전받는 자</th>
                <th className="border px-2 py-1.5 text-left">국가</th>
                <th className="border px-2 py-1.5 text-left">이전 항목</th>
                <th className="border px-2 py-1.5 text-left">이전 목적</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border px-2 py-1.5">Supabase, Inc.</td>
                <td className="border px-2 py-1.5">미국</td>
                <td className="border px-2 py-1.5">1항의 전체 항목</td>
                <td className="border px-2 py-1.5">데이터베이스 저장, 인증</td>
              </tr>
              <tr>
                <td className="border px-2 py-1.5">Vercel, Inc.</td>
                <td className="border px-2 py-1.5">미국</td>
                <td className="border px-2 py-1.5">접속 IP, 접속 기록</td>
                <td className="border px-2 py-1.5">웹 서비스 호스팅</td>
              </tr>
              <tr>
                <td className="border px-2 py-1.5">Google LLC</td>
                <td className="border px-2 py-1.5">미국</td>
                <td className="border px-2 py-1.5">이메일 주소</td>
                <td className="border px-2 py-1.5">로그인 메일 발송</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-600">
          이전 시기 및 방법: 서비스 이용 시점에 정보통신망을 통해 수시로 전송됩니다.
          보유 기간은 3항과 같습니다.
        </p>
        <p className="text-xs text-gray-600 mt-1">
          이용자는 개인정보의 국외 이전을 거부할 수 있습니다. 다만 위 위탁은 서비스 제공에 필수적이므로,
          거부하는 경우 서비스를 이용할 수 없습니다.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="font-bold text-base mb-2">6. 개인정보의 파기 절차 및 방법</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>절차</strong>: 보유 기간이 경과하거나 이용자가 삭제를 요청하면, 운영자가 데이터 폐기
            기능을 실행하여 지체 없이 파기합니다.
          </li>
          <li>
            <strong>방법</strong>: 데이터베이스에 저장된 전자적 파일 형태의 개인정보는 복구가 불가능한
            방법으로 영구 삭제합니다. 별도의 종이 문서는 생성하지 않습니다.
          </li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="font-bold text-base mb-2">7. 이용자의 권리와 행사 방법</h2>
        <p className="mb-2">
          이용자는 언제든지 자신의 개인정보에 대해 열람·정정·삭제·처리정지를 요구할 수 있습니다.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>열람·정정</strong>: 로그인 후 &quot;내 카드&quot; 페이지에서 직접 확인·수정
          </li>
          <li>
            <strong>삭제</strong>: &quot;내 카드&quot; 페이지의 &quot;계정과 모든 데이터 즉시 삭제&quot;
            버튼으로 즉시 파기
          </li>
          <li>
            <strong>그 밖의 요구</strong>: 아래 9항의 연락처로 요청 (지체 없이 조치)
          </li>
        </ul>
        <p className="mt-2 text-xs text-gray-500">
          이미 다른 이용자에게 공개된 인스타그램 ID는 기술적으로 회수할 수 없습니다.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="font-bold text-base mb-2">8. 개인정보의 안전성 확보 조치</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>전 구간 HTTPS 암호화 통신</li>
          <li>데이터베이스 행 수준 접근 제어(RLS)를 통한 접근 권한 최소화</li>
          <li>인스타그램 ID는 슬롯을 사용한 이용자에게만 공개되도록 컬럼 단위 접근 제한</li>
          <li>운영자 계정 접근 제한 및 개인정보 취급자 최소화(운영자 1인)</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="font-bold text-base mb-2">9. 개인정보 보호책임자</h2>
        <p className="mb-2">
          개인정보 처리에 관한 문의, 불만 처리, 피해 구제는 아래로 연락해 주시기 바랍니다.
        </p>
        <div className="bg-gray-50 border rounded p-3 text-xs">
          <p>
            <strong>개인정보 보호책임자</strong>
          </p>
          <p>담당 부서: {CONTACT_TEAM_NAME}</p>
          <p>
            연락처:{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-600 underline">
              {CONTACT_EMAIL}
            </a>
          </p>
        </div>
      </section>

      <section className="mb-6">
        <h2 className="font-bold text-base mb-2">10. 권익침해 구제 방법</h2>
        <p className="mb-2">
          개인정보 침해로 인한 구제를 받기 위하여 아래 기관에 분쟁 해결이나 상담을 신청할 수 있습니다.
        </p>
        <ul className="list-disc pl-5 space-y-1 text-xs">
          <li>개인정보 침해신고센터 — 국번없이 118 (privacy.kisa.or.kr)</li>
          <li>개인정보 분쟁조정위원회 — 1833-6972 (kopico.go.kr)</li>
          <li>대검찰청 사이버수사과 — 국번없이 1301 (spo.go.kr)</li>
          <li>경찰청 사이버수사국 — 국번없이 182 (ecrm.police.go.kr)</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="font-bold text-base mb-2">11. 처리방침의 변경</h2>
        <p>
          이 개인정보 처리방침은 2026년 8월 7일부터 적용됩니다. 내용의 추가·삭제·수정이 있을 경우
          서비스 내 공지를 통해 알립니다.
        </p>
      </section>

      <div className="border-t pt-5 mt-8 flex gap-4 text-xs">
        <Link href="/terms" className="text-blue-600 underline">
          이용약관
        </Link>
        <Link href="/" className="text-gray-500 underline">
          처음으로
        </Link>
      </div>
    </main>
  );
}
