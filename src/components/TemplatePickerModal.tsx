import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Layers, Plus, Trash2, BookOpen } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/use-toast";
import apiClient from "@/services/apiClient";
import { BUILTIN_TEMPLATES } from "@/data/builtinTemplates";
import type { TaskTemplate } from "@/types/data";

interface TemplatePickerModalProps {
    open: boolean;
    onClose: () => void;
    onApply: (xmlConfig: string) => void;
    currentXml?: string;
}

const CATEGORY_COLORS: Record<string, string> = {
    Classification: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    Quality: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
    NER: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
    Safety: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    RLHF: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
    Custom: "bg-muted text-muted-foreground",
};

function CategoryBadge({ category, translated }: { category: string; translated?: string }) {
    const cls = CATEGORY_COLORS[category] ?? CATEGORY_COLORS.Custom;
    return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>{translated ?? category}</span>;
}

export function TemplatePickerModal({ open, onClose, onApply, currentXml }: TemplatePickerModalProps) {
    const { t } = useTranslation();
    const [userTemplates, setUserTemplates] = useState<TaskTemplate[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showSaveForm, setShowSaveForm] = useState(false);
    const [saveName, setSaveName] = useState("");
    const [saveDesc, setSaveDesc] = useState("");
    const [saveCategory, setSaveCategory] = useState("Custom");

    useEffect(() => {
        if (!open) return;
        setLoading(true);
        apiClient.templates.getAll()
            .then(setUserTemplates)
            .catch(() => setUserTemplates([]))
            .finally(() => setLoading(false));
    }, [open]);

    const handleApply = (template: TaskTemplate) => {
        onApply(template.xmlConfig);
        onClose();
        toast({ title: t('templatePicker.toastApplied'), description: t('templatePicker.toastAppliedDesc', { name: template.name }) });
    };

    const handleSave = async () => {
        if (!saveName.trim()) return;
        if (!currentXml?.trim()) {
            toast({ title: t('templatePicker.toastNothingToSave'), description: t('templatePicker.toastEditorEmpty'), variant: "destructive" });
            return;
        }
        setSaving(true);
        try {
            const created = await apiClient.templates.create({
                name: saveName.trim(),
                description: saveDesc.trim() || undefined,
                category: saveCategory || "Custom",
                xmlConfig: currentXml,
            });
            setUserTemplates(prev => [created, ...prev]);
            setSaveName("");
            setSaveDesc("");
            setSaveCategory("Custom");
            setShowSaveForm(false);
            toast({ title: t('templatePicker.toastSaved'), description: t('templatePicker.toastSavedDesc', { name: created.name }) });
        } catch (err) {
            toast({ title: t('templatePicker.toastSaveFailed'), description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (template: TaskTemplate) => {
        try {
            await apiClient.templates.delete(template.id);
            setUserTemplates(prev => prev.filter(t => t.id !== template.id));
            toast({ title: t('templatePicker.toastDeleted') });
        } catch (err) {
            toast({ title: t('templatePicker.toastDeleteFailed'), description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
        }
    };

    return (
        <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
            <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Layers className="w-5 h-5" />
                        {t('templatePicker.title')}
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto space-y-6 pr-1">
                    {/* Built-in templates */}
                    <section>
                        <div className="flex items-center gap-2 mb-3">
                            <BookOpen className="w-4 h-4 text-muted-foreground" />
                            <h3 className="text-sm font-semibold">{t('templatePicker.builtIn')}</h3>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {BUILTIN_TEMPLATES.map(tpl => (
                                <button
                                    key={tpl.id}
                                    onClick={() => handleApply(tpl)}
                                    className="text-start rounded-lg border bg-card p-3 hover:bg-accent hover:border-primary transition-colors group"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <p className="text-sm font-medium leading-snug">{t(`templatePicker.builtinNames.${tpl.id}`, tpl.name)}</p>
                                        <CategoryBadge category={tpl.category} translated={t(`templatePicker.categories.${tpl.category}`, tpl.category)} />
                                    </div>
                                    {tpl.description && (
                                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t(`templatePicker.builtinDescriptions.${tpl.id}`, tpl.description)}</p>
                                    )}
                                </button>
                            ))}
                        </div>
                    </section>

                    {/* User templates */}
                    <section>
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-semibold">{t('templatePicker.yourTemplates')}</h3>
                            {currentXml?.trim() && (
                                <Button variant="outline" size="sm" onClick={() => setShowSaveForm(v => !v)}>
                                    <Plus className="w-3.5 h-3.5 me-1.5" />
                                    {t('templatePicker.saveCurrentForm')}
                                </Button>
                            )}
                        </div>

                        {showSaveForm && (
                            <div className="rounded-lg border bg-muted/40 p-4 space-y-3 mb-3">
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="tpl-name">{t('templatePicker.templateName')}</Label>
                                        <Input
                                            id="tpl-name"
                                            value={saveName}
                                            onChange={e => setSaveName(e.target.value)}
                                            placeholder={t('templatePicker.namePlaceholder')}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="tpl-cat">{t('templatePicker.category')}</Label>
                                        <Input
                                            id="tpl-cat"
                                            value={saveCategory}
                                            onChange={e => setSaveCategory(e.target.value)}
                                            placeholder={t('templatePicker.catPlaceholder')}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="tpl-desc">{t('templatePicker.description')}</Label>
                                    <Input
                                        id="tpl-desc"
                                        value={saveDesc}
                                        onChange={e => setSaveDesc(e.target.value)}
                                        placeholder={t('templatePicker.descPlaceholder')}
                                    />
                                </div>
                                <div className="flex justify-end gap-2">
                                    <Button variant="ghost" size="sm" onClick={() => setShowSaveForm(false)}>{t('common.cancel')}</Button>
                                    <Button size="sm" onClick={handleSave} disabled={saving || !saveName.trim()}>
                                        {saving ? t('templatePicker.saving') : t('templatePicker.saveTemplate')}
                                    </Button>
                                </div>
                            </div>
                        )}

                        {loading ? (
                            <p className="text-sm text-muted-foreground">{t('templatePicker.loading')}</p>
                        ) : userTemplates.length === 0 ? (
                            <p className="text-sm text-muted-foreground italic">
                                {t('templatePicker.noTemplates')}
                            </p>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {userTemplates.map(tpl => (
                                    <div
                                        key={tpl.id}
                                        className="rounded-lg border bg-card p-3 flex items-start justify-between gap-2 group"
                                    >
                                        <button className="text-start flex-1 min-w-0" onClick={() => handleApply(tpl)}>
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-medium truncate">{tpl.name}</p>
                                                <CategoryBadge category={tpl.category} />
                                            </div>
                                            {tpl.description && (
                                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{tpl.description}</p>
                                            )}
                                        </button>
                                        <button
                                            onClick={() => handleDelete(tpl)}
                                            className="text-muted-foreground hover:text-destructive transition-colors shrink-0 mt-0.5"
                                            aria-label={t('templatePicker.deleteTemplate')}
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                </div>

                <Separator />
                <div className="flex justify-end pt-1">
                    <Button variant="outline" size="sm" onClick={onClose}>{t('templatePicker.close')}</Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default TemplatePickerModal;
