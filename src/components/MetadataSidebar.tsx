import { ChevronRight, ChevronLeft, FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

interface MetadataSidebarProps {
    metadata?: Record<string, string>;
    isOpen: boolean;
    onToggle: () => void;
}

export const MetadataSidebar = ({ metadata, isOpen, onToggle }: MetadataSidebarProps) => {
    const { t } = useTranslation();
    const { isRTL } = useLanguage();

    if (!metadata || Object.keys(metadata).length === 0) {
        return null;
    }

    // Collapse arrow points "inward" (toward the sidebar content)
    // Expand arrow points "outward" (toward where sidebar will appear)
    const CollapseIcon = isRTL ? ChevronLeft : ChevronRight;
    const ExpandIcon = isRTL ? ChevronRight : ChevronLeft;

    return (
        <div className={`relative flex-shrink-0 transition-all duration-300 ${isOpen ? 'w-72' : 'w-10'}`}>
            {isOpen ? (
                <Card className="w-full h-full overflow-hidden border-s">
                    <div className="p-4 border-b flex items-center justify-between">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            {t("workspace.metadata")}
                        </h3>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0"
                            onClick={onToggle}
                        >
                            <CollapseIcon className="h-4 w-4" />
                        </Button>
                    </div>
                    <ScrollArea className="h-[calc(100%-60px)]">
                        <div className="p-4 space-y-3">
                            {Object.entries(metadata).map(([key, value]) => (
                                <div key={key} className="space-y-1">
                                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide break-words">
                                        {key}
                                    </p>
                                    <p className="text-sm break-words whitespace-normal">
                                        {value || <span className="text-muted-foreground italic">—</span>}
                                    </p>
                                    <Separator className="mt-2" />
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </Card>
            ) : (
                <div className="flex flex-col items-center gap-2 pt-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={onToggle}
                    >
                        <ExpandIcon className="h-4 w-4" />
                    </Button>
                    <FileText className="w-4 h-4 text-muted-foreground opacity-60" />
                </div>
            )}
        </div>
    );
};

export default MetadataSidebar;
