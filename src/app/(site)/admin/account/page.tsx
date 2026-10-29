import type { Metadata } from "next";
import { Suspense } from "react";
import { changePasswordAction, updateAccountAction } from "@/actions/team";
import { requireUser } from "@/lib/auth";
import { ROLES } from "@/lib/constants";
import { MIN_PASSWORD } from "@/lib/team";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, CardHeader, Field, Input, PageSkeleton } from "@/components/ui";

export const metadata: Metadata = { title: "Your account" };

export default function AccountPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Account />
    </Suspense>
  );
}

async function Account() {
  const user = await requireUser();
  return (
    <div className="max-w-xl space-y-6">
      <Card>
        <CardHeader title="Your account" subtitle={`${user.email} · ${ROLES[user.role]} at ${user.organizationName}`} />
        <ActionForm action={updateAccountAction} className="space-y-4 p-5">
          <Field label="Name">
            <Input name="name" defaultValue={user.name} required autoComplete="name" />
          </Field>
          <SubmitButton>Save</SubmitButton>
        </ActionForm>
      </Card>
      <Card>
        <CardHeader title="Change password" subtitle="Any other devices you're signed in on will be signed out." />
        <ActionForm action={changePasswordAction} className="space-y-4 p-5" resetOnSuccess>
          <Field label="Current password">
            <Input name="current" type="password" required autoComplete="current-password" />
          </Field>
          <Field label="New password" hint={`At least ${MIN_PASSWORD} characters`}>
            <Input name="password" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" />
          </Field>
          <Field label="New password again">
            <Input name="confirm" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" />
          </Field>
          <SubmitButton>Change password</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
