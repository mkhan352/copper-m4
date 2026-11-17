import { LoginForm } from "@/components/copper/admin/login-form";
import { isAdminConfigured } from "@/lib/copper/admin/session";

export const metadata = { title: "Admin sign-in · Copper State Labs" };

export default function AdminLoginPage() {
  return (
    <main className="bg-secondary flex min-h-screen items-center justify-center px-4">
      <LoginForm configured={isAdminConfigured()} />
    </main>
  );
}
