"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function LoginForm({ configured }: { configured: boolean }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    login,
    {},
  );
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Copper admin</CardTitle>
        <CardDescription>Sign in to review refund requests.</CardDescription>
      </CardHeader>
      <CardContent>
        {configured ? (
          <form action={action} className="space-y-3">
            <Input
              name="password"
              type="password"
              aria-label="Admin password"
              placeholder="Admin password"
              required
              autoFocus
            />
            {state.error && (
              <p role="alert" className="text-destructive text-sm">
                {state.error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={pending}>
              Sign in
            </Button>
          </form>
        ) : (
          <p role="alert" className="text-sm">
            The admin password isn&apos;t set up yet. Add ADMIN_PASSWORD to the
            environment settings.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
