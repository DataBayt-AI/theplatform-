
import { useState, useEffect } from "react";
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
import { Book, Edit2, Save } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

interface GuidelinesDialogProps {
    project: Project;
    isOpen: boolean;
    onClose: () => void;
    canEdit: boolean;
    onUpdate: (updatedProject: Project) => void;
}

export function GuidelinesDialog({
    project,
    isOpen,
    onClose,
    canEdit,
    onUpdate,
}: GuidelinesDialogProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [guidelines, setGuidelines] = useState(project.guidelines || "");

    useEffect(() => {
        setGuidelines(project.guidelines || "");
    }, [project.guidelines, isOpen]);

    const handleSave = async () => {
        try {
            const updatedProject = { ...project, guidelines };
            await projectService.update(updatedProject);
            onUpdate(updatedProject);
            setIsEditing(false);
            toast({
                title: "Guidelines updated",
                description: "Project annotation guidelines have been saved.",
            });
        } catch (error) {
            console.error("Failed to update guidelines:", error);
            toast({
                title: "Error",
                description: "Failed to save guidelines. Please try again.",
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
                            Annotation Guidelines
                        </DialogTitle>
                        {canEdit && !isEditing && (
                            <Button size="sm" variant="ghost" onClick={() => setIsEditing(true)}>
                                <Edit2 className="w-4 h-4 mr-2" />
                                Edit
                            </Button>
                        )}
                    </div>
                    <DialogDescription>
                        Reference instructions for annotating data in this project.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto min-h-[300px] mt-4 rounded-md border p-4 bg-muted/30">
                    {isEditing ? (
                        <Textarea
                            value={guidelines}
                            onChange={(e) => setGuidelines(e.target.value)}
                            className="min-h-[300px] font-mono text-sm leading-relaxed resize-none border-0 focus-visible:ring-0 bg-transparent p-0"
                            placeholder="Enter comprehensive guidelines for annotators here..."
                        />
                    ) : (
                        <div className="prose dark:prose-invert max-w-none text-sm whitespace-pre-wrap leading-relaxed">
                            {guidelines || (
                                <span className="text-muted-foreground italic">
                                    No guidelines have been set for this project yet.
                                </span>
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter className="mt-4 gap-2">
                    {isEditing ? (
                        <>
                            <Button variant="outline" onClick={() => setIsEditing(false)}>
                                Cancel
                            </Button>
                            <Button onClick={handleSave}>
                                <Save className="w-4 h-4 mr-2" />
                                Save Guidelines
                            </Button>
                        </>
                    ) : (
                        <Button variant="secondary" onClick={onClose}>
                            Close
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
