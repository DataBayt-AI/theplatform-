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
import { Plus, FolderOpen, Trash2, Clock, BarChart3, MoreVertical, Target } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { formatDistanceToNow } from "date-fns";
import { UserMenu } from "@/components/UserMenu";
import { useAuth } from "@/contexts/AuthContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

const Dashboard = () => {
    const navigate = useNavigate();
    const { currentUser, users, createUser, getUserById } = useAuth();
    const [projects, setProjects] = useState<Project[]>([]);
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [newProjectName, setNewProjectName] = useState("");
    const [newProjectDesc, setNewProjectDesc] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [accessProject, setAccessProject] = useState<Project | null>(null);
    const [selectedManagerId, setSelectedManagerId] = useState<string | null>(null);
    const [selectedAnnotators, setSelectedAnnotators] = useState<string[]>([]);
    const [showUserDialog, setShowUserDialog] = useState(false);
    const [newUsername, setNewUsername] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [newRoles, setNewRoles] = useState<Array<"manager" | "annotator" | "admin">>(["manager"]);
    const [createUserError, setCreateUserError] = useState("");

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
        } finally {
            setIsLoading(false);
        }
    };

    const isAdmin = currentUser?.roles?.includes("admin");

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
        } catch (error) {
            console.error("Failed to create project:", error);
        }
    };

    const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent card click
        if (!isAdmin) return;
        try {
            await projectService.delete(id);
            await loadProjects();
        } catch (error) {
            console.error("Failed to delete project:", error);
        }
    };

    return (
        <div className="min-h-screen bg-background p-8">
            <div className="max-w-6xl mx-auto space-y-8">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center">
                            <Target className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight">DataBayt AI Labeler</h1>
                            <p className="text-muted-foreground">Manage your annotation projects</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {isAdmin && (
                            <Dialog open={showUserDialog} onOpenChange={setShowUserDialog}>
                                <DialogTrigger asChild>
                                    <Button variant="outline" size="sm">Manage Users</Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-lg">
                                    <DialogHeader>
                                        <DialogTitle>User Management</DialogTitle>
                                        <DialogDescription>Create users and assign roles for project access.</DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                            <div className="space-y-1.5 md:col-span-1">
                                                <Label htmlFor="new-user">Username</Label>
                                                <Input id="new-user" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} />
                                            </div>
                                            <div className="space-y-1.5 md:col-span-1">
                                                <Label htmlFor="new-pass">Password</Label>
                                                <Input id="new-pass" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                                            </div>
                                            <div className="space-y-1.5 md:col-span-1">
                                                <Label>Roles</Label>
                                                <div className="space-y-2 border rounded-md p-3">
                                                    <div className="flex items-center gap-2">
                                                        <Checkbox
                                                            id="role-admin"
                                                            checked={newRoles.includes("admin")}
                                                            onCheckedChange={(value) => {
                                                                if (value) {
                                                                    setNewRoles(["admin", "manager", "annotator"]);
                                                                } else {
                                                                    setNewRoles(["manager"]);
                                                                }
                                                            }}
                                                        />
                                                        <Label htmlFor="role-admin" className="text-sm font-normal">admin</Label>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <Checkbox
                                                            id="role-manager"
                                                            checked={newRoles.includes("manager")}
                                                            disabled={newRoles.includes("admin")}
                                                            onCheckedChange={(value) => {
                                                                setNewRoles(prev => {
                                                                    const next = value ? [...new Set([...prev, "manager"])] : prev.filter(r => r !== "manager");
                                                                    return next.length === 0 ? ["manager"] : next;
                                                                });
                                                            }}
                                                        />
                                                        <Label htmlFor="role-manager" className="text-sm font-normal">manager</Label>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <Checkbox
                                                            id="role-annotator"
                                                            checked={newRoles.includes("annotator")}
                                                            disabled={newRoles.includes("admin")}
                                                            onCheckedChange={(value) => {
                                                                setNewRoles(prev => {
                                                                    const next = value ? [...new Set([...prev, "annotator"])] : prev.filter(r => r !== "annotator");
                                                                    return next.length === 0 ? ["annotator"] : next;
                                                                });
                                                            }}
                                                        />
                                                        <Label htmlFor="role-annotator" className="text-sm font-normal">annotator</Label>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        {createUserError && <p className="text-sm text-destructive">{createUserError}</p>}
                                        <div className="flex justify-end">
                                            <Button onClick={handleCreateUser}>Add User</Button>
                                        </div>
                                        <div className="border-t pt-4">
                                            <Label className="text-sm">Existing Users</Label>
                                            <div className="mt-2 space-y-2">
                                                {users.map(user => (
                                                    <div key={user.id} className="flex items-center justify-between text-sm">
                                                        <span>{user.username}</span>
                                                    <span className="text-muted-foreground">{user.roles.join(", ")}</span>
                                                </div>
                                            ))}
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
                </div>

                {/* Projects Grid */}
                {visibleProjects.length === 0 ? (
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
                                            <AlertDialog>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 -mt-1 -mr-2" onClick={(e) => e.stopPropagation()}>
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
                                                            <AlertDialogTrigger asChild>
                                                                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={(e) => e.stopPropagation()}>
                                                                    <Trash2 className="w-4 h-4 mr-2" />
                                                                    Delete Project
                                                                </DropdownMenuItem>
                                                            </AlertDialogTrigger>
                                                        )}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                                <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            This action cannot be undone. This will permanently delete the project
                                                            "{project.name}" and all its annotations.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel onClick={(e) => e.stopPropagation()}>Cancel</AlertDialogCancel>
                                                        <AlertDialogAction
                                                            className="bg-destructive hover:bg-destructive/90"
                                                            onClick={(e) => handleDeleteProject(project.id, e as any)}
                                                        >
                                                            Delete
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
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
                )}
            </div>

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
        </div>
    );
};

export default Dashboard;
