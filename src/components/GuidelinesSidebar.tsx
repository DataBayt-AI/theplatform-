import { Project } from "@/types/data";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import { ScrollArea } from "@/components/ui/scroll-area";

interface GuidelinesSidebarProps {
    project: Project | null;
}

export const GuidelinesSidebar = ({ project }: GuidelinesSidebarProps) => {
    const { t } = useTranslation();

    return (
        <div className="border-b border-border/50">
            <ScrollArea className="max-h-64">
                <div className="px-4 py-3">
                    <div className="prose dark:prose-invert max-w-none text-sm leading-relaxed">
                        {project?.guidelines ? (
                            <ReactMarkdown>{project.guidelines}</ReactMarkdown>
                        ) : (
                            <span className="text-muted-foreground italic text-xs">
                                {t("guidelinesDialog.noGuidelines")}
                            </span>
                        )}
                    </div>
                </div>
            </ScrollArea>
        </div>
    );
};

export default GuidelinesSidebar;
