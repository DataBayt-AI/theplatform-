import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { apiClient } from "@/services/apiClient";

export type Role = "admin" | "manager" | "annotator";

export type User = {
  id: string;
  username: string;
  password?: string; // Optional since server doesn't return passwords
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

const SESSION_KEY = "databayt_session";

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return null;
      }
    }
    return null;
  });
  const [loading, setLoading] = useState(true);

  // Load users from server on mount
  const refreshUsers = useCallback(async () => {
    try {
      const serverUsers = await apiClient.users.getAll();
      setUsers(serverUsers);
    } catch (error) {
      console.error('Failed to load users:', error);
      // If not authorized, users list will be empty
      setUsers([]);
    }
  }, []);

  useEffect(() => {
    refreshUsers().finally(() => setLoading(false));
  }, [refreshUsers]);

  // Persist session to localStorage
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(currentUser));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  }, [currentUser]);

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    try {
      const user = await apiClient.auth.login(username, password);
      setCurrentUser(user);
      // Refresh users list after login (may now have access)
      await refreshUsers();
      return true;
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    }
  }, [refreshUsers]);

  const logout = useCallback(() => {
    setCurrentUser(null);
    localStorage.removeItem(SESSION_KEY);
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
    if (newPassword.trim().length < 4) return { ok: false, error: "New password must be at least 4 characters" };

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
    } catch (error) {
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
    if (newPassword.trim().length < 4) return { ok: false, error: "Password must be at least 4 characters" };

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

  // Show loading state briefly
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
