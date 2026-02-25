"use client";

import { useLang } from "@/contexts/LanguageContext";

const LANGUAGES = [
  { code: "es" as const, flag: "🇪🇸", label: "Español" },
  { code: "en" as const, flag: "🇬🇧", label: "English" },
];

export default function LanguageSelector() {
  const { lang, setLang } = useLang();

  return (
    <div className="fixed top-3 right-4 z-40 flex gap-1">
      {LANGUAGES.map(({ code, flag, label }) => (
        <button
          key={code}
          onClick={() => setLang(code)}
          title={label}
          aria-label={label}
          aria-pressed={lang === code}
          className={`text-xl leading-none transition-opacity ${
            lang === code ? "opacity-100" : "opacity-30 hover:opacity-70"
          }`}
        >
          {flag}
        </button>
      ))}
    </div>
  );
}
