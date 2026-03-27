import { useTranslation } from "react-i18next";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

interface MetadataSidebarProps {
    metadata?: Record<string, string>;
}

export const MetadataSidebar = ({ metadata }: MetadataSidebarProps) => {
    const { t } = useTranslation();

    if (!metadata || Object.keys(metadata).length === 0) return null;

    return (
        <ScrollArea className="max-h-64">
            <div className="px-4 py-3 space-y-3">
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
    );
};

export default MetadataSidebar;
