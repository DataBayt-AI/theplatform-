import { ChevronRight, ChevronLeft, Bot, ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ModelProfile, ModelProvider, ProviderConnection } from "@/types/data";

interface ModelSelectionSidebarProps {
    isOpen: boolean;
    onToggle: () => void;
    availableModelProfiles: ModelProfile[];
    selectedModels: string[];
    onSelectedModelsChange: (ids: string[]) => void;
    connectionById: Map<string, ProviderConnection>;
    availableProviders: ModelProvider[];
}

export const ModelSelectionSidebar = ({
    isOpen,
    onToggle,
    availableModelProfiles,
    selectedModels,
    onSelectedModelsChange,
    connectionById,
    availableProviders,
}: ModelSelectionSidebarProps) => {
    const { t } = useTranslation();
    const { isRTL } = useLanguage();
    const navigate = useNavigate();

    const CollapseIcon = isRTL ? ChevronLeft : ChevronRight;
    const ExpandIcon = isRTL ? ChevronRight : ChevronLeft;

    return (
        <div className={`relative flex-shrink-0 transition-all duration-300 ${isOpen ? 'w-64' : 'w-10'}`}>
            {isOpen ? (
                <Card className="w-full h-full overflow-hidden border-s flex flex-col">
                    <div className="p-4 border-b flex items-center justify-between shrink-0">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                            <Bot className="h-4 w-4 text-purple-500" />
                            {t("workspace.modelSelection")}
                        </h3>
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={onToggle}>
                            <CollapseIcon className="h-4 w-4" />
                        </Button>
                    </div>
                    <ScrollArea className="flex-1">
                        <div className="p-4 space-y-3">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                {t("workspace.availableModelProfiles")}
                            </p>
                            <Separator />
                            {availableModelProfiles.length === 0 ? (
                                <p className="text-xs text-muted-foreground italic">
                                    {t("workspace.noModelProfiles")}
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {availableModelProfiles.map(profile => {
                                        const connection = connectionById.get(profile.providerConnectionId);
                                        const provider = connection ? availableProviders.find(p => p.id === connection.providerId) : null;
                                        return (
                                            <div key={profile.id} className="flex items-start gap-2">
                                                <Checkbox
                                                    id={`sidebar-${profile.id}`}
                                                    checked={selectedModels.includes(profile.id)}
                                                    onCheckedChange={(checked) => {
                                                        if (checked) {
                                                            onSelectedModelsChange([...selectedModels, profile.id]);
                                                        } else {
                                                            onSelectedModelsChange(selectedModels.filter(id => id !== profile.id));
                                                        }
                                                    }}
                                                    className="mt-0.5"
                                                />
                                                <Label htmlFor={`sidebar-${profile.id}`} className="text-sm font-normal cursor-pointer leading-snug">
                                                    {profile.displayName}
                                                    {provider && (
                                                        <span className="block text-xs text-muted-foreground">{provider.name}</span>
                                                    )}
                                                </Label>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                    <div className="p-3 border-t shrink-0">
                        <Button variant="outline" size="sm" className="w-full text-xs gap-1.5" onClick={() => navigate('/model-management')}>
                            <ExternalLink className="w-3 h-3" />
                            {t("workspace.manageModelProfiles")}
                        </Button>
                    </div>
                </Card>
            ) : (
                <div className="flex flex-col items-center gap-2 pt-4">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onToggle}>
                        <ExpandIcon className="h-4 w-4" />
                    </Button>
                    <Bot className="w-4 h-4 text-muted-foreground opacity-60" />
                </div>
            )}
        </div>
    );
};

export default ModelSelectionSidebar;
