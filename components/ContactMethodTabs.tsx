"use client";

import { InstagramIcon, KakaoTalkIcon, PhoneIcon } from "@/components/FieldIcons";
import {
  CONTACT_TYPES,
  contactHelp,
  contactPlaceholder,
  contactTypeLabel,
  contactTypeShortLabel,
  type ContactType,
} from "@/lib/validation/contact";

interface Props {
  type: ContactType;
  value: string;
  onTypeChange: (type: ContactType) => void;
  onValueChange: (value: string) => void;
}

const icons = {
  instagram: InstagramIcon,
  kakao: KakaoTalkIcon,
  phone: PhoneIcon,
};

export function ContactMethodTabs({ type, value, onTypeChange, onValueChange }: Props) {
  return (
    <div className="mt-5">
      <span className="mb-2 block text-sm font-bold text-[#3f5677]">연락 방법</span>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="연락 방법">
        {CONTACT_TYPES.map((option) => {
          const Icon = icons[option];
          const selected = type === option;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                if (option === type) return;
                onTypeChange(option);
                onValueChange("");
              }}
              className={`flex min-h-14 items-center justify-center gap-1.5 rounded-2xl border px-1.5 text-[11px] font-bold transition sm:text-xs ${
                selected
                  ? "border-[#5f93de] bg-[linear-gradient(135deg,#eef6ff,#faf4ff)] text-[#315f9e] shadow-[0_7px_18px_rgba(62,134,234,.14)]"
                  : "border-[#dbe7f5] bg-white text-[#7b8ca4] hover:bg-[#f8fbff]"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {contactTypeShortLabel(option)}
            </button>
          );
        })}
      </div>

      <label className="mb-2 mt-5 block text-sm font-bold text-[#3f5677]" htmlFor="contact-value">
        {contactTypeLabel(type)}
      </label>
      <input
        id="contact-value"
        className="h-14 w-full rounded-2xl border border-[#dbe4ef] bg-white px-4 text-base text-[#10243f] outline-none transition placeholder:text-[#a4afbf] focus:border-[#74a2e2] focus:ring-4 focus:ring-[#74a2e2]/10"
        inputMode={type === "phone" ? "tel" : "text"}
        autoCapitalize="none"
        autoCorrect="off"
        placeholder={contactPlaceholder(type)}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
      />
      <p className="mt-1.5 min-h-8 text-[10px] leading-4 text-[#8795a8]">{contactHelp(type)}</p>
    </div>
  );
}
