import { useTranslation } from "react-i18next";
import { useLanguage } from "@/contexts/LanguageContext";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Check, Languages } from "lucide-react";

/** Used inside a DropdownMenuContent */
export const LanguageSwitcher = () => {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();

  return (
    <>
      <DropdownMenuItem onClick={() => setLanguage("en")} className="gap-2">
        <Languages className="h-4 w-4 opacity-60" />
        {t("language.english")}
        {language === "en" && <Check className="ms-auto h-3.5 w-3.5" />}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => setLanguage("ar")} className="gap-2">
        <Languages className="h-4 w-4 opacity-60" />
        {t("language.arabic")}
        {language === "ar" && <Check className="ms-auto h-3.5 w-3.5" />}
      </DropdownMenuItem>
    </>
  );
};

/** Standalone inline switcher — use on the login page or anywhere outside a dropdown */
export const LanguageSwitcherInline = () => {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        className={language === "en" ? "font-semibold" : "opacity-60"}
        onClick={() => setLanguage("en")}
      >
        EN
      </Button>
      <span className="text-muted-foreground">|</span>
      <Button
        variant="ghost"
        size="sm"
        className={language === "ar" ? "font-semibold" : "opacity-60"}
        onClick={() => setLanguage("ar")}
      >
        عربي
      </Button>
    </div>
  );
};
