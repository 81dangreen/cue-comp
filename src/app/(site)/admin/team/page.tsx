import type { Metadata } from "next";
import { Suspense } from "react";
import {
  changeRoleAction,
  createInviteAction,
  createResetAction,
  removeMemberAction,
  revokeInviteAction,
} from "@/actions/team";
import { requireUser } from "@/lib/auth";
import { ROLES, type Role } from "@/lib/constants";
import { db } from "@/lib/db";
import { INVITE_DAYS, RESET_HOURS } from "@/lib/team";
import { ActionButton, ActionForm, SubmitButton } from "@/components/forms";
import { LinkButton, LinkForm } from "@/components/admin/share-link";
import { Badge, Card, CardHeader, Field, Input, PageSkeleton, Select } from "@/components/ui";

export const metadata: Metadata = { title: "Team" };

const ROLE_HELP: Record<Role, string> = {
  OWNER: "Everything, including roles and deleting tournaments",
  ADMIN: "Runs tournaments: entries, draws, tables, tablets and results",
  SCORER: "Scores matches only",
};

const ROLE_ORDER = ["OWNER", "ADMIN", "SCORER"];

export default function TeamPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Team />
    </Suspense>
  );
}

async function Team() {
  const user = await requireUser();
  if (user.role === "SCORER") {
    return <Card className="p-5 text-sm text-muted">Your team is managed by its owner and admins.</Card>;
  }
  const [members, invites] = await Promise.all([
    db.membership.findMany({
      where: { organizationId: user.organizationId },
      include: { user: true },
      orderBy: { user: { name: "asc" } },
    }),
    db.invite.findMany({
      where: { organizationId: user.organizationId, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  // Owner first, then admins, then scorers.
  members.sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
  const owner = user.role === "OWNER";
  // Owners manage everyone; admins manage scorers. Nobody manages themselves here.
  const manageable = (m: (typeof members)[number]) => m.userId !== user.id && (owner || m.role === "SCORER");

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-6">
        <Card>
          <CardHeader title={`Team (${members.length})`} subtitle={`Everyone who can sign in to ${user.organizationName}.`} />
          <ul className="divide-y divide-border">
            {members.map((m) => (
              <li key={m.id} className="space-y-2 px-5 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {m.user.name}
                      {m.userId === user.id && <span className="ml-1.5 text-sm font-normal text-muted">(you)</span>}
                    </p>
                    <p className="truncate text-sm text-muted">{m.user.email}</p>
                  </div>
                  {owner && manageable(m) ? (
                    <ActionForm action={changeRoleAction.bind(null, m.userId)} className="flex items-center gap-2">
                      <Select name="role" defaultValue={m.role} aria-label={`Role for ${m.user.name}`} className="w-28 py-1 text-sm">
                        <option value="ADMIN">Admin</option>
                        <option value="SCORER">Scorer</option>
                      </Select>
                      <SubmitButton variant="secondary" className="px-2.5 py-1 text-xs">
                        Save
                      </SubmitButton>
                    </ActionForm>
                  ) : (
                    <Badge tone={m.role === "OWNER" ? "accent" : "neutral"}>{ROLES[m.role as Role]}</Badge>
                  )}
                  {manageable(m) && (
                    <ActionButton
                      action={removeMemberAction.bind(null, m.userId)}
                      confirm={`Remove ${m.user.name} from the team? They won't be able to sign in.`}
                      variant="ghost"
                      className="px-2.5 py-1 text-xs text-live"
                    >
                      Remove
                    </ActionButton>
                  )}
                </div>
                {manageable(m) && (
                  <LinkButton
                    action={createResetAction.bind(null, m.userId)}
                    label="Create a password reset link"
                    title={`Password reset link for ${m.user.name}`}
                    note={`Send it to ${m.user.name}. It works once and expires in ${RESET_HOURS} hours.`}
                  />
                )}
              </li>
            ))}
          </ul>
        </Card>

        {invites.length > 0 && (
          <Card>
            <CardHeader title="Waiting to be accepted" subtitle="Links already sent. Cancel one if it went to the wrong person." />
            <ul className="divide-y divide-border">
              {invites.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-sm">
                  <span className="flex-1 font-medium">{i.label || "Invite"}</span>
                  <Badge>{ROLES[i.role as Role]}</Badge>
                  <span className="text-muted">
                    expires {i.expiresAt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                  </span>
                  <ActionButton action={revokeInviteAction.bind(null, i.id)} variant="ghost" className="px-2.5 py-1 text-xs text-live">
                    Cancel
                  </ActionButton>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <Card className="h-fit">
        <CardHeader title="Invite someone" />
        <LinkForm
          action={createInviteAction}
          title="Invite link"
          note={`Send it on WhatsApp or by text. They choose their own password. It works once and expires in ${INVITE_DAYS} days.`}
          className="p-5"
        >
          <Field label="Who is it for? (optional)" hint="Only you see this, to tell invites apart">
            <Input name="label" placeholder="e.g. Steve, Friday nights" maxLength={60} />
          </Field>
          <Field label="Role">
            <Select name="role" defaultValue="ADMIN">
              <option value="ADMIN">Admin</option>
              <option value="SCORER">Scorer</option>
            </Select>
          </Field>
          <dl className="space-y-1 text-xs text-muted">
            {(["ADMIN", "SCORER"] as const).map((r) => (
              <div key={r}>
                <dt className="inline font-semibold text-foreground">{ROLES[r]}:</dt> <dd className="inline">{ROLE_HELP[r]}</dd>
              </div>
            ))}
          </dl>
          <SubmitButton pendingText="Creating…">Create invite link</SubmitButton>
        </LinkForm>
        <p className="border-t border-border px-5 py-3 text-xs text-muted">
          {owner ? "As owner you can change roles and remove anyone." : "Admins can remove scorers. The owner manages admins."}
        </p>
      </Card>
    </div>
  );
}
