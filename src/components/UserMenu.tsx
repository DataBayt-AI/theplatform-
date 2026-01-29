import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";

export const UserMenu = () => {
  const { currentUser, login, logout, changePassword } = useAuth();
  const [showLogin, setShowLogin] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changeError, setChangeError] = useState("");

  const mustChangePassword = !!currentUser?.mustChangePassword;
  const roleLabel = currentUser?.roles?.includes("admin")
    ? "admin"
    : currentUser?.roles?.join(", ");

  useEffect(() => {
    if (mustChangePassword) {
      setShowChangePassword(true);
    }
  }, [mustChangePassword]);

  const handleLogin = () => {
    const ok = login(username, password);
    if (!ok) {
      setError("Invalid username or password");
      return;
    }
    setError("");
    setShowLogin(false);
    setUsername("");
    setPassword("");
  };

  const handleChangePassword = () => {
    if (newPassword !== confirmPassword) {
      setChangeError("Passwords do not match");
      return;
    }
    const result = changePassword(currentPassword, newPassword);
    if (!result.ok) {
      setChangeError(result.error || "Failed to change password");
      return;
    }
    setChangeError("");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowChangePassword(false);
  };

  if (!currentUser) {
    return (
      <>
        <Button size="sm" variant="outline" onClick={() => setShowLogin(true)}>
          Login
        </Button>
        <Dialog open={showLogin} onOpenChange={setShowLogin}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Login</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="login-username">Username</Label>
                <Input id="login-username" value={username} onChange={(e) => setUsername(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="login-password">Password</Label>
                <Input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowLogin(false)}>Cancel</Button>
              <Button onClick={handleLogin}>Login</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="gap-2">
            {currentUser.username}
            <Badge variant="secondary" className="text-[10px] uppercase">
              {roleLabel}
            </Badge>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setShowLogin(true)}>Switch User</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowChangePassword(true)}>Change Password</DropdownMenuItem>
          <DropdownMenuItem onClick={logout}>Log Out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showLogin} onOpenChange={setShowLogin}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Switch User</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="switch-username">Username</Label>
              <Input id="switch-username" value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="switch-password">Password</Label>
              <Input id="switch-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLogin(false)}>Cancel</Button>
            <Button onClick={handleLogin}>Switch</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showChangePassword || mustChangePassword}
        onOpenChange={(open) => {
          if (mustChangePassword) return;
          setShowChangePassword(open);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{mustChangePassword ? "Set a new password" : "Change Password"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="current-password">Current password</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            {changeError && <p className="text-sm text-destructive">{changeError}</p>}
            {mustChangePassword && (
              <p className="text-xs text-muted-foreground">
                You must change your password before continuing.
              </p>
            )}
          </div>
          <DialogFooter>
            {!mustChangePassword && (
              <Button variant="outline" onClick={() => setShowChangePassword(false)}>
                Cancel
              </Button>
            )}
            <Button onClick={handleChangePassword}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
