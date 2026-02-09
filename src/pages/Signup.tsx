import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, UserPlus, AlertCircle, CheckCircle } from "lucide-react";
import { apiClient } from "@/services/apiClient";
import { useAuth } from "@/contexts/AuthContext";

export default function Signup() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { login } = useAuth();

    const token = searchParams.get("token") || "";

    const [validating, setValidating] = useState(true);
    const [tokenValid, setTokenValid] = useState(false);
    const [tokenError, setTokenError] = useState("");
    const [assignedRoles, setAssignedRoles] = useState<string[]>([]);

    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);

    // Validate token on mount
    useEffect(() => {
        if (!token) {
            setValidating(false);
            setTokenError("No invite token provided. You need an invite link to sign up.");
            return;
        }

        apiClient.invite.validate(token)
            .then((result) => {
                if (result.valid) {
                    setTokenValid(true);
                    setAssignedRoles(result.roles || ["annotator"]);
                } else {
                    setTokenError(result.error || "Invalid invite token");
                }
            })
            .catch((err) => {
                setTokenError(err.message || "Failed to validate invite token");
            })
            .finally(() => {
                setValidating(false);
            });
    }, [token]);

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (!username.trim()) {
            setError("Username is required");
            return;
        }

        if (password.length < 4) {
            setError("Password must be at least 4 characters");
            return;
        }

        if (password !== confirmPassword) {
            setError("Passwords do not match");
            return;
        }

        setLoading(true);

        try {
            const user = await apiClient.auth.signup(username.trim(), password, token);

            // Automatically log in the user
            setSuccess(true);

            // Small delay then navigate
            setTimeout(async () => {
                await login(username.trim(), password);
                navigate("/");
            }, 1500);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Signup failed");
        } finally {
            setLoading(false);
        }
    };

    if (validating) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
                <Card className="w-full max-w-md">
                    <CardContent className="p-8 flex flex-col items-center gap-4">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="text-muted-foreground">Validating invite link...</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (!tokenValid) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
                <Card className="w-full max-w-md">
                    <CardHeader className="text-center">
                        <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                            <AlertCircle className="h-6 w-6 text-destructive" />
                        </div>
                        <CardTitle>Invalid Invite Link</CardTitle>
                        <CardDescription>{tokenError}</CardDescription>
                    </CardHeader>
                    <CardContent className="text-center">
                        <p className="text-sm text-muted-foreground mb-4">
                            Please contact your administrator to get a valid invite link.
                        </p>
                        <Button variant="outline" onClick={() => navigate("/")}>
                            Go to Login
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (success) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
                <Card className="w-full max-w-md">
                    <CardContent className="p-8 flex flex-col items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                            <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                        </div>
                        <h2 className="text-xl font-semibold">Account Created!</h2>
                        <p className="text-muted-foreground text-center">
                            Redirecting you to the dashboard...
                        </p>
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                        <UserPlus className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle>Create Your Account</CardTitle>
                    <CardDescription>
                        You've been invited to join DataBayt.AI Studio
                    </CardDescription>
                    <div className="flex justify-center gap-2 mt-2">
                        {assignedRoles.map((role) => (
                            <Badge key={role} variant="secondary" className="capitalize">
                                {role}
                            </Badge>
                        ))}
                    </div>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSignup} className="space-y-4">
                        {error && (
                            <Alert variant="destructive">
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="username">Username</Label>
                            <Input
                                id="username"
                                type="text"
                                placeholder="Choose a username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                disabled={loading}
                                autoFocus
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password">Password</Label>
                            <Input
                                id="password"
                                type="password"
                                placeholder="Choose a password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                disabled={loading}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="confirm-password">Confirm Password</Label>
                            <Input
                                id="confirm-password"
                                type="password"
                                placeholder="Confirm your password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                disabled={loading}
                            />
                        </div>

                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Creating Account...
                                </>
                            ) : (
                                "Create Account"
                            )}
                        </Button>

                        <p className="text-xs text-center text-muted-foreground">
                            Already have an account?{" "}
                            <Button variant="link" className="p-0 h-auto" onClick={() => navigate("/")}>
                                Log in
                            </Button>
                        </p>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
