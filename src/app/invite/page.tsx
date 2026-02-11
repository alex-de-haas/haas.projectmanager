"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface InviteLookupResponse {
  user?: {
    id: number;
    name: string;
    email?: string | null;
  };
  expires_at?: string;
  error?: string;
}

function InvitePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [inviteUserName, setInviteUserName] = useState("");
  const [inviteUserEmail, setInviteUserEmail] = useState("");
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadInvitation = async () => {
      if (!token) {
        if (!cancelled) {
          setError("Invitation token is missing.");
          setLoading(false);
        }
        return;
      }

      try {
        const response = await fetch(`/api/auth/invite?token=${encodeURIComponent(token)}`);
        const data = (await response.json().catch(() => ({}))) as InviteLookupResponse;

        if (!response.ok || !data.user) {
          if (!cancelled) {
            setError(data.error || "Invitation is invalid or expired.");
          }
          return;
        }

        if (!cancelled) {
          setInviteUserName(data.user.name);
          setInviteUserEmail(data.user.email ?? "");
          setError("");
        }
      } catch {
        if (!cancelled) {
          setError("Failed to load invitation.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadInvitation();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleAcceptInvitation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!token) {
      setError("Invitation token is missing.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        setError(data.error || "Failed to accept invitation.");
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError("Failed to accept invitation.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex h-full items-center justify-center px-6">Loading invitation...</div>;
  }

  return (
    <div className="flex h-full items-center justify-center px-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Accept invitation</CardTitle>
          <CardDescription>Set your password to activate your account.</CardDescription>
        </CardHeader>
        <CardContent>
          {inviteUserName ? (
            <div className="mb-4 rounded-md border bg-muted/30 p-3 text-sm">
              <div className="font-medium">{inviteUserName}</div>
              <div className="text-muted-foreground">{inviteUserEmail}</div>
            </div>
          ) : null}

          <form onSubmit={handleAcceptInvitation} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={Boolean(error) && !inviteUserName}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                disabled={Boolean(error) && !inviteUserName}
                required
              />
            </div>
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Button
              type="submit"
              className="w-full"
              disabled={submitting || !inviteUserName}
            >
              {submitting ? "Activating account..." : "Activate account"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center px-6">Loading...</div>}>
      <InvitePageContent />
    </Suspense>
  );
}

