
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ProjectSnapshot } from "@/types/data";
import { projectService } from "@/services/projectService";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, History, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface VersionHistoryProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    projectId: string;
    onRestore: () => void; // Callback to refresh parent data
}

export function VersionHistory({ open, onOpenChange, projectId, onRestore }: VersionHistoryProps) {
    const { t } = useTranslation();
    const [snapshots, setSnapshots] = useState<ProjectSnapshot[]>([]);
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newVersionName, setNewVersionName] = useState("");

    const loadSnapshots = async () => {
        setLoading(true);
        try {
            const data = await projectService.getSnapshots(projectId);
            setSnapshots(data.sort((a, b) => b.createdAt - a.createdAt));
        } catch (error) {
            console.error(error);
            toast.error(t('versionHistory.errorLoad'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (open) {
            loadSnapshots();
        }
    }, [open, projectId]);

    const handleCreateSnapshot = async () => {
        if (!newVersionName.trim()) return;
        setCreating(true);
        try {
            await projectService.createSnapshot(projectId, newVersionName);
            toast.success(t('versionHistory.successSave'));
            setNewVersionName("");
            loadSnapshots();
        } catch (error) {
            console.error(error);
            toast.error(t('versionHistory.errorSave'));
        } finally {
            setCreating(false);
        }
    };

    const handleRestore = async (snapshot: ProjectSnapshot) => {
        if (!confirm(t('versionHistory.confirmRestore', { name: snapshot.name }))) return;

        try {
            await projectService.restoreSnapshot(snapshot.id);
            toast.success(t('versionHistory.successRestore', { name: snapshot.name }));
            onRestore();
            onOpenChange(false);
        } catch (error) {
            console.error(error);
            toast.error(t('versionHistory.errorRestore'));
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <History className="h-5 w-5" />
                        {t('versionHistory.title')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('versionHistory.description')}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="flex gap-2 items-end">
                        <div className="grid w-full gap-1.5">
                            <Label htmlFor="version-name">{t('versionHistory.newVersionName')}</Label>
                            <Input
                                id="version-name"
                                placeholder={t('versionHistory.namePlaceholder')}
                                value={newVersionName}
                                onChange={(e) => setNewVersionName(e.target.value)}
                            />
                        </div>
                        <Button onClick={handleCreateSnapshot} disabled={creating || !newVersionName.trim()}>
                            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : t('versionHistory.save')}
                        </Button>
                    </div>

                    <div className="border rounded-md">
                        <div className="p-2 bg-muted/50 border-b text-sm font-medium">{t('versionHistory.savedVersions')}</div>
                        <ScrollArea className="h-[300px]">
                            {loading ? (
                                <div className="flex justify-center p-4"><Loader2 className="animate-spin" /></div>
                            ) : snapshots.length === 0 ? (
                                <div className="p-4 text-center text-sm text-muted-foreground">{t('versionHistory.noVersions')}</div>
                            ) : (
                                <div className="space-y-1 p-1">
                                    {snapshots.map((snap) => (
                                        <div key={snap.id} className="flex items-center justify-between p-3 hover:bg-muted/50 rounded-md border border-transparent hover:border-border transition-colors">
                                            <div className="space-y-1">
                                                <p className="font-medium text-sm">{snap.name}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {format(snap.createdAt, "MMM d, yyyy h:mm a")} • {snap.dataPoints.length} items
                                                </p>
                                            </div>
                                            <Button size="sm" variant="outline" onClick={() => handleRestore(snap)}>
                                                <RotateCcw className="h-3 w-3 me-2" />
                                                {t('versionHistory.restore')}
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </ScrollArea>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
