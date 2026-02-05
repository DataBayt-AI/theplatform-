import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { projectService } from "@/services/projectService";
import { Project } from "@/types/data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, FolderOpen, Trash2, Clock, BarChart3, MoreVertical, Target, Shield, Briefcase, PenTool } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { UserMenu } from "@/components/UserMenu";
import { useAuth, type User, type Role } from "@/contexts/AuthContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

const Dashboard = () => {
    const navigate = useNavigate();
    const { toast } = useToast();
    const { currentUser, users, createUser, getUserById, deleteUser, updateUserRoles, adminResetPassword } = useAuth();
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

    const handleUpdateUser = () => {
        if (!editingUser) return;

        // Update Roles
        const roleResult = updateUserRoles(editingUser.id, editRoles);
        if (!roleResult.ok) {
            toast({ variant: "destructive", title: "Error", description: roleResult.error });
            return;
        }

        // Reset Password if provided
        if (resetPassword.trim()) {
            const passResult = adminResetPassword(editingUser.id, resetPassword);
            if (!passResult.ok) {
                toast({ variant: "destructive", title: "Error", description: passResult.error });
                return;
            }
        }

        toast({ title: "Success", description: "User updated successfully" });
        setEditingUser(null);
        setResetPassword("");
    };

    const handleDeleteUser = (userId: string) => {
        if (!confirm("Are you sure you want to delete this user? This cannot be undone.")) return;
        const result = deleteUser(userId);
        if (result.ok) {
            toast({ title: "Success", description: "User deleted successfully" });
        } else {
            toast({ variant: "destructive", title: "Error", description: result.error });
        }
    };

    useEffect(() => {
        const init = async () => {
            await projectService.initialize();
            loadProjects();
        };
        init();
    }, []);

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

    const handleCreateUser = () => {
        if (!isAdmin) return;
        const result = createUser(newUsername, newPassword, newRoles);
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
            const project = await projectService.create(newProjectName, newProjectDesc);
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
                            <p className="text-muted-foreground">Manage your annotation projects</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {isManager && (
                            <Button variant="outline" size="sm" onClick={() => navigate("/model-management")}>
                                Model Management
                            </Button>
                        )}
                        {isAdmin && (
                            <Dialog open={showUserDialog} onOpenChange={setShowUserDialog}>
                                <DialogTrigger asChild>
                                    <Button variant="outline" size="sm">Manage Users</Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                                    <DialogHeader>
                                        <DialogTitle>User Management</DialogTitle>
                                        <DialogDescription>Create, edit, or remove system users.</DialogDescription>
                                    </DialogHeader>

                                    <div className="space-y-6">
                                        {/* Create User Section */}
                                        <div className="space-y-3 p-4 bg-muted/20 rounded-lg border">
                                            <h3 className="font-semibold text-sm">Create New User</h3>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                <div className="space-y-1.5">
                                                    <Label htmlFor="new-user">Username</Label>
                                                    <Input id="new-user" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="jdoe" />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label htmlFor="new-pass">Password</Label>
                                                    <Input id="new-pass" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="******" />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label>Roles</Label>
                                                    <div className="flex flex-wrap gap-2">
                                                        {[
                                                            { id: "manager", label: "Manager", icon: Briefcase },
                                                            { id: "annotator", label: "Annotator", icon: PenTool },
                                                            { id: "admin", label: "Admin", icon: Shield }
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
                                                <Button size="sm" onClick={handleCreateUser}>Create User</Button>
                                            </div>
                                        </div>

                                        {/* User List Section */}
                                        <div className="space-y-3">
                                            <h3 className="font-semibold text-sm">Existing Users</h3>
                                            <div className="border rounded-md divide-y">
                                                {users.map(user => {
                                                    const isEditing = editingUser?.id === user.id;
                                                    return (
                                                        <div key={user.id} className="p-3 text-sm">
                                                            {isEditing ? (
                                                                <div className="space-y-3 bg-muted/30 -m-3 p-3">
                                                                    <div className="flex justify-between items-center mb-2">
                                                                        <span className="font-medium">Editing: {user.username}</span>
                                                                    </div>
                                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                        <div className="space-y-1.5">
                                                                            <Label>Reset Password (Optional)</Label>
                                                                            <Input
                                                                                type="password"
                                                                                value={resetPassword}
                                                                                onChange={(e) => setResetPassword(e.target.value)}
                                                                                placeholder="New password..."
                                                                            />
                                                                        </div>
                                                                        <div className="space-y-1.5">
                                                                            <Label>Roles</Label>
                                                                            <div className="flex flex-wrap gap-2 pt-2">
                                                                                {[
                                                                                    { id: "manager", label: "Manager", icon: Briefcase },
                                                                                    { id: "annotator", label: "Annotator", icon: PenTool },
                                                                                    { id: "admin", label: "Admin", icon: Shield }
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
                                                                        <Button variant="ghost" size="sm" onClick={() => setEditingUser(null)}>Cancel</Button>
                                                                        <Button size="sm" onClick={handleUpdateUser}>Save Changes</Button>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <div className="flex items-center justify-between">
                                                                    <div>
                                                                        <div className="font-medium flex items-center gap-2">
                                                                            {user.username}
                                                                            {user.username === "admin" && <span className="text-[10px] bg-primary/20 text-primary px-1 rounded">SUPER</span>}
                                                                        </div>
                                                                        <div className="text-muted-foreground text-xs">{user.roles.join(", ")}</div>
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
                                                                                    Edit
                                                                                </Button>
                                                                                <Button
                                                                                    variant="destructive"
                                                                                    size="sm"
                                                                                    className="h-7 text-xs"
                                                                                    onClick={() => handleDeleteUser(user.id)}
                                                                                >
                                                                                    Delete
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
                                    <Button className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700">
                                        <Plus className="w-4 h-4 mr-2" />
                                        New Project
                                    </Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Create New Project</DialogTitle>
                                        <DialogDescription>
                                            Start a new data labeling project. You can upload data later.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4 py-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="name">Project Name</Label>
                                            <Input
                                                id="name"
                                                placeholder="e.g., Sentiment Analysis V1"
                                                value={newProjectName}
                                                onChange={(e) => setNewProjectName(e.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="desc">Description (Optional)</Label>
                                            <Textarea
                                                id="desc"
                                                placeholder="Brief description of the dataset and goals"
                                                value={newProjectDesc}
                                                onChange={(e) => setNewProjectDesc(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>Cancel</Button>
                                        <Button onClick={handleCreateProject} disabled={!newProjectName.trim()}>Create Project</Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        )}

                        <UserMenu />
                    </div>
                </div >

                {/* Projects Grid */}
                {
                    visibleProjects.length === 0 ? (
                        <div className="text-center py-20 border-2 border-dashed rounded-xl bg-muted/30">
                            <FolderOpen className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                            <h2 className="text-xl font-semibold mb-2">No projects yet</h2>
                            <p className="text-muted-foreground mb-6">
                                {isAdmin ? "Create your first project to start labeling data" : "You are not assigned to any projects yet"}
                            </p>
                            {isAdmin && (
                                <Button onClick={() => setIsCreateDialogOpen(true)}>
                                    Create Project
                                </Button>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {visibleProjects.map((project) => (
                                <Card
                                    key={project.id}
                                    className="group hover:shadow-lg transition-all cursor-pointer border-muted hover:border-primary/50"
                                    onClick={() => navigate(`/project/${project.id}`)}
                                >
                                    <CardHeader className="pb-3">
                                        <div className="flex justify-between items-start">
                                            <CardTitle className="text-xl font-semibold truncate pr-2">
                                                {project.name}
                                            </CardTitle>
                                            {(isAdmin || canManageAccess(project)) && (
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 -mt-1 -mr-2"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                e.preventDefault(); // Also prevent default to be safe
                                                            }}
                                                        >
                                                            <MoreVertical className="w-4 h-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={(e) => {
                                                            e.stopPropagation();
                                                            openAccessDialog(project);
                                                        }}>
                                                            Manage Access
                                                        </DropdownMenuItem>
                                                        {isAdmin && (
                                                            <DropdownMenuItem
                                                                className="text-destructive focus:text-destructive"
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    console.log("Delete project requested:", project.id);
                                                                    setProjectToDelete(project);
                                                                }}
                                                            >
                                                                <Trash2 className="w-4 h-4 mr-2" />
                                                                Delete Project
                                                            </DropdownMenuItem>
                                                        )}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            )}
                                        </div>
                                        <CardDescription className="line-clamp-2 min-h-[2.5em]">
                                            {project.description || "No description"}
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="pb-3">
                                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                            <div className="flex items-center gap-1">
                                                <FolderOpen className="w-4 h-4" />
                                                <span>{project.dataPoints.length} items</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <BarChart3 className="w-4 h-4" />
                                                <span>{Math.round((project.stats.totalAccepted + project.stats.totalEdited) / (project.dataPoints.length || 1) * 100)}% done</span>
                                            </div>
                                        </div>
                                        <div className="mt-2 text-xs text-muted-foreground">
                                            Manager: {getUserById(project.managerId)?.username || "Unassigned"}
                                        </div>
                                    </CardContent>
                                    <CardFooter className="pt-3 border-t bg-muted/20 text-xs text-muted-foreground flex justify-between">
                                        <div className="flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            <span>Updated {formatDistanceToNow(project.updatedAt)} ago</span>
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
                        <DialogTitle>Project Access</DialogTitle>
                        <DialogDescription>
                            Assign a manager and annotators for this project.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        {isAdmin && (
                            <div className="space-y-2">
                                <Label>Manager</Label>
                                <Select
                                    value={selectedManagerId ?? "unassigned"}
                                    onValueChange={(value) => setSelectedManagerId(value === "unassigned" ? null : value)}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a manager" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="unassigned">Unassigned</SelectItem>
                                        {managerUsers.map(user => (
                                            <SelectItem key={user.id} value={user.id}>{user.username}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label>Annotators</Label>
                            <div className="space-y-2 border rounded-md p-3 max-h-48 overflow-y-auto">
                                {annotatorUsers.length === 0 && (
                                    <p className="text-xs text-muted-foreground">No annotators available</p>
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
                        <Button variant="outline" onClick={() => setAccessProject(null)}>Cancel</Button>
                        <Button onClick={handleSaveAccess}>Save</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!projectToDelete} onOpenChange={(open) => !open && setProjectToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the project
                            {projectToDelete && ` "${projectToDelete.name}"`} and all its annotations.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive hover:bg-destructive/90"
                            onClick={() => {
                                if (projectToDelete) {
                                    handleDeleteProject(projectToDelete.id);
                                }
                            }}
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div >
    );
};

export default Dashboard;
