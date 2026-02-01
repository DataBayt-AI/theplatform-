import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type Role = "admin" | "manager" | "annotator";

export type User = {
  id: string;
  username: string;
  password: string;
  roles: Role[];
  mustChangePassword?: boolean;
};

type AuthContextValue = {
  currentUser: User | null;
  users: User[];
  login: (username: string, password: string) => boolean;
  logout: () => void;
  createUser: (username: string, password: string, roles: Role[]) => { ok: boolean; error?: string };
  changePassword: (currentPassword: string, newPassword: string) => { ok: boolean; error?: string };
  getUserById: (id: string | null | undefined) => User | undefined;
};

const USERS_KEY = "databayt_users";
const SESSION_KEY = "databayt_session_user";

const seedAdmin = (): User[] => [
  { id: crypto.randomUUID(), username: "admin", password: "admin", roles: ["admin", "manager", "annotator"], mustChangePassword: false }
];

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [users, setUsers] = useState<User[]>(() => {
    const stored = localStorage.getItem(USERS_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as User[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {
        // fall through to seed
      }
    }
    const seeded = seedAdmin();
    localStorage.setItem(USERS_KEY, JSON.stringify(seeded));
    return seeded;
  });

  const [currentUserId, setCurrentUserId] = useState<string | null>(() => {
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) return stored;
    const admin = users.find(u => u.username === "admin");
    if (admin) {
      localStorage.setItem(SESSION_KEY, admin.id);
      return admin.id;
    }
    return null;
  });

  useEffect(() => {
    const normalized = users.map(user => {
      const legacyRole = (user as { role?: Role }).role;
      const roles = user.roles && user.roles.length > 0
        ? user.roles
        : legacyRole
          ? legacyRole === "admin"
            ? ["admin", "manager", "annotator"]
            : [legacyRole]
          : ["annotator"];
      return {
        ...user,
        roles,
        mustChangePassword: user.mustChangePassword ?? false
      };
    });
    const needsUpdate = users.some(user => !user.roles || user.roles.length === 0 || user.mustChangePassword === undefined || (user as { role?: Role }).role);
    if (needsUpdate) {
      setUsers(normalized);
      return;
    }
    localStorage.setItem(USERS_KEY, JSON.stringify(normalized));
    if (currentUserId && !users.find(u => u.id === currentUserId)) {
      const admin = users.find(u => u.username === "admin");
      setCurrentUserId(admin?.id ?? null);
    }
  }, [users, currentUserId]);

  useEffect(() => {
    if (currentUserId) {
      localStorage.setItem(SESSION_KEY, currentUserId);
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  }, [currentUserId]);

  const login = (username: string, password: string) => {
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) return false;
    setCurrentUserId(user.id);
    return true;
  };

  const logout = () => {
    setCurrentUserId(null);
  };

  const createUser = (username: string, password: string, roles: Role[]) => {
    const normalized = username.trim();
    if (!normalized) return { ok: false, error: "Username is required" };
    if (users.some(u => u.username.toLowerCase() === normalized.toLowerCase())) {
      return { ok: false, error: "Username already exists" };
    }
    if (!roles || roles.length === 0) {
      return { ok: false, error: "Select at least one role" };
    }
    const effectivePassword = password.trim().length > 0 ? password : "changeme";
    const normalizedRoles = roles.includes("admin") ? ["admin", "manager", "annotator"] : roles;
    const user: User = {
      id: crypto.randomUUID(),
      username: normalized,
      password: effectivePassword,
      roles: normalizedRoles,
      mustChangePassword: !normalizedRoles.includes("admin")
    };
    setUsers(prev => [...prev, user]);
    return { ok: true };
  };

  const changePassword = (currentPassword: string, newPassword: string) => {
    if (!currentUserId) return { ok: false, error: "Not logged in" };
    const user = users.find(u => u.id === currentUserId);
    if (!user) return { ok: false, error: "User not found" };
    if (user.password !== currentPassword) return { ok: false, error: "Current password is incorrect" };
    if (newPassword.trim().length < 4) return { ok: false, error: "New password must be at least 4 characters" };
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, password: newPassword, mustChangePassword: false } : u));
    return { ok: true };
  };

  const getUserById = (id: string | null | undefined) => {
    if (!id) return undefined;
    return users.find(u => u.id === id);
  };

  const value = useMemo<AuthContextValue>(() => {
    return {
      currentUser: users.find(u => u.id === currentUserId) ?? null,
      users,
      login,
      logout,
      createUser,
      changePassword,
      getUserById
    };
  }, [users, currentUserId]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
