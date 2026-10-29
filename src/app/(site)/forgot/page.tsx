import type { Metadata } from "next";
import Link from "next/link";
import { recoverAction } from "@/actions/team";
import { MIN_PASSWORD } from "@/lib/team";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field, Input } from "@/components/ui";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPage() {
  return (
    <div className="mx-auto max-w-md space-y-6">
      <Card className="p-6">
        <h1 className="text-xl font-bold">Forgot your password?</h1>
        <p className="mt-2 text-[15px]">
          Ask the owner or an admin on your team. They can create a password reset link for you under{" "}
          <span className="font-semibold">Admin → Team</span> and send it to you.
        </p>
        <Link href="/login" className="mt-4 inline-block text-sm text-accent hover:underline">
          ← Back to log in
        </Link>
      </Card>
      <Card className="p-6">
        <h2 className="font-semibold">Locked out with no one to ask?</h2>
        <p className="mt-1 text-sm text-muted">
          Whoever runs the site can reset any account with the setup key (SETUP_KEY in the server settings).
        </p>
        <ActionForm action={recoverAction} className="mt-4 space-y-4">
          <Field label="Email of the account">
            <Input name="email" type="email" required autoComplete="username" />
          </Field>
          <Field label="Setup key">
            <Input name="setupKey" type="password" required autoComplete="off" />
          </Field>
          <Field label="New password" hint={`At least ${MIN_PASSWORD} characters`}>
            <Input name="password" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" />
          </Field>
          <Field label="New password again">
            <Input name="confirm" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" />
          </Field>
          <SubmitButton variant="secondary" pendingText="Resetting…">
            Reset password
          </SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
