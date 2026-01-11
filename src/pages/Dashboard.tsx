import { useState, useEffect } from "react";
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

const Dashboard = () => {
    const navigate = useNavigate();
    const [projects, setProjects] = useState<Project[]>([]);
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [newProjectName, setNewProjectName] = useState("");
    const [newProjectDesc, setNewProjectDesc] = useState("");
    const [isLoading, setIsLoading] = useState(true);

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

    const handleCreateProject = async () => {
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
                </div>

                {/* Projects Grid */}
                {projects.length === 0 ? (
                    <div className="text-center py-20 border-2 border-dashed rounded-xl bg-muted/30">
                        <FolderOpen className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                        <h2 className="text-xl font-semibold mb-2">No projects yet</h2>
                        <p className="text-muted-foreground mb-6">Create your first project to start labeling data</p>
                        <Button onClick={() => setIsCreateDialogOpen(true)}>
                            Create Project
                        </Button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {projects.map((project) => (
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
                                        <AlertDialog>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 -mt-1 -mr-2" onClick={(e) => e.stopPropagation()}>
                                                        <MoreVertical className="w-4 h-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <AlertDialogTrigger asChild>
                                                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={(e) => e.stopPropagation()}>
                                                            <Trash2 className="w-4 h-4 mr-2" />
                                                            Delete Project
                                                        </DropdownMenuItem>
                                                    </AlertDialogTrigger>
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
        </div>
    );
};

export default Dashboard;
