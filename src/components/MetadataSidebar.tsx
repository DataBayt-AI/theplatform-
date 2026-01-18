import { ChevronRight, ChevronLeft, FileText } from "lucide-react";
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
    if (!metadata || Object.keys(metadata).length === 0) {
        return null;
    }

    return (
        <div className={`relative flex transition-all duration-300 ${isOpen ? 'w-72' : 'w-0'}`}>
            {/* Toggle Button */}
            <Button
                variant="ghost"
                size="icon"
                className="absolute -left-10 top-4 z-10 h-8 w-8 rounded-full border bg-background shadow-sm"
                onClick={onToggle}
            >
                {isOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>

            {/* Sidebar Content */}
            {isOpen && (
                <Card className="w-full h-full overflow-hidden border-l">
                    <div className="p-4 border-b">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            Metadata
                        </h3>
                    </div>
                    <ScrollArea className="h-[calc(100%-60px)]">
                        <div className="p-4 space-y-3">
                            {Object.entries(metadata).map(([key, value]) => (
                                <div key={key} className="space-y-1">
                                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                        {key}
                                    </p>
                                    <p className="text-sm break-words">
                                        {value || <span className="text-muted-foreground italic">—</span>}
                                    </p>
                                    <Separator className="mt-2" />
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </Card>
            )}
        </div>
    );
};

export default MetadataSidebar;
