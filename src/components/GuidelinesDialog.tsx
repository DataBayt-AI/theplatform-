
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Project } from "@/types/data";
import { projectService } from "@/services/projectService";
import { Book, Edit2, ExternalLink, Save } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { useNavigate } from "react-router-dom";

interface GuidelinesDialogProps {
    project: Project;
    isOpen: boolean;
    onClose: () => void;
    /** When true, the dialog is view-only. Pass settingsPath to show an "Edit in Project Settings" link. */
    readOnly?: boolean;
    /** If provided and readOnly is true, shows an "Edit in Project Settings" link for managers/admins. */
    settingsPath?: string;
    canEdit?: boolean;
    onUpdate?: (updatedProject: Project) => void;
}

export function GuidelinesDialog({
    project,
    isOpen,
    onClose,
    readOnly = false,
    settingsPath,
    canEdit = false,
    onUpdate,
}: GuidelinesDialogProps) {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [isEditing, setIsEditing] = useState(false);
    const [guidelines, setGuidelines] = useState(project.guidelines || "");

    useEffect(() => {
        setGuidelines(project.guidelines || "");
        setIsEditing(false);
    }, [project.guidelines, isOpen]);

    const handleSave = async () => {
        try {
            const updatedProject = { ...project, guidelines };
            await projectService.update(updatedProject);
            onUpdate?.(updatedProject);
            setIsEditing(false);
            toast({
                title: t("guidelinesDialog.savedTitle"),
                description: t("guidelinesDialog.savedDesc"),
            });
        } catch (error) {
            console.error("Failed to update guidelines:", error);
            toast({
                title: t("common.error"),
                description: t("guidelinesDialog.saveError"),
                variant: "destructive",
            });
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <div className="flex items-center justify-between">
                        <DialogTitle className="flex items-center gap-2">
                            <Book className="w-5 h-5 text-purple-500" />
                            {t("guidelinesDialog.title")}
                        </DialogTitle>
                        {!readOnly && canEdit && !isEditing && (
                            <Button size="sm" variant="ghost" onClick={() => setIsEditing(true)}>
                                <Edit2 className="w-4 h-4 mr-2" />
                                {t("guidelinesDialog.edit")}
                            </Button>
                        )}
                    </div>
                    <DialogDescription>
                        {t("guidelinesDialog.description")}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto min-h-[300px] mt-4 rounded-md border p-4 bg-muted/30">
                    {!readOnly && isEditing ? (
                        <Textarea
                            value={guidelines}
                            onChange={(e) => setGuidelines(e.target.value)}
                            className="min-h-[300px] font-mono text-sm leading-relaxed resize-none border-0 focus-visible:ring-0 bg-transparent p-0"
                            placeholder={t("guidelinesDialog.placeholder")}
                        />
                    ) : (
                        <div className="prose dark:prose-invert max-w-none text-sm leading-relaxed">
                            {guidelines ? (
                                <ReactMarkdown>{guidelines}</ReactMarkdown>
                            ) : (
                                <span className="text-muted-foreground italic">
                                    {t("guidelinesDialog.noGuidelines")}
                                </span>
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter className="mt-4 gap-2 flex-wrap">
                    {!readOnly && isEditing ? (
                        <>
                            <Button variant="outline" onClick={() => setIsEditing(false)}>
                                {t("common.cancel")}
                            </Button>
                            <Button onClick={handleSave}>
                                <Save className="w-4 h-4 mr-2" />
                                {t("guidelinesDialog.saveGuidelines")}
                            </Button>
                        </>
                    ) : (
                        <>
                            {readOnly && settingsPath && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => { onClose(); navigate(settingsPath); }}
                                >
                                    <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                                    {t("guidelinesDialog.editInSettings")}
                                </Button>
                            )}
                            <Button variant="secondary" onClick={onClose}>
                                {t("common.close")}
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
