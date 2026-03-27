import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export const UserMenu = () => {
  const { t } = useTranslation();
  const { currentUser, logout, changePassword } = useAuth();
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changeError, setChangeError] = useState("");

  const mustChangePassword = !!currentUser?.mustChangePassword;
  const roleLabel = currentUser?.roles?.includes("admin")
    ? t("dashboard.roles.admin")
    : currentUser?.roles?.includes("manager")
    ? t("dashboard.roles.manager")
    : t("dashboard.roles.annotator");

  useEffect(() => {
    if (mustChangePassword) {
      setShowChangePassword(true);
    }
  }, [mustChangePassword]);

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      setChangeError(t("auth.passwordsDoNotMatch"));
      return;
    }
    const result = await changePassword(currentPassword, newPassword);
    if (!result.ok) {
      setChangeError(result.error || t("auth.changePasswordFailed"));
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

  const initials = currentUser.username.slice(0, 2).toUpperCase();

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full p-0">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-[11px] font-semibold text-white">
                  {initials}
                </span>
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <span>{currentUser.username}</span>
            <Badge variant="secondary" className="ml-1.5 text-[10px] uppercase">{roleLabel}</Badge>
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{currentUser.username}</span>
              <span className="text-xs text-muted-foreground uppercase">{roleLabel}</span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setShowChangePassword(true)}>
            {t("auth.changePassword")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            {t("user.language")}
          </DropdownMenuLabel>
          <LanguageSwitcher />
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={logout}>{t("user.logout")}</DropdownMenuItem>
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
            <DialogTitle>
              {mustChangePassword ? t("auth.setNewPassword") : t("auth.changePassword")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="current-password">{t("auth.currentPassword")}</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-password">{t("auth.newPassword")}</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">{t("auth.confirmPassword")}</Label>
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
                {t("auth.mustChangePassword")}
              </p>
            )}
          </div>
          <DialogFooter>
            {!mustChangePassword && (
              <Button variant="outline" onClick={() => setShowChangePassword(false)}>
                {t("common.cancel")}
              </Button>
            )}
            <Button onClick={handleChangePassword}>{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
