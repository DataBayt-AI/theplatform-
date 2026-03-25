import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { projectService } from "@/services/projectService";
import { Project } from "@/types/data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, FolderOpen, Clock, BarChart3, Settings, Target, Shield, Briefcase, PenTool, Link, Copy, Check, Loader2, HelpCircle, FlaskConical } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { ar as arLocale } from "date-fns/locale";
import { UserMenu } from "@/components/UserMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationBell } from "@/components/NotificationBell";
import { useAuth, type User, type Role } from "@/contexts/AuthContext";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AlertCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useTutorial, hasSeenTutorial } from "@/components/Tutorial/useTutorial";
import { getDashboardSteps, type UserRole } from "@/components/Tutorial/tourSteps";
import { LanguageSwitcherInline } from "@/components/LanguageSwitcher";
import { useLanguage } from "@/contexts/LanguageContext";

const Dashboard = () => {
    const navigate = useNavigate();
    const { toast } = useToast();
    const { t } = useTranslation();
    const { language } = useLanguage();
    const { currentUser, login, users, createUser, getUserById, deleteUser, updateUserRoles, adminResetPassword } = useAuth();
    const [loginUsername, setLoginUsername] = useState("");
    const [loginPassword, setLoginPassword] = useState("");
    const [loginError, setLoginError] = useState("");
    const [loginLoading, setLoginLoading] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoginError("");
        setLoginLoading(true);
        try {
            const ok = await login(loginUsername, loginPassword);
            if (!ok) setLoginError(t("auth.invalidCredentials"));
        } catch {
            setLoginError(t("auth.loginFailed"));
        } finally {
            setLoginLoading(false);
        }
    };
    const [projects, setProjects] = useState<Project[]>([]);
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [newProjectName, setNewProjectName] = useState("");
    const [newProjectDesc, setNewProjectDesc] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [accessProject, setAccessProject] = useState<Project | null>(null);
    const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
    const [selectedManagerId, setSelectedManagerId] = useState<string | null>(null);
    const [selectedAnnotators, setSelectedAnnotators] = useState<string[]>([]);
    const [showUserDialog, setShowUserDialog] = useState(false);
    const [newUsername, setNewUsername] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [newRoles, setNewRoles] = useState<Array<"manager" | "annotator" | "admin">>(["manager"]);
    const [createUserError, setCreateUserError] = useState("");

    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [editUsername, setEditUsername] = useState("");
    const [editRoles, setEditRoles] = useState<Role[]>([]);
    const [resetPassword, setResetPassword] = useState("");

    // Invite link state
    const [inviteLink, setInviteLink] = useState("");
    const [inviteLinkCopied, setInviteLinkCopied] = useState(false);
    const [generatingInvite, setGeneratingInvite] = useState(false);

    const handleUpdateUser = async () => {
        if (!editingUser) return;

        // Update Roles
        const roleResult = await updateUserRoles(editingUser.id, editRoles);
        if (!roleResult.ok) {
            toast({ variant: "destructive", title: "Error", description: roleResult.error });
            return;
        }

        // Reset Password if provided
        if (resetPassword.trim()) {
            const passResult = await adminResetPassword(editingUser.id, resetPassword);
            if (!passResult.ok) {
                toast({ variant: "destructive", title: "Error", description: passResult.error });
                return;
            }
        }

        toast({ title: "Success", description: "User updated successfully" });
        setEditingUser(null);
        setResetPassword("");
    };

    const handleDeleteUser = async (userId: string) => {
        if (!confirm("Are you sure you want to delete this user? This cannot be undone.")) return;
        const result = await deleteUser(userId);
        if (result.ok) {
            toast({ title: "Success", description: "User deleted successfully" });
        } else {
            toast({ variant: "destructive", title: "Error", description: result.error });
        }
    };

    useEffect(() => {
        const init = async () => {
            await projectService.initialize();
            if (currentUser) loadProjects();
            else setProjects([]);
        };
        init();
    }, [currentUser?.id]); // reload when user logs in or out

    const loadProjects = async () => {
        setIsLoading(true);
        try {
            const loadedProjects = await projectService.getAll();
            setProjects(loadedProjects);
        } catch (error) {
            console.error("Failed to load projects:", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "Failed to load projects. Please try refreshing.",
            });
        } finally {
            setIsLoading(false);
        }
    };

    const isAdmin = currentUser?.roles?.includes("admin");
    const isManager = currentUser?.roles?.includes("manager") || isAdmin;

    const tutorialSteps = useMemo(() => {
        if (!currentUser) return [];
        return getDashboardSteps(currentUser.roles as UserRole[]);
    }, [currentUser]);

    const { startTour } = useTutorial({
        userId: currentUser?.id ?? "guest",
        steps: tutorialSteps,
    });

    useEffect(() => {
        if (!currentUser || isLoading) return;
        if (currentUser.mustChangePassword) return; // wait until password is changed
        if (!hasSeenTutorial(currentUser.id)) {
            const timer = setTimeout(() => startTour(), 600);
            return () => clearTimeout(timer);
        }
    }, [currentUser, isLoading]);

    const visibleProjects = useMemo(() => {
        if (!currentUser) return [];
        if (currentUser.roles.includes("admin")) return projects;
        if (currentUser.roles.includes("manager")) {
            return projects.filter(p => p.managerId === currentUser.id);
        }
        if (currentUser.roles.includes("annotator")) {
            return projects.filter(p => (p.annotatorIds || []).includes(currentUser.id));
        }
        return [];
    }, [projects, currentUser]);

    const managerUsers = users.filter(u => u.roles.includes("manager"));
    const annotatorUsers = users.filter(u => u.roles.includes("annotator"));

    const openAccessDialog = (project: Project) => {
        setAccessProject(project);
        setSelectedManagerId(project.managerId ?? null);
        setSelectedAnnotators(project.annotatorIds ?? []);
    };

    const canManageAccess = (project: Project) => {
        if (!currentUser) return false;
        if (currentUser.roles.includes("admin")) return true;
        return currentUser.roles.includes("manager") && project.managerId === currentUser.id;
    };

    const handleSaveAccess = async () => {
        if (!accessProject || !currentUser) return;
        const isProjectManager = currentUser.roles.includes("manager") && accessProject.managerId === currentUser.id;
        const managerIdToSave = isAdmin ? selectedManagerId : accessProject.managerId ?? null;
        const annotatorsToSave = isAdmin || isProjectManager ? selectedAnnotators : accessProject.annotatorIds ?? [];
        try {
            await projectService.updateAccess(accessProject.id, {
                managerId: managerIdToSave,
                annotatorIds: annotatorsToSave
            });
            await projectService.appendAuditLog(accessProject.id, {
                actorId: currentUser.id,
                actorName: currentUser.username,
                action: "assign",
                details: `Manager: ${managerIdToSave || "unassigned"}, Annotators: ${annotatorsToSave.length}`
            });
            setAccessProject(null);
            await loadProjects();
            toast({
                title: "Success",
                description: "Project access updated successfully.",
            });
        } catch (error) {
            console.error("Failed to update access:", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "Failed to update project access.",
            });
        }
    };

    const handleCreateUser = async () => {
        if (!isAdmin) return;
        const result = await createUser(newUsername, newPassword, newRoles);
        if (!result.ok) {
            setCreateUserError(result.error || "Failed to create user");
            return;
        }
        setCreateUserError("");
        setNewUsername("");
        setNewPassword("");
        setNewRoles(["manager"]);
        toast({
            title: "Success",
            description: "User created successfully.",
        });
    };

    const handleCreateProject = async () => {
        if (!isAdmin) return;
        if (!newProjectName.trim()) return;

        try {
            // Set current user as manager so they have full access
            const project = await projectService.create(newProjectName, newProjectDesc, currentUser?.id, {
                enabled: false,
                portionPercent: 0,
                annotatorsPerIAAItem: 2
            });
            await loadProjects();
            setIsCreateDialogOpen(false);
            setNewProjectName("");
            setNewProjectDesc("");
            navigate(`/project/${project.id}`);
            toast({
                title: "Success",
                description: "Project created successfully.",
            });
        } catch (error) {
            console.error("Failed to create project:", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "Failed to create project.",
            });
        }
    };

    const handleDeleteProject = async (id: string) => {
        if (!isAdmin) return;
        try {
            console.log("Attempting to delete project:", id);
            await projectService.delete(id);
            setProjectToDelete(null);
            await loadProjects();
            toast({
                title: "Success",
                description: "Project deleted successfully.",
            });
        } catch (error) {
            console.error("Failed to delete project:", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "Failed to delete project. Check console for details.",
            });
        }
    };

    if (!currentUser) return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
            <Card className="w-full max-w-sm">
                <CardHeader className="text-center">
                    <div className="mx-auto w-12 h-12 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center mb-2">
                        <img src="/favicon.svg" alt="DataBayt.AI Logo" className="w-6 h-6 invert brightness-0" />
                    </div>
                    <CardTitle className="text-2xl">DataBayt.AI Studio</CardTitle>
                    <CardDescription>{t("auth.loginSubtitle")}</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleLogin} className="space-y-4">
                        {loginError && (
                            <Alert variant="destructive">
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription>{loginError}</AlertDescription>
                            </Alert>
                        )}
                        <div className="space-y-2">
                            <Label htmlFor="login-username">{t("auth.usernameLabel")}</Label>
                            <Input
                                id="login-username"
                                type="text"
                                placeholder={t("auth.usernameLabel")}
                                value={loginUsername}
                                onChange={(e) => setLoginUsername(e.target.value)}
                                disabled={loginLoading}
                                autoFocus
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="login-password">{t("auth.passwordLabel")}</Label>
                            <Input
                                id="login-password"
                                type="password"
                                placeholder={t("auth.passwordLabel")}
                                value={loginPassword}
                                onChange={(e) => setLoginPassword(e.target.value)}
                                disabled={loginLoading}
                            />
                        </div>
                        <Button type="submit" className="w-full" disabled={loginLoading}>
                            {loginLoading
                                ? <><Loader2 className="me-2 h-4 w-4 animate-spin" />{t("auth.loggingIn")}</>
                                : t("auth.loginButton")}
                        </Button>
                    </form>
                    {/* Language switcher on the login screen */}
                    <div className="mt-4 flex justify-center gap-2 text-sm text-muted-foreground">
                        <LanguageSwitcherInline />
                    </div>
                </CardContent>
            </Card>
        </div>
    );

    return (
        <div className="min-h-screen bg-background p-8">
            <div className="max-w-6xl mx-auto space-y-8">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center">
                            <img src="/favicon.svg" alt="DataBayt.AI Logo" className="w-6 h-6 invert brightness-0" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight">DataBayt.AI Studio</h1>
                            <p className="text-muted-foreground">{t("dashboard.manageProjects")}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {isManager && (
                            <Button id="tutorial-model-management" variant="outline" size="sm" onClick={() => navigate("/model-management")}>
                                {t("nav.modelManagement")}
                            </Button>
                        )}
                        {isAdmin && (
                            <Dialog open={showUserDialog} onOpenChange={setShowUserDialog}>
                                <DialogTrigger asChild>
                                    <Button id="tutorial-manage-users" variant="outline" size="sm">{t("dashboard.userManagement")}</Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                                    <DialogHeader>
                                        <DialogTitle>{t("dashboard.userManagement")}</DialogTitle>
                                        <DialogDescription>{t("dashboard.userManagementDesc")}</DialogDescription>
                                    </DialogHeader>

                                    <div className="space-y-6">
                                        {/* Create User Section */}
                                        <div className="space-y-3 p-4 bg-muted/20 rounded-lg border">
                                            <h3 className="font-semibold text-sm">{t("dashboard.createNewUser")}</h3>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                <div className="space-y-1.5">
                                                    <Label htmlFor="new-user">{t("common.username")}</Label>
                                                    <Input id="new-user" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="jdoe" />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label htmlFor="new-pass">{t("common.password")}</Label>
                                                    <Input id="new-pass" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="******" />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label>{t("dashboard.role")}</Label>
                                                    <div className="flex flex-wrap gap-2">
                                                        {[
                                                            { id: "manager", label: t("dashboard.roles.manager"), icon: Briefcase },
                                                            { id: "annotator", label: t("dashboard.roles.annotator"), icon: PenTool },
                                                            { id: "admin", label: t("dashboard.roles.admin"), icon: Shield }
                                                        ].map(({ id, label, icon: Icon }) => {
                                                            const isSelected = id === "admin" ? newRoles.includes("admin") : newRoles.includes(id as Role);
                                                            const isDisabled = newRoles.includes("admin") && id !== "admin";

                                                            return (
                                                                <div
                                                                    key={id}
                                                                    onClick={() => {
                                                                        if (isDisabled) return;
                                                                        if (id === "admin") {
                                                                            // Toggle Admin: if turning on, set all; if off, revert to manager
                                                                            setNewRoles(isSelected ? ["manager"] : ["admin", "manager", "annotator"]);
                                                                        } else {
                                                                            setNewRoles((prev) => {
                                                                                const r = id as "manager" | "annotator" | "admin";
                                                                                // If currently selected, remove it. If not, add it.
                                                                                const next = isSelected
                                                                                    ? prev.filter(p => p !== r)
                                                                                    : [...prev, r];
                                                                                // Prevent empty roles
                                                                                return next.length === 0 ? ["manager"] : next;
                                                                            });
                                                                        }
                                                                    }}
                                                                    className={`
                                                                        flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer transition-all select-none
                                                                        ${isSelected ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted text-muted-foreground"}
                                                                        ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}
                                                                    `}
                                                                >
                                                                    <Icon className="w-4 h-4" />
                                                                    <span className="text-sm font-medium">{label}</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                            {createUserError && <p className="text-sm text-destructive">{createUserError}</p>}
                                            <div className="flex justify-end">
                                                <Button size="sm" onClick={handleCreateUser}>{t("dashboard.newUser")}</Button>
                                            </div>
                                        </div>

                                        {/* Invite Link Section */}
                                        <div className="space-y-3 p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                                            <div className="flex items-center gap-2">
                                                <Link className="h-4 w-4 text-blue-600" />
                                                <h3 className="font-semibold text-sm">{t("dashboard.inviteLink")}</h3>
                                            </div>
                                            <p className="text-sm text-muted-foreground">
                                                {t("dashboard.inviteLinkDesc")}
                                            </p>
                                            {inviteLink ? (
                                                <div className="flex gap-2">
                                                    <Input
                                                        value={inviteLink}
                                                        readOnly
                                                        className="text-sm bg-white dark:bg-background"
                                                    />
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(inviteLink);
                                                            setInviteLinkCopied(true);
                                                            setTimeout(() => setInviteLinkCopied(false), 2000);
                                                        }}
                                                    >
                                                        {inviteLinkCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                                    </Button>
                                                </div>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={generatingInvite}
                                                    onClick={async () => {
                                                        setGeneratingInvite(true);
                                                        try {
                                                            const { apiClient } = await import('@/services/apiClient');
                                                            const result = await apiClient.invite.create({ roles: ['annotator'] });
                                                            const baseUrl = window.location.origin;
                                                            setInviteLink(`${baseUrl}${result.inviteUrl}`);
                                                        } catch (err) {
                                                            toast({ variant: 'destructive', title: 'Error', description: 'Failed to generate invite link' });
                                                        } finally {
                                                            setGeneratingInvite(false);
                                                        }
                                                    }}
                                                >
                                                    {generatingInvite ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Link className="h-4 w-4 mr-2" />}
                                                    {t("dashboard.generateInviteLink")}
                                                </Button>
                                            )}
                                        </div>

                                        {/* User List Section */}
                                        <div className="space-y-3">
                                            <h3 className="font-semibold text-sm">{t("dashboard.existingUsers")}</h3>
                                            <div className="border rounded-md divide-y">
                                                {users.map(user => {
                                                    const isEditing = editingUser?.id === user.id;
                                                    return (
                                                        <div key={user.id} className="p-3 text-sm">
                                                            {isEditing ? (
                                                                <div className="space-y-3 bg-muted/30 -m-3 p-3">
                                                                    <div className="flex justify-between items-center mb-2">
                                                                        <span className="font-medium">{t("dashboard.editingUser", { username: user.username })}</span>
                                                                    </div>
                                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                        <div className="space-y-1.5">
                                                                            <Label>{t("dashboard.resetPassword")}</Label>
                                                                            <Input
                                                                                type="password"
                                                                                value={resetPassword}
                                                                                onChange={(e) => setResetPassword(e.target.value)}
                                                                                placeholder="New password..."
                                                                            />
                                                                        </div>
                                                                        <div className="space-y-1.5">
                                                                            <Label>{t("dashboard.role")}</Label>
                                                                            <div className="flex flex-wrap gap-2 pt-2">
                                                                                {[
                                                                                    { id: "manager", label: t("dashboard.roles.manager"), icon: Briefcase },
                                                                                    { id: "annotator", label: t("dashboard.roles.annotator"), icon: PenTool },
                                                                                    { id: "admin", label: t("dashboard.roles.admin"), icon: Shield }
                                                                                ].map(({ id, label, icon: Icon }) => {
                                                                                    const isSelected = id === "admin" ? editRoles.includes("admin") : editRoles.includes(id as Role);
                                                                                    const isDisabled = editRoles.includes("admin") && id !== "admin";

                                                                                    return (
                                                                                        <div
                                                                                            key={id}
                                                                                            onClick={() => {
                                                                                                if (isDisabled) return;
                                                                                                if (id === "admin") {
                                                                                                    setEditRoles(isSelected ? ["manager"] : ["admin", "manager", "annotator"]);
                                                                                                } else {
                                                                                                    setEditRoles((prev) => {
                                                                                                        const r = id as Role;
                                                                                                        const next = isSelected
                                                                                                            ? prev.filter(p => p !== r)
                                                                                                            : [...prev, r];
                                                                                                        return next.length === 0 ? ["manager"] : next;
                                                                                                    });
                                                                                                }
                                                                                            }}
                                                                                            className={`
                                                                                                flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer transition-all select-none
                                                                                                ${isSelected ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted text-muted-foreground"}
                                                                                                ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}
                                                                                            `}
                                                                                        >
                                                                                            <Icon className="w-4 h-4" />
                                                                                            <span className="text-sm font-medium">{label}</span>
                                                                                        </div>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex justify-end gap-2 pt-2">
                                                                        <Button variant="ghost" size="sm" onClick={() => setEditingUser(null)}>{t("common.cancel")}</Button>
                                                                        <Button size="sm" onClick={handleUpdateUser}>{t("workspace.saveChanges")}</Button>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <div className="flex items-center justify-between">
                                                                    <div>
                                                                        <div className="font-medium flex items-center gap-2">
                                                                            {user.username}
                                                                            {user.username === "admin" && <span className="text-[10px] bg-primary/20 text-primary px-1 rounded">SUPER</span>}
                                                                        </div>
                                                                        <div className="text-muted-foreground text-xs">{user.roles.map(r => t(`dashboard.roles.${r}`, r)).join(", ")}</div>
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        {user.username !== "admin" && (
                                                                            <>
                                                                                <Button
                                                                                    variant="outline"
                                                                                    size="sm"
                                                                                    className="h-7 text-xs"
                                                                                    onClick={() => {
                                                                                        setEditingUser(user);
                                                                                        setEditRoles(user.roles);
                                                                                        setResetPassword("");
                                                                                    }}
                                                                                >
                                                                                    {t("common.edit")}
                                                                                </Button>
                                                                                <Button
                                                                                    variant="destructive"
                                                                                    size="sm"
                                                                                    className="h-7 text-xs"
                                                                                    onClick={() => handleDeleteUser(user.id)}
                                                                                >
                                                                                    {t("common.delete")}
                                                                                </Button>
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                </DialogContent>
                            </Dialog>
                        )}

                        {isAdmin && (
                            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button id="tutorial-new-project" className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700">
                                        <Plus className="w-4 h-4 mr-2" />
                                        {t("dashboard.newProject")}
                                    </Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>{t("dashboard.createNewProject")}</DialogTitle>
                                        <DialogDescription>
                                            {t("dashboard.createProjectDesc")}
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4 py-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="name">{t("dashboard.projectName")}</Label>
                                            <Input
                                                id="name"
                                                placeholder="e.g., Sentiment Analysis V1"
                                                value={newProjectName}
                                                onChange={(e) => setNewProjectName(e.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="desc">{t("dashboard.descriptionOptional")}</Label>
                                            <Textarea
                                                id="desc"
                                                placeholder="Brief description of the dataset and goals"
                                                value={newProjectDesc}
                                                onChange={(e) => setNewProjectDesc(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>{t("common.cancel")}</Button>
                                        <Button onClick={handleCreateProject} disabled={!newProjectName.trim()}>{t("dashboard.createProject")}</Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        )}

                        <Button
                            id="tutorial-help-btn"
                            variant="ghost"
                            size="icon"
                            onClick={startTour}
                            title="Start tutorial"
                        >
                            <HelpCircle className="w-5 h-5" />
                        </Button>
                        <NotificationBell />
                        <ThemeToggle />
                        <UserMenu />
                    </div>
                </div >

                {/* Projects Grid */}
                {
                    visibleProjects.length === 0 ? (
                        <div className="text-center py-20 border-2 border-dashed rounded-xl bg-muted/30">
                            <FolderOpen className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                            <h2 className="text-xl font-semibold mb-2">{t("dashboard.noProjectsHeading")}</h2>
                            <p className="text-muted-foreground mb-6">
                                {isAdmin ? t("dashboard.noProjectsAdminDesc") : t("dashboard.noProjectsAnnotatorDesc")}
                            </p>
                            {isAdmin && (
                                <Button onClick={() => setIsCreateDialogOpen(true)}>
                                    {t("dashboard.createProject")}
                                </Button>
                            )}
                        </div>
                    ) : (
                        <div id="tutorial-projects-list" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {visibleProjects.map((project, idx) => (
                                <Card
                                    key={project.id}
                                    id={idx === 0 ? "tutorial-open-project" : undefined}
                                    className="group hover:shadow-lg transition-all cursor-pointer border-muted hover:border-primary/50"
                                    onClick={() => navigate(`/project/${project.id}`)}
                                >
                                    <CardHeader className="pb-3">
                                        <div className="flex justify-between items-start">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <CardTitle className="text-xl font-semibold truncate">
                                                    {project.name}
                                                </CardTitle>
                                                {project.isDemo && (
                                                    <Badge variant="secondary" className="shrink-0 gap-1 text-[10px] px-1.5 py-0.5">
                                                        <FlaskConical className="w-3 h-3" />
                                                        {t('dashboard.exampleBadge')}
                                                    </Badge>
                                                )}
                                            </div>
                                            {(isAdmin || canManageAccess(project)) && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 -mt-1 -mr-2"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        navigate(`/projects/${project.id}/settings`);
                                                    }}
                                                >
                                                    <Settings className="w-4 h-4" />
                                                </Button>
                                            )}
                                        </div>
                                        <CardDescription className="line-clamp-2 min-h-[2.5em]">
                                            {project.description || t("dashboard.noDescription")}
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="pb-3">
                                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                            <div className="flex items-center gap-1">
                                                <FolderOpen className="w-4 h-4" />
                                                <span>{project.totalDataPoints ?? project.dataPoints.length} {t("dashboard.items")}</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <BarChart3 className="w-4 h-4" />
                                                <span>{Math.round((project.stats.totalAccepted + project.stats.totalEdited) / ((project.totalDataPoints ?? project.dataPoints.length) || 1) * 100)}% {t("dashboard.done")}</span>
                                            </div>
                                        </div>
                                        <div className="mt-2 text-xs text-muted-foreground">
                                            {t("dashboard.manager")} {getUserById(project.managerId)?.username || t("dashboard.unassigned")}
                                        </div>
                                    </CardContent>
                                    <CardFooter className="pt-3 border-t bg-muted/20 text-xs text-muted-foreground flex justify-between">
                                        <div className="flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            <span>{t("dashboard.updatedAgo", { time: formatDistanceToNow(project.updatedAt, { locale: language === "ar" ? arLocale : undefined }) })}</span>
                                        </div>
                                    </CardFooter>
                                </Card>
                            ))}
                        </div>
                    )
                }
            </div >

            <Dialog open={!!accessProject} onOpenChange={(open) => !open && setAccessProject(null)}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{t("dashboard.projectAccess")}</DialogTitle>
                        <DialogDescription>
                            {t("dashboard.projectAccessDesc")}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        {isAdmin && (
                            <div className="space-y-2">
                                <Label>{t("projectSettings.manager")}</Label>
                                <Select
                                    value={selectedManagerId ?? "unassigned"}
                                    onValueChange={(value) => setSelectedManagerId(value === "unassigned" ? null : value)}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder={t("dashboard.selectManager")} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="unassigned">{t("dashboard.unassigned")}</SelectItem>
                                        {managerUsers.map(user => (
                                            <SelectItem key={user.id} value={user.id}>{user.username}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label>{t("dashboard.annotators")}</Label>
                            <div className="space-y-2 border rounded-md p-3 max-h-48 overflow-y-auto">
                                {annotatorUsers.length === 0 && (
                                    <p className="text-xs text-muted-foreground">{t("dashboard.noAnnotatorsAvailable")}</p>
                                )}
                                {annotatorUsers.map(user => {
                                    const checked = selectedAnnotators.includes(user.id);
                                    return (
                                        <div key={user.id} className="flex items-center gap-2">
                                            <Checkbox
                                                id={`annotator-${user.id}`}
                                                checked={checked}
                                                onCheckedChange={(value) => {
                                                    if (value) {
                                                        setSelectedAnnotators(prev => [...prev, user.id]);
                                                    } else {
                                                        setSelectedAnnotators(prev => prev.filter(id => id !== user.id));
                                                    }
                                                }}
                                            />
                                            <Label htmlFor={`annotator-${user.id}`} className="text-sm font-normal">
                                                {user.username}
                                            </Label>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setAccessProject(null)}>{t("common.cancel")}</Button>
                        <Button onClick={handleSaveAccess}>{t("common.save")}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!projectToDelete} onOpenChange={(open) => !open && setProjectToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("dashboard.areYouSure")}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t("dashboard.confirmDeleteDescription")}
                            {projectToDelete && ` "${projectToDelete.name}"`}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive hover:bg-destructive/90"
                            onClick={() => {
                                if (projectToDelete) {
                                    handleDeleteProject(projectToDelete.id);
                                }
                            }}
                        >
                            {t("common.delete")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div >
    );
};

export default Dashboard;
