import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

type Language = "en" | "ar";

interface LanguageContextValue {
  language: Language;
  isRTL: boolean;
  setLanguage: (lang: Language) => void;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: "en",
  isRTL: false,
  setLanguage: () => {},
});

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const { i18n } = useTranslation();
  const [language, setLanguageState] = useState<Language>(
    () => (localStorage.getItem("databayt_lang") as Language) || "en"
  );

  const isRTL = language === "ar";

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    i18n.changeLanguage(lang);
    localStorage.setItem("databayt_lang", lang);
  };

  // Sync document dir and lang attributes whenever language changes
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = isRTL ? "rtl" : "ltr";
  }, [language, isRTL]);

  // Sync on mount in case i18n detector already resolved a language
  useEffect(() => {
    const stored = localStorage.getItem("databayt_lang") as Language | null;
    const resolved = stored || (i18n.language?.startsWith("ar") ? "ar" : "en");
    if (resolved !== language) {
      setLanguage(resolved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <LanguageContext.Provider value={{ language, isRTL, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
