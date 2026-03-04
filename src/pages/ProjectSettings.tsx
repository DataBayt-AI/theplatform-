import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ExternalLink, Trash2, Save, Upload, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { projectService } from "@/services/projectService";
import { parseAnnotationConfigXML } from "@/services/xmlConfigService";
import apiClient from "@/services/apiClient";
import { toast } from "@/components/ui/use-toast";
import type { Project } from "@/types/data";

export default function ProjectSettings() {
    const { projectId } = useParams<{ projectId: string }>();
    const navigate = useNavigate();
    const { currentUser } = useAuth();

    const [project, setProject] = useState<Project | null>(null);
    const [allUsers, setAllUsers] = useState<{ id: string; username: string; roles: string[] }[]>([]);
    const [loading, setLoading] = useState(true);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // Section state — mirrors project fields
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [managerId, setManagerId] = useState<string | null>(null);
    const [annotatorIds, setAnnotatorIds] = useState<string[]>([]);
    const [guidelines, setGuidelines] = useState("");
    const [xmlConfig, setXmlConfig] = useState("");
    const [xmlError, setXmlError] = useState("");
    const [iaaEnabled, setIaaEnabled] = useState(false);
    const [iaaPortion, setIaaPortion] = useState(20);
    const [iaaAnnotatorsPerItem, setIaaAnnotatorsPerItem] = useState(2);

    const xmlFileRef = useRef<HTMLInputElement>(null);

    const isAdmin = currentUser?.roles?.includes("admin");

    // ── Load data ────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!projectId) return;
        Promise.all([
            projectService.getById(projectId),
            apiClient.users.getAll(),
        ]).then(([proj, users]) => {
            if (!proj) { navigate("/"); return; }

            const userIsAdmin = currentUser?.roles?.includes("admin");
            const userIsManager = proj.managerId === currentUser?.id;
            if (!userIsAdmin && !userIsManager) { navigate("/"); return; }

            setProject(proj);
            setAllUsers(users);
            setName(proj.name);
            setDescription(proj.description || "");
            setManagerId(proj.managerId ?? null);
            setAnnotatorIds(proj.annotatorIds ?? []);
            setGuidelines(proj.guidelines || "");
            setXmlConfig(proj.xmlConfig || "");
            setIaaEnabled(proj.iaaConfig?.enabled ?? false);
            setIaaPortion(proj.iaaConfig?.portionPercent ?? 20);
            setIaaAnnotatorsPerItem(proj.iaaConfig?.annotatorsPerIAAItem ?? 2);
        }).finally(() => setLoading(false));
    }, [projectId, currentUser, navigate]);

    // ── Save helpers ─────────────────────────────────────────────────────────
    const saveGeneral = async () => {
        if (!project) return;
        try {
            await projectService.update({ ...project, name, description });
            setProject(p => p ? { ...p, name, description } : p);
            toast({ title: "Saved", description: "Project details updated." });
        } catch {
            toast({ title: "Error", description: "Failed to save.", variant: "destructive" });
        }
    };

    const saveTeam = async () => {
        if (!project) return;
        try {
            await projectService.updateAccess(project.id, {
                managerId: isAdmin ? managerId : project.managerId,
                annotatorIds,
            });
            setProject(p => p ? { ...p, managerId: isAdmin ? managerId : p.managerId, annotatorIds } : p);
            toast({ title: "Saved", description: "Team updated." });
        } catch {
            toast({ title: "Error", description: "Failed to save team.", variant: "destructive" });
        }
    };

    const saveGuidelines = async () => {
        if (!project) return;
        try {
            await projectService.update({ ...project, guidelines });
            setProject(p => p ? { ...p, guidelines } : p);
            toast({ title: "Saved", description: "Guidelines updated." });
        } catch {
            toast({ title: "Error", description: "Failed to save guidelines.", variant: "destructive" });
        }
    };

    const saveXmlConfig = async () => {
        if (!project) return;
        setXmlError("");
        if (xmlConfig.trim()) {
            try {
                parseAnnotationConfigXML(xmlConfig);
            } catch (err) {
                setXmlError(`Invalid XML: ${err instanceof Error ? err.message : "Parse error"}`);
                return;
            }
        }
        try {
            await projectService.update({ ...project, xmlConfig });
            setProject(p => p ? { ...p, xmlConfig } : p);
            toast({ title: "Saved", description: "Annotation form updated." });
        } catch {
            toast({ title: "Error", description: "Failed to save XML.", variant: "destructive" });
        }
    };

    const handleXmlFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const text = await file.text();
        setXmlConfig(text);
        setXmlError("");
        e.target.value = "";
    };

    const saveIaa = async () => {
        if (!project) return;
        try {
            const iaaConfig = { enabled: iaaEnabled, portionPercent: iaaPortion, annotatorsPerIAAItem: iaaAnnotatorsPerItem };
            await projectService.update({ ...project, iaaConfig });
            setProject(p => p ? { ...p, iaaConfig } : p);
            toast({ title: "Saved", description: "IAA configuration updated." });
        } catch {
            toast({ title: "Error", description: "Failed to save IAA config.", variant: "destructive" });
        }
    };

    const deleteProject = async () => {
        if (!project) return;
        try {
            await projectService.delete(project.id);
            navigate("/");
        } catch {
            toast({ title: "Error", description: "Failed to delete project.", variant: "destructive" });
        }
    };

    const toggleAnnotator = (userId: string) => {
        setAnnotatorIds(prev =>
            prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
        );
    };

    // ── Render ───────────────────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen text-muted-foreground">
                Loading project settings…
            </div>
        );
    }

    if (!project) return null;

    const adminUsers = allUsers.filter(u => u.roles?.includes("admin") || u.roles?.includes("manager"));
    const annotatorUsers = allUsers.filter(u => u.roles?.includes("annotator"));

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="max-w-3xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
                            <ArrowLeft className="w-4 h-4 mr-1.5" />
                            Projects
                        </Button>
                        <span className="text-muted-foreground">/</span>
                        <span className="font-semibold truncate">{project.name}</span>
                    </div>
                    <Button size="sm" onClick={() => navigate(`/project/${projectId}`)}>
                        Open Workspace
                        <ExternalLink className="w-4 h-4 ml-1.5" />
                    </Button>
                </div>
            </div>

            <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
                <div>
                    <h1 className="text-2xl font-bold">Project Settings</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Configure this project before annotators start working.
                    </p>
                </div>

                {/* 1 — General */}
                <Card>
                    <CardHeader>
                        <CardTitle>General</CardTitle>
                        <CardDescription>Project name and description.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="proj-name">Project Name</Label>
                            <Input id="proj-name" value={name} onChange={e => setName(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="proj-desc">Description</Label>
                            <Textarea id="proj-desc" value={description} onChange={e => setDescription(e.target.value)} rows={3} />
                        </div>
                        <div className="flex justify-end">
                            <Button size="sm" onClick={saveGeneral} disabled={!name.trim()}>
                                <Save className="w-4 h-4 mr-1.5" />
                                Save
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* 2 — Team */}
                <Card>
                    <CardHeader>
                        <CardTitle>Team</CardTitle>
                        <CardDescription>Assign a manager and select annotators for this project.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        {isAdmin && (
                            <div className="space-y-1.5">
                                <Label>Manager</Label>
                                <Select value={managerId ?? ""} onValueChange={v => setManagerId(v || null)}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select manager…" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {adminUsers.map(u => (
                                            <SelectItem key={u.id} value={u.id}>{u.username}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                        <div className="space-y-1.5">
                            <Label>Annotators</Label>
                            <div className="rounded-md border divide-y max-h-56 overflow-y-auto">
                                {annotatorUsers.length === 0 && (
                                    <p className="text-sm text-muted-foreground p-3">No annotator accounts found.</p>
                                )}
                                {annotatorUsers.map(u => (
                                    <label key={u.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 cursor-pointer">
                                        <Checkbox
                                            checked={annotatorIds.includes(u.id)}
                                            onCheckedChange={() => toggleAnnotator(u.id)}
                                        />
                                        <span className="text-sm">{u.username}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                        <div className="flex justify-end">
                            <Button size="sm" onClick={saveTeam}>
                                <Save className="w-4 h-4 mr-1.5" />
                                Save
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* 3 — Guidelines */}
                <Card>
                    <CardHeader>
                        <CardTitle>Annotation Guidelines</CardTitle>
                        <CardDescription>Instructions shown to annotators. Supports plain text and Markdown.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Textarea
                            value={guidelines}
                            onChange={e => setGuidelines(e.target.value)}
                            rows={12}
                            className="font-mono text-sm"
                            placeholder="# Guidelines&#10;&#10;Describe how annotators should label items..."
                        />
                        <div className="flex justify-end">
                            <Button size="sm" onClick={saveGuidelines}>
                                <Save className="w-4 h-4 mr-1.5" />
                                Save
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* 4 — Annotation Form (XML) */}
                <Card>
                    <CardHeader>
                        <CardTitle>Annotation Form</CardTitle>
                        <CardDescription>
                            XML configuration for the custom annotation form shown to annotators.
                            Leave empty to use the default form.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Textarea
                            value={xmlConfig}
                            onChange={e => { setXmlConfig(e.target.value); setXmlError(""); }}
                            rows={10}
                            className="font-mono text-sm"
                            placeholder="<annotation-config>&#10;  <!-- paste your XML here -->&#10;</annotation-config>"
                        />
                        {xmlError && (
                            <p className="text-sm text-destructive">{xmlError}</p>
                        )}
                        <div className="flex items-center justify-between">
                            <Button variant="outline" size="sm" onClick={() => xmlFileRef.current?.click()}>
                                <Upload className="w-4 h-4 mr-1.5" />
                                Upload XML file
                            </Button>
                            <input
                                ref={xmlFileRef}
                                type="file"
                                accept=".xml"
                                className="hidden"
                                onChange={handleXmlFileUpload}
                            />
                            <Button size="sm" onClick={saveXmlConfig}>
                                <Save className="w-4 h-4 mr-1.5" />
                                Save
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* 5 — IAA */}
                <Card>
                    <CardHeader>
                        <CardTitle>Inter-Annotator Agreement (IAA)</CardTitle>
                        <CardDescription>
                            Assign a random portion of items to multiple annotators to measure consistency.
                            Annotators cannot see that an item is an IAA check.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        <div className="flex items-center gap-3">
                            <Switch checked={iaaEnabled} onCheckedChange={setIaaEnabled} id="iaa-toggle" />
                            <Label htmlFor="iaa-toggle">Enable IAA</Label>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="iaa-portion">IAA Portion (%)</Label>
                                <Input
                                    id="iaa-portion"
                                    type="number"
                                    min={0} max={100}
                                    value={iaaPortion}
                                    onChange={e => setIaaPortion(Number(e.target.value))}
                                    disabled={!iaaEnabled}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="iaa-count">Annotators per IAA Item</Label>
                                <Input
                                    id="iaa-count"
                                    type="number"
                                    min={2} max={10}
                                    value={iaaAnnotatorsPerItem}
                                    onChange={e => setIaaAnnotatorsPerItem(Number(e.target.value))}
                                    disabled={!iaaEnabled}
                                />
                            </div>
                        </div>
                        <div className="flex justify-end">
                            <Button size="sm" onClick={saveIaa}>
                                <Save className="w-4 h-4 mr-1.5" />
                                Save
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* 6 — Danger Zone (admin only) */}
                {isAdmin && (
                    <Card className="border-destructive/40">
                        <CardHeader>
                            <CardTitle className="text-destructive flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5" />
                                Danger Zone
                            </CardTitle>
                            <CardDescription>
                                Irreversible actions. Proceed with caution.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3">
                                <div>
                                    <p className="text-sm font-medium">Delete this project</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        All data points, annotations, and history will be permanently deleted.
                                    </p>
                                </div>
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => setShowDeleteConfirm(true)}
                                >
                                    <Trash2 className="w-4 h-4 mr-1.5" />
                                    Delete
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Delete confirmation dialog */}
            <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete "{project.name}"?</DialogTitle>
                        <DialogDescription>
                            This will permanently delete the project and all its data points, annotations,
                            snapshots, and history. This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={deleteProject}>
                            <Trash2 className="w-4 h-4 mr-1.5" />
                            Delete Project
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
