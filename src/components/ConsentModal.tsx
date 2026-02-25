"use client";

import { useState, useEffect } from "react";
import { useLang } from "@/contexts/LanguageContext";
import type { Language } from "@/lib/translations";

const LANGUAGES: { code: Language; flag: string; label: string }[] = [
  { code: "es", flag: "🇪🇸", label: "Español" },
  { code: "en", flag: "🇬🇧", label: "English" },
];

const CONSENT_KEY = "legal-consent";

export default function ConsentModal() {
  const [visible, setVisible] = useState(false);
  const { lang, setLang, t } = useLang();

  useEffect(() => {
    if (!sessionStorage.getItem(CONSENT_KEY)) {
      setVisible(true);
    }
  }, []);

  function accept() {
    sessionStorage.setItem(CONSENT_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">{t.legalTitle}</h2>
          <div className="flex gap-1">
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
        </div>

        <div className="space-y-3 text-sm text-zinc-300">
          <section>
            <p className="font-semibold text-zinc-100 mb-1">{t.localStorageTitle}</p>
            <p>{t.localStorageDesc}</p>
          </section>

          <section>
            <p className="font-semibold text-zinc-100 mb-1">{t.externalServicesTitle}</p>
            <p>{t.externalServicesDesc}</p>
          </section>

          <section>
            <p className="font-semibold text-zinc-100 mb-1">{t.noFinancialAdviceTitle}</p>
            <p>{t.noFinancialAdviceDesc}</p>
          </section>

          <section>
            <p className="font-semibold text-zinc-100 mb-1">{t.cookiesTitle}</p>
            <p>
              {t.cookiesDescPre}{" "}
              <code className="text-xs">localStorage</code>{" "}
              {t.cookiesDescPost}
            </p>
          </section>
        </div>

        <button
          onClick={accept}
          className="w-full rounded-lg bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-500 transition-colors"
        >
          {t.acceptBtn}
        </button>
      </div>
    </div>
  );
}
