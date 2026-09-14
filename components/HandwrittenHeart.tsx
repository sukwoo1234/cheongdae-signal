import type { CSSProperties } from "react";

interface Props {
  className?: string;
}

const heartMask: CSSProperties = {
  backgroundColor: "currentColor",
  WebkitMaskImage: "url('/handwritten-heart.png')",
  maskImage: "url('/handwritten-heart.png')",
  WebkitMaskRepeat: "no-repeat",
  maskRepeat: "no-repeat",
  WebkitMaskPosition: "56% 42%",
  maskPosition: "56% 42%",
  WebkitMaskSize: "230% auto",
  maskSize: "230% auto",
};

/** 사용자가 첨부한 한 번에 이어 그린 교차형 하트 원본. */
export function HandwrittenHeart({ className = "" }: Props) {
  return <span aria-hidden className={`inline-block ${className}`} style={heartMask} />;
}
