import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";

export const UserMenu = () => {
  const { currentUser, logout, changePassword } = useAuth();
  const [showChangePassword, setShowChangePassword] = useState(false);
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

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      setChangeError("Passwords do not match");
      return;
    }
    const result = await changePassword(currentPassword, newPassword);
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
    return null;
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
          <DropdownMenuItem onClick={() => setShowChangePassword(true)}>Change Password</DropdownMenuItem>
          <DropdownMenuItem onClick={logout}>Log Out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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
