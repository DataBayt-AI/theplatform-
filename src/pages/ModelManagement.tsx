import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { modelManagementService } from "@/services/modelManagementService";
import { projectService } from "@/services/projectService";
import { AVAILABLE_PROVIDERS } from "@/services/aiProviders";
import type { ModelProfile, Project, ProjectModelPolicy, ProviderConnection } from "@/types/data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { UserMenu } from "@/components/UserMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { toast } from "@/components/ui/use-toast";
import { Loader2 } from "lucide-react";

type RuntimeModelOption = {
  id: string;
  name: string;
  description?: string;
};

const ModelManagement = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const isManager = currentUser?.roles?.includes("manager") || currentUser?.roles?.includes("admin");

  const [connections, setConnections] = useState<ProviderConnection[]>([]);
  const [profiles, setProfiles] = useState<ModelProfile[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  const [editingConnectionId, setEditingConnectionId] = useState<string | null>(null);
  const [connectionProviderId, setConnectionProviderId] = useState<string>("");
  const [connectionName, setConnectionName] = useState("");
  const [connectionApiKey, setConnectionApiKey] = useState("");
  const [connectionBaseUrl, setConnectionBaseUrl] = useState("");
  const [connectionIsActive, setConnectionIsActive] = useState(true);

  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [profileConnectionId, setProfileConnectionId] = useState("");
  const [profileModelId, setProfileModelId] = useState("");
  const [profileDisplayName, setProfileDisplayName] = useState("");
  const [profileDefaultPrompt, setProfileDefaultPrompt] = useState("");
  const [profileTemperature, setProfileTemperature] = useState("");
  const [profileMaxTokens, setProfileMaxTokens] = useState("");
  const [profileInputPrice, setProfileInputPrice] = useState("");
  const [profileOutputPrice, setProfileOutputPrice] = useState("");
  const [profileIsActive, setProfileIsActive] = useState(true);

  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [allowedProfiles, setAllowedProfiles] = useState<string[]>([]);
  const [defaultProfiles, setDefaultProfiles] = useState<string[]>([]);
  const [testingProfileId, setTestingProfileId] = useState<string | null>(null);
  const [remoteModelsByConnection, setRemoteModelsByConnection] = useState<Record<string, RuntimeModelOption[]>>({});
  const [isLoadingRemoteModels, setIsLoadingRemoteModels] = useState(false);
  const [remoteModelsError, setRemoteModelsError] = useState<string | null>(null);

  useEffect(() => {
    projectService.initialize().then(async () => {
      const loadedProjects = await projectService.getAll();
      setProjects(loadedProjects);
    });
    setConnections(modelManagementService.getConnections());
    setProfiles(modelManagementService.getProfiles());
  }, []);

  useEffect(() => {
    if (!selectedProjectId) {
      setAllowedProfiles([]);
      setDefaultProfiles([]);
      return;
    }
    const policy = modelManagementService.getProjectPolicy(selectedProjectId);
    setAllowedProfiles(policy?.allowedModelProfileIds ?? []);
    setDefaultProfiles(policy?.defaultModelProfileIds ?? []);
  }, [selectedProjectId]);

  const connectionOptions = useMemo(() => connections.filter(c => c.isActive), [connections]);
  const providerLookup = useMemo(() => new Map(AVAILABLE_PROVIDERS.map(p => [p.id, p])), []);
  const connectionLookup = useMemo(() => new Map(connections.map(c => [c.id, c])), [connections]);
  const selectedProfileConnection = profileConnectionId ? connectionLookup.get(profileConnectionId) : undefined;
  const staticModelsForConnection = selectedProfileConnection
    ? (providerLookup.get(selectedProfileConnection.providerId)?.models ?? [])
    : [];
  const baseModelsForSelectedConnection = selectedProfileConnection
    && (selectedProfileConnection.providerId === "openai"
      || selectedProfileConnection.providerId === "anthropic"
      || selectedProfileConnection.providerId === "openrouter")
    ? (remoteModelsByConnection[selectedProfileConnection.id] ?? [])
    : staticModelsForConnection;
  const modelsForSelectedConnection = useMemo(() => {
    if (!profileModelId) return baseModelsForSelectedConnection;
    const exists = baseModelsForSelectedConnection.some(model => model.id === profileModelId);
    if (exists) return baseModelsForSelectedConnection;
    return [{ id: profileModelId, name: `${profileModelId} (current)` }, ...baseModelsForSelectedConnection];
  }, [baseModelsForSelectedConnection, profileModelId]);

  const profileOptions = useMemo(() => {
    return profiles.filter(profile => profile.isActive);
  }, [profiles]);

  const fetchOfficialModels = useCallback(async (connection: ProviderConnection, force = false) => {
    if (connection.providerId !== "openai"
      && connection.providerId !== "anthropic"
      && connection.providerId !== "openrouter") return;
    if (!connection.apiKey) {
      setRemoteModelsError("API key is required to load official provider models.");
      return;
    }
    if (!force && remoteModelsByConnection[connection.id]?.length) return;

    const endpoint =
      connection.providerId === "openai"
        ? "/api/openai/models"
        : connection.providerId === "anthropic"
          ? "/api/anthropic/models"
          : "/api/openrouter/models";
    setIsLoadingRemoteModels(true);
    setRemoteModelsError(null);
    try {
      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${connection.apiKey}`
        }
      });
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error("API route returned HTML. Start the backend server and verify /api proxy.");
      }
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error?.message || payload?.error || "Failed to load models");
      }
      const list = Array.isArray(payload?.data) ? payload.data : [];
      const mapped: RuntimeModelOption[] = list
        .map((item: unknown) => {
          const record = item as {
            id?: string;
            name?: string;
            display_name?: string;
            architecture?: {
              input_modalities?: string[];
              output_modalities?: string[];
            };
          };
          if (!record.id) return null;
          if (connection.providerId === "openrouter") {
            const inputModalities = record.architecture?.input_modalities || [];
            const outputModalities = record.architecture?.output_modalities || [];
            const textEligible = inputModalities.includes("text") && outputModalities.includes("text");
            if (!textEligible) return null;
          }
          return {
            id: record.id,
            name: record.display_name || record.name || record.id
          };
        })
        .filter((item): item is RuntimeModelOption => !!item);

      setRemoteModelsByConnection(prev => ({ ...prev, [connection.id]: mapped }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load provider models";
      setRemoteModelsError(message);
    } finally {
      setIsLoadingRemoteModels(false);
    }
  }, [remoteModelsByConnection]);

  useEffect(() => {
    if (!profileConnectionId) return;
    const connection = connectionLookup.get(profileConnectionId);
    if (!connection) return;
    if (connection.providerId !== "openai"
      && connection.providerId !== "anthropic"
      && connection.providerId !== "openrouter") {
      setRemoteModelsError(null);
      return;
    }
    fetchOfficialModels(connection, false);
  }, [profileConnectionId, connectionLookup, fetchOfficialModels]);

  useEffect(() => {
    if (editingProfileId) return;
    if (!profileModelId) return;
    const isStillAvailable = modelsForSelectedConnection.some(model => model.id === profileModelId);
    if (!isStillAvailable) {
      setProfileModelId("");
    }
  }, [editingProfileId, profileModelId, modelsForSelectedConnection]);

  const handleTestProfile = async (profile: ModelProfile) => {
    const connection = connectionLookup.get(profile.providerConnectionId);
    if (!connection) {
      toast({ title: "Missing connection", description: "Provider connection not found." });
      return;
    }
    if (!connection.isActive) {
      toast({ title: "Connection inactive", description: "Activate the connection before testing." });
      return;
    }
    if (!profile.isActive) {
      toast({ title: "Profile inactive", description: "Activate the profile before testing." });
      return;
    }
    const providerInfo = providerLookup.get(connection.providerId);
    if (!providerInfo) {
      toast({ title: "Unknown provider", description: "Provider is not available." });
      return;
    }
    if (providerInfo.requiresApiKey && !connection.apiKey) {
      toast({ title: "Missing API key", description: "Add an API key before testing." });
      return;
    }

    try {
      setTestingProfileId(profile.id);
      const { getAIProvider } = await import("@/services/aiProviders");
      const provider = getAIProvider(connection.providerId);
      const baseUrl = connection.baseUrl?.trim() || (connection.providerId === "local" ? "http://localhost:11434" : undefined);
      const result = await provider.processText(
        "Say 'pong' if you can read this.",
        "Respond with a single word.",
        connection.apiKey,
        profile.modelId,
        baseUrl,
        "text",
        {
          temperature: profile.temperature,
          maxTokens: profile.maxTokens
        }
      );
      toast({
        title: "Profile OK",
        description: `Response: ${result.slice(0, 120)}`
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast({ title: "Profile test failed", description: message, variant: "destructive" });
    } finally {
      setTestingProfileId(null);
    }
  };

  if (!isManager) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center">
                <span className="text-white font-semibold">DB</span>
              </div>
              <div>
                <h1 className="text-xl font-semibold text-foreground">Access Denied</h1>
                <p className="text-sm text-muted-foreground">Manager role required.</p>
              </div>
            </div>
            <ThemeToggle />
            <UserMenu />
          </div>
          <Card className="p-6">
            <p className="text-sm text-muted-foreground">
              Ask an admin or manager to grant access to model management.
            </p>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" onClick={() => navigate("/")}>
                Back to Dashboard
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  const resetConnectionForm = () => {
    setEditingConnectionId(null);
    setConnectionProviderId("");
    setConnectionName("");
    setConnectionApiKey("");
    setConnectionBaseUrl("");
    setConnectionIsActive(true);
  };

  const resetProfileForm = () => {
    setEditingProfileId(null);
    setProfileConnectionId("");
    setProfileModelId("");
    setProfileDisplayName("");
    setProfileDefaultPrompt("");
    setProfileTemperature("");
    setProfileMaxTokens("");
    setProfileInputPrice("");
    setProfileOutputPrice("");
    setProfileIsActive(true);
  };

  const handleSaveConnection = () => {
    if (!connectionProviderId || !connectionName.trim()) {
      toast({ title: "Missing fields", description: "Provider and name are required." });
      return;
    }
    const now = Date.now();
    const connection: ProviderConnection = {
      id: editingConnectionId ?? crypto.randomUUID(),
      providerId: connectionProviderId as ProviderConnection["providerId"],
      name: connectionName.trim(),
      apiKey: connectionApiKey.trim() || undefined,
      baseUrl: connectionBaseUrl.trim() || undefined,
      isActive: connectionIsActive,
      createdAt: now,
      updatedAt: now
    };
    modelManagementService.saveConnection(connection);
    setConnections(modelManagementService.getConnections());
    resetConnectionForm();
  };

  const handleEditConnection = (connection: ProviderConnection) => {
    setEditingConnectionId(connection.id);
    setConnectionProviderId(connection.providerId);
    setConnectionName(connection.name);
    setConnectionApiKey(connection.apiKey ?? "");
    setConnectionBaseUrl(connection.baseUrl ?? "");
    setConnectionIsActive(connection.isActive);
  };

  const handleDeleteConnection = (id: string) => {
    modelManagementService.deleteConnection(id);
    setConnections(modelManagementService.getConnections());
  };

  const handleSaveProfile = () => {
    if (!profileConnectionId || !profileModelId || !profileDisplayName.trim()) {
      toast({ title: "Missing fields", description: "Connection, model, and name are required." });
      return;
    }
    const now = Date.now();
    const profile: ModelProfile = {
      id: editingProfileId ?? crypto.randomUUID(),
      providerConnectionId: profileConnectionId,
      modelId: profileModelId,
      displayName: profileDisplayName.trim(),
      defaultPrompt: profileDefaultPrompt.trim() || undefined,
      temperature: profileTemperature ? Number(profileTemperature) : undefined,
      maxTokens: profileMaxTokens ? Number(profileMaxTokens) : undefined,
      inputPricePerMillion: profileInputPrice ? Number(profileInputPrice) : undefined,
      outputPricePerMillion: profileOutputPrice ? Number(profileOutputPrice) : undefined,
      isActive: profileIsActive,
      createdAt: now,
      updatedAt: now
    };
    modelManagementService.saveProfile(profile);
    setProfiles(modelManagementService.getProfiles());
    resetProfileForm();
  };

  const handleEditProfile = (profile: ModelProfile) => {
    setEditingProfileId(profile.id);
    setProfileConnectionId(profile.providerConnectionId);
    setProfileModelId(profile.modelId);
    setProfileDisplayName(profile.displayName);
    setProfileDefaultPrompt(profile.defaultPrompt ?? "");
    setProfileTemperature(profile.temperature !== undefined ? String(profile.temperature) : "");
    setProfileMaxTokens(profile.maxTokens !== undefined ? String(profile.maxTokens) : "");
    setProfileInputPrice(profile.inputPricePerMillion !== undefined ? String(profile.inputPricePerMillion) : "");
    setProfileOutputPrice(profile.outputPricePerMillion !== undefined ? String(profile.outputPricePerMillion) : "");
    setProfileIsActive(profile.isActive);
  };

  const handleDeleteProfile = (id: string) => {
    modelManagementService.deleteProfile(id);
    setProfiles(modelManagementService.getProfiles());
  };

  const handleSavePolicy = () => {
    if (!selectedProjectId) return;
    const policy: ProjectModelPolicy = {
      projectId: selectedProjectId,
      allowedModelProfileIds: allowedProfiles,
      defaultModelProfileIds: defaultProfiles.filter(id => allowedProfiles.includes(id)),
      updatedAt: Date.now()
    };
    modelManagementService.saveProjectPolicy(policy);
    toast({ title: "Policy saved", description: "Project model policy updated." });
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Model Management</h1>
            <p className="text-sm text-muted-foreground">Configure provider connections and model profiles.</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => navigate("/")}>Back to Dashboard</Button>
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>

        <Card className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Provider Connections</h2>
              <p className="text-xs text-muted-foreground">Store API keys and base URLs in one place.</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <Label>Provider</Label>
              <Select value={connectionProviderId} onValueChange={setConnectionProviderId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABLE_PROVIDERS.map(provider => (
                    <SelectItem key={provider.id} value={provider.id}>{provider.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3">
              <Label>Connection Name</Label>
              <Input value={connectionName} onChange={(e) => setConnectionName(e.target.value)} placeholder="OpenAI Prod" />
            </div>
            <div className="space-y-3">
              <Label>API Key</Label>
              <Input type="password" value={connectionApiKey} onChange={(e) => setConnectionApiKey(e.target.value)} placeholder="sk-..." />
            </div>
            <div className="space-y-3">
              <Label>Base URL (optional)</Label>
              <Input value={connectionBaseUrl} onChange={(e) => setConnectionBaseUrl(e.target.value)} placeholder="http://localhost:11434" />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="connection-active"
                checked={connectionIsActive}
                onCheckedChange={(checked) => setConnectionIsActive(!!checked)}
              />
              <Label htmlFor="connection-active" className="text-sm font-normal">Active</Label>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSaveConnection}>
              {editingConnectionId ? "Update Connection" : "Add Connection"}
            </Button>
            {editingConnectionId && (
              <Button variant="outline" onClick={resetConnectionForm}>Cancel</Button>
            )}
          </div>

          <Separator />

          <div className="space-y-3">
            {connections.length === 0 ? (
              <p className="text-sm text-muted-foreground">No provider connections yet.</p>
            ) : (
              connections.map(connection => (
                <div key={connection.id} className="flex items-center justify-between border rounded-md p-3">
                  <div>
                    <div className="font-medium">{connection.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {providerLookup.get(connection.providerId)?.name} · {connection.isActive ? "Active" : "Inactive"}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleEditConnection(connection)}>Edit</Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDeleteConnection(connection.id)}>Delete</Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="p-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold">Model Profiles</h2>
            <p className="text-xs text-muted-foreground">Bundle model + connection into a selectable profile.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <Label>Connection</Label>
              <Select value={profileConnectionId} onValueChange={setProfileConnectionId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select connection" />
                </SelectTrigger>
                <SelectContent>
                  {connectionOptions.map(connection => (
                    <SelectItem key={connection.id} value={connection.id}>{connection.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Model</Label>
                {selectedProfileConnection && (
                  selectedProfileConnection.providerId === "openai"
                  || selectedProfileConnection.providerId === "anthropic"
                  || selectedProfileConnection.providerId === "openrouter"
                ) && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => fetchOfficialModels(selectedProfileConnection, true)}
                      disabled={isLoadingRemoteModels}
                    >
                      {isLoadingRemoteModels ? "Loading..." : "Refresh"}
                    </Button>
                  )}
              </div>
              <Select value={profileModelId} onValueChange={setProfileModelId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  {modelsForSelectedConnection.map(model => (
                    <SelectItem key={model.id} value={model.id}>{model.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedProfileConnection && (
                selectedProfileConnection.providerId === "openai"
                || selectedProfileConnection.providerId === "anthropic"
                || selectedProfileConnection.providerId === "openrouter"
              ) && (
                  <p className="text-xs text-muted-foreground">
                    {remoteModelsError
                      ? `Could not load provider models: ${remoteModelsError}`
                      : modelsForSelectedConnection.length === 0
                        ? "No models loaded yet. Check API key and click Refresh."
                        : "Loaded from provider API."}
                  </p>
                )}
            </div>
            <div className="space-y-3">
              <Label>Display Name</Label>
              <Input value={profileDisplayName} onChange={(e) => setProfileDisplayName(e.target.value)} placeholder="GPT-4o Mini (Prod)" />
            </div>
            <div className="space-y-3">
              <Label>Default Prompt (optional)</Label>
              <Textarea value={profileDefaultPrompt} onChange={(e) => setProfileDefaultPrompt(e.target.value)} rows={3} />
            </div>
            <div className="space-y-3">
              <Label>Temperature (optional)</Label>
              <Input value={profileTemperature} onChange={(e) => setProfileTemperature(e.target.value)} placeholder="0.2" />
            </div>
            <div className="space-y-3">
              <Label>Max Tokens (optional)</Label>
              <Input value={profileMaxTokens} onChange={(e) => setProfileMaxTokens(e.target.value)} placeholder="1024" />
            </div>
            <div className="space-y-3">
              <Label>Input Price / 1M tokens (optional)</Label>
              <Input value={profileInputPrice} onChange={(e) => setProfileInputPrice(e.target.value)} placeholder="0.15" />
            </div>
            <div className="space-y-3">
              <Label>Output Price / 1M tokens (optional)</Label>
              <Input value={profileOutputPrice} onChange={(e) => setProfileOutputPrice(e.target.value)} placeholder="0.60" />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="profile-active"
                checked={profileIsActive}
                onCheckedChange={(checked) => setProfileIsActive(!!checked)}
              />
              <Label htmlFor="profile-active" className="text-sm font-normal">Active</Label>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSaveProfile}>
              {editingProfileId ? "Update Profile" : "Add Profile"}
            </Button>
            {editingProfileId && (
              <Button variant="outline" onClick={resetProfileForm}>Cancel</Button>
            )}
          </div>

          <Separator />

          <div className="space-y-3">
            {profiles.length === 0 ? (
              <p className="text-sm text-muted-foreground">No model profiles yet.</p>
            ) : (
              profiles.map(profile => {
                const connection = connectionLookup.get(profile.providerConnectionId);
                const providerName = connection ? providerLookup.get(connection.providerId)?.name : "Unknown";
                return (
                  <div key={profile.id} className="flex items-center justify-between border rounded-md p-3">
                    <div>
                      <div className="font-medium">{profile.displayName}</div>
                      <div className="text-xs text-muted-foreground">
                        {providerName} · {profile.modelId} · {profile.isActive ? "Active" : "Inactive"}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleTestProfile(profile)}
                        disabled={testingProfileId === profile.id}
                      >
                        {testingProfileId === profile.id ? (
                          <>
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            Testing
                          </>
                        ) : (
                          "Test"
                        )}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleEditProfile(profile)}>Edit</Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDeleteProfile(profile.id)}>Delete</Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        <Card className="p-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold">Project Model Policy</h2>
            <p className="text-xs text-muted-foreground">Choose which profiles are available per project.</p>
          </div>
          <div className="space-y-3">
            <Label>Project</Label>
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map(project => (
                  <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedProjectId && (
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Allowed Profiles</Label>
                <div className="space-y-2 border rounded-md p-3 max-h-64 overflow-y-auto">
                  {profileOptions.length === 0 && (
                    <p className="text-xs text-muted-foreground">No active profiles to assign.</p>
                  )}
                  {profileOptions.map(profile => {
                    const checked = allowedProfiles.includes(profile.id);
                    return (
                      <div key={profile.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`allowed-${profile.id}`}
                          checked={checked}
                          onCheckedChange={(value) => {
                            if (value) {
                              setAllowedProfiles(prev => [...prev, profile.id]);
                            } else {
                              setAllowedProfiles(prev => prev.filter(id => id !== profile.id));
                              setDefaultProfiles(prev => prev.filter(id => id !== profile.id));
                            }
                          }}
                        />
                        <Label htmlFor={`allowed-${profile.id}`} className="text-sm font-normal">
                          {profile.displayName}
                        </Label>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Default Profiles</Label>
                <div className="space-y-2 border rounded-md p-3 max-h-64 overflow-y-auto">
                  {allowedProfiles.length === 0 && (
                    <p className="text-xs text-muted-foreground">Select allowed profiles first.</p>
                  )}
                  {allowedProfiles.map(profileId => {
                    const profile = profiles.find(item => item.id === profileId);
                    if (!profile) return null;
                    const checked = defaultProfiles.includes(profileId);
                    return (
                      <div key={profileId} className="flex items-center gap-2">
                        <Checkbox
                          id={`default-${profileId}`}
                          checked={checked}
                          onCheckedChange={(value) => {
                            if (value) {
                              setDefaultProfiles(prev => [...prev, profileId]);
                            } else {
                              setDefaultProfiles(prev => prev.filter(id => id !== profileId));
                            }
                          }}
                        />
                        <Label htmlFor={`default-${profileId}`} className="text-sm font-normal">
                          {profile.displayName}
                        </Label>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <Button onClick={handleSavePolicy} disabled={!selectedProjectId}>Save Policy</Button>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default ModelManagement;
