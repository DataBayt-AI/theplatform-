import type { ModelProfile, ProjectModelPolicy, ProviderConnection } from "@/types/data";

const CONNECTIONS_KEY = "databayt-model-connections";
const PROFILES_KEY = "databayt-model-profiles";
const PROJECT_POLICIES_KEY = "databayt-project-model-policies";

const readList = <T>(key: string): T[] => {
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
};

const writeList = <T>(key: string, value: T[]) => {
  localStorage.setItem(key, JSON.stringify(value));
};

const readPolicies = (): Record<string, ProjectModelPolicy> => {
  const raw = localStorage.getItem(PROJECT_POLICIES_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writePolicies = (value: Record<string, ProjectModelPolicy>) => {
  localStorage.setItem(PROJECT_POLICIES_KEY, JSON.stringify(value));
};

export const modelManagementService = {
  getConnections: (): ProviderConnection[] => readList<ProviderConnection>(CONNECTIONS_KEY),
  saveConnection: (connection: ProviderConnection): ProviderConnection => {
    const list = readList<ProviderConnection>(CONNECTIONS_KEY);
    const now = Date.now();
    const existingIndex = list.findIndex(item => item.id === connection.id);
    if (existingIndex >= 0) {
      list[existingIndex] = { ...connection, updatedAt: now };
    } else {
      list.push({ ...connection, createdAt: now, updatedAt: now });
    }
    writeList(CONNECTIONS_KEY, list);
    return list.find(item => item.id === connection.id)!;
  },
  deleteConnection: (id: string) => {
    const list = readList<ProviderConnection>(CONNECTIONS_KEY).filter(item => item.id !== id);
    writeList(CONNECTIONS_KEY, list);
  },
  getProfiles: (): ModelProfile[] => readList<ModelProfile>(PROFILES_KEY),
  saveProfile: (profile: ModelProfile): ModelProfile => {
    const list = readList<ModelProfile>(PROFILES_KEY);
    const now = Date.now();
    const existingIndex = list.findIndex(item => item.id === profile.id);
    if (existingIndex >= 0) {
      list[existingIndex] = { ...profile, updatedAt: now };
    } else {
      list.push({ ...profile, createdAt: now, updatedAt: now });
    }
    writeList(PROFILES_KEY, list);
    return list.find(item => item.id === profile.id)!;
  },
  deleteProfile: (id: string) => {
    const list = readList<ModelProfile>(PROFILES_KEY).filter(item => item.id !== id);
    writeList(PROFILES_KEY, list);
  },
  getProjectPolicy: (projectId: string): ProjectModelPolicy | null => {
    const policies = readPolicies();
    return policies[projectId] ?? null;
  },
  saveProjectPolicy: (policy: ProjectModelPolicy) => {
    const policies = readPolicies();
    policies[policy.projectId] = {
      ...policy,
      updatedAt: Date.now()
    };
    writePolicies(policies);
  }
};
