import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { createPlayer, importPlayers } from "@/actions/players";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { playerName } from "@/lib/queries";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, CardHeader, EmptyState, Field, Input, PageHeader, PageSkeleton, Textarea } from "@/components/ui";

export const metadata: Metadata = { title: "Players" };

export default function PlayersAdmin({ searchParams }: PageProps<"/admin/players">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Players searchParams={searchParams} />
    </Suspense>
  );
}

async function Players({ searchParams }: { searchParams: PageProps<"/admin/players">["searchParams"] }) {
  const user = await requireUser();
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  const players = await db.player.findMany({
    where: {
      organizationId: user.organizationId,
      ...(query && {
        OR: [{ firstName: { contains: query } }, { lastName: { contains: query } }, { nickname: { contains: query } }],
      }),
    },
    include: { _count: { select: { entries: true } } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  return (
    <div>
      <PageHeader title="Players" subtitle={`${players.length} ${query ? "matching" : "in your database"}`} />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card>
          <form className="border-b border-border p-3">
            <Input name="q" defaultValue={query} placeholder="Search players…" />
          </form>
          {players.length === 0 ? (
            <EmptyState title={query ? "No players match" : "No players yet"}>Add players using the form.</EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {players.map((p) => (
                <li key={p.id}>
                  <Link href={`/admin/players/${p.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface-2">
                    <span className="flex-1 font-medium">
                      {playerName(p)}
                      {p.nickname && <span className="ml-2 text-sm font-normal text-muted">“{p.nickname}”</span>}
                    </span>
                    <span className="text-sm text-muted">{p.email}</span>
                    <span className="w-24 text-right text-xs text-muted">{p._count.entries} tournaments</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Add player" />
            <ActionForm action={createPlayer} className="space-y-3 p-5" resetOnSuccess>
              <div className="grid grid-cols-2 gap-3">
                <Field label="First name">
                  <Input name="firstName" required />
                </Field>
                <Field label="Last name">
                  <Input name="lastName" required />
                </Field>
              </div>
              <Field label="Nickname">
                <Input name="nickname" />
              </Field>
              <Field label="Email">
                <Input name="email" type="email" />
              </Field>
              <SubmitButton>Add player</SubmitButton>
            </ActionForm>
          </Card>
          <Card>
            <CardHeader title="Bulk import" subtitle="One player per line: “First Last” or “Last, First”" />
            <ActionForm action={importPlayers} className="space-y-3 p-5" resetOnSuccess>
              <Textarea name="names" rows={6} placeholder={"Shane Van Boening\nKaren Corr"} />
              <SubmitButton variant="secondary">Import</SubmitButton>
            </ActionForm>
          </Card>
        </div>
      </div>
    </div>
  );
}
