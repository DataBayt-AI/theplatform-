import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { apiClient, setAuthToken } from "@/services/apiClient";

export type Role = "admin" | "manager" | "annotator";

export type User = {
  id: string;
  username: string;
  roles: Role[];
  mustChangePassword?: boolean;
};

type AuthContextValue = {
  currentUser: User | null;
  users: User[];
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  createUser: (username: string, password: string, roles: Role[]) => Promise<{ ok: boolean; error?: string }>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ ok: boolean; error?: string }>;
  getUserById: (id: string | null | undefined) => User | undefined;
  deleteUser: (userId: string) => Promise<{ ok: boolean; error?: string }>;
  updateUserRoles: (userId: string, newRoles: Role[]) => Promise<{ ok: boolean; error?: string }>;
  adminResetPassword: (userId: string, newPassword: string) => Promise<{ ok: boolean; error?: string }>;
  refreshUsers: () => Promise<void>;
};

const TOKEN_KEY = "databayt_token";

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session on mount using token from sessionStorage
  useEffect(() => {
    const storedToken = sessionStorage.getItem(TOKEN_KEY);
    if (storedToken) {
      setAuthToken(storedToken);
      // Validate token and get current user
      apiClient.auth.me()
        .then((user: User) => {
          setCurrentUser(user);
        })
        .catch(() => {
          // Token invalid or expired
          sessionStorage.removeItem(TOKEN_KEY);
          setAuthToken(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  // Load users from server when currentUser changes
  const refreshUsers = useCallback(async () => {
    try {
      const serverUsers = await apiClient.users.getAll();
      setUsers(serverUsers);
    } catch {
      setUsers([]);
    }
  }, []);

  useEffect(() => {
    if (currentUser) {
      refreshUsers();
    } else {
      setUsers([]);
    }
  }, [currentUser, refreshUsers]);

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    try {
      const response = await apiClient.auth.login(username, password);
      const { token, ...user } = response;

      // Store JWT in sessionStorage (cleared on browser close, not accessible by XSS on other tabs)
      sessionStorage.setItem(TOKEN_KEY, token);
      setAuthToken(token);
      setCurrentUser(user as User);

      return true;
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    setAuthToken(null);
    setCurrentUser(null);
  }, []);

  const createUser = useCallback(async (username: string, password: string, roles: Role[]): Promise<{ ok: boolean; error?: string }> => {
    const normalized = username.trim();
    if (!normalized) return { ok: false, error: "Username is required" };
    if (!roles || roles.length === 0) {
      return { ok: false, error: "Select at least one role" };
    }

    try {
      const effectivePassword = password.trim().length > 0 ? password : "changeme";
      const normalizedRoles = roles.includes("admin") ? ["admin", "manager", "annotator"] : roles;

      await apiClient.users.create({
        username: normalized,
        password: effectivePassword,
        roles: normalizedRoles,
        mustChangePassword: !normalizedRoles.includes("admin")
      });

      await refreshUsers();
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create user";
      return { ok: false, error: message };
    }
  }, [refreshUsers]);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string): Promise<{ ok: boolean; error?: string }> => {
    if (!currentUser) return { ok: false, error: "Not logged in" };
    if (newPassword.trim().length < 5) return { ok: false, error: "New password must be at least 5 characters" };

    try {
      // Verify current password by attempting login
      await apiClient.auth.login(currentUser.username, currentPassword);

      // Update password
      await apiClient.users.update(currentUser.id, {
        password: newPassword,
        mustChangePassword: false
      });

      // Update local session
      setCurrentUser(prev => prev ? { ...prev, mustChangePassword: false } : null);

      return { ok: true };
    } catch {
      return { ok: false, error: "Current password is incorrect" };
    }
  }, [currentUser]);

  const getUserById = useCallback((id: string | null | undefined): User | undefined => {
    if (!id) return undefined;
    return users.find(u => u.id === id);
  }, [users]);

  const deleteUser = useCallback(async (userId: string): Promise<{ ok: boolean; error?: string }> => {
    if (userId === currentUser?.id) return { ok: false, error: "Cannot delete yourself" };

    const user = users.find(u => u.id === userId);
    if (!user) return { ok: false, error: "User not found" };
    if (user.username === "admin") return { ok: false, error: "Cannot delete the super admin" };

    try {
      await apiClient.users.delete(userId);
      await refreshUsers();
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete user";
      return { ok: false, error: message };
    }
  }, [currentUser, users, refreshUsers]);

  const updateUserRoles = useCallback(async (userId: string, newRoles: Role[]): Promise<{ ok: boolean; error?: string }> => {
    const user = users.find(u => u.id === userId);
    if (!user) return { ok: false, error: "User not found" };
    if (user.username === "admin") return { ok: false, error: "Cannot change super admin roles" };

    try {
      const finalRoles = newRoles.length === 0 ? ["annotator"] : newRoles;
      await apiClient.users.update(userId, { roles: finalRoles });
      await refreshUsers();
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update roles";
      return { ok: false, error: message };
    }
  }, [users, refreshUsers]);

  const adminResetPassword = useCallback(async (userId: string, newPassword: string): Promise<{ ok: boolean; error?: string }> => {
    const user = users.find(u => u.id === userId);
    if (!user) return { ok: false, error: "User not found" };
    if (newPassword.trim().length < 5) return { ok: false, error: "Password must be at least 5 characters" };

    try {
      await apiClient.users.update(userId, {
        password: newPassword,
        mustChangePassword: true
      });
      await refreshUsers();
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to reset password";
      return { ok: false, error: message };
    }
  }, [users, refreshUsers]);

  const value = useMemo<AuthContextValue>(() => ({
    currentUser,
    users,
    login,
    logout,
    createUser,
    changePassword,
    getUserById,
    deleteUser,
    updateUserRoles,
    adminResetPassword,
    refreshUsers
  }), [users, currentUser, login, logout, createUser, changePassword, getUserById, deleteUser, updateUserRoles, adminResetPassword, refreshUsers]);

  if (loading) {
    return null;
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
