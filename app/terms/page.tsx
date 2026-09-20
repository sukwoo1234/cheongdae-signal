import { LegalBackButton } from "@/components/LegalBackButton";

export default function Terms() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-10 text-sm leading-relaxed text-gray-700">
      <h1 className="text-2xl font-bold mb-6">이용약관</h1>

      <section className="mb-6">
        <h2 className="font-bold text-base mb-2">1. 서비스의 목적</h2>
        <p>
          "청대 시그널"은 청주대학교 학생 간 1:1 연락처 매칭을 위한 한정 기간 운영 서비스입니다.
          행사별 참가·매칭 정보는 행사 종료 후 운영자의 폐기 절차에 따라 삭제됩니다.
          다만 6개월 차단된 이메일과 차단 사유는 개인정보 처리방침에 따라 만료 전까지 별도로 보관합니다.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="font-bold text-base mb-2">2. 이용 자격</h2>
        <p>청주대학교 이메일 (@cju.ac.kr) 보유자에 한합니다.</p>
      </section>

      <section className="mb-6">
        <h2 className="font-bold text-base mb-2">3. 사용자 책임</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>본인의 인스타그램 ID, 카카오톡 ID 또는 휴대전화 번호를 정확히 입력할 책임</li>
          <li>한 줄 소개에 욕설, 광고, 타인의 연락처를 작성하지 않을 의무</li>
          <li>매칭으로 얻은 타인의 연락처를 본 서비스 외부 (단톡방·SNS 등)에 무단 유포하지 않을 의무</li>
          <li>학교 이메일 하나당 행사별 기본 선택 기회 1회 규칙 준수</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="font-bold text-base mb-2">4. 서비스 종료</h2>
        <p>운영자가 설정한 종료 시각에 자동으로 모든 매칭이 정지되며, 운영자의 확정 후 행사 데이터가 폐기됩니다.</p>
      </section>

      <section className="mb-6">
        <h2 className="font-bold text-base mb-2">5. 면책</h2>
        <p>매칭 후 발생하는 외부 연락·만남 등에 대해 본 서비스는 책임지지 않습니다.</p>
      </section>

      <section className="mb-6">
        <h2 className="font-bold text-base mb-2">6. 운영 주체</h2>
        <p>
          청대 시그널은 학생 개인이 독립적으로 운영하는 서비스이며, 청주대학교 총학생회가
          주관·주최·운영하거나 보증하는 공식 사업이 아닙니다. 서비스 관련 문의, 신고 및 분쟁은
          서비스 운영자에게 문의해야 합니다.
        </p>
      </section>

      <div className="mt-8 border-t pt-5 text-xs">
        <LegalBackButton className="text-gray-500 underline" />
      </div>
    </main>
  );
}
