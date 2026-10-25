import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { createPlayer, importPlayers } from "@/actions/players";
import { requireUser } from "@/lib/auth";
import { DISCIPLINES, type Discipline } from "@/lib/constants";
import { db } from "@/lib/db";
import { playerName } from "@/lib/queries";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, ButtonLink, Card, CardHeader, EmptyState, Field, Input, PageHeader, PageSkeleton, Textarea } from "@/components/ui";

export const metadata: Metadata = { title: "Player directory" };

/** The directory is shared by every organiser, so the list is capped and searched rather than shown in full. */
const LIST_LIMIT = 200;

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
  const contains = (value: string) => ({ contains: value, mode: "insensitive" as const });
  const where = query
    ? {
        OR: [
          { firstName: contains(query) },
          { lastName: contains(query) },
          { nickname: contains(query) },
          { homeClub: contains(query) },
          // "First Last" searches
          ...(query.includes(" ")
            ? [{ AND: [{ firstName: contains(query.split(/\s+/)[0]) }, { lastName: contains(query.split(/\s+/).slice(1).join(" ")) }] }]
            : []),
        ],
      }
    : {};
  const [players, total] = await Promise.all([
    db.player.findMany({
      where,
      include: { _count: { select: { entries: true } }, ranks: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: LIST_LIMIT,
    }),
    db.player.count({ where }),
  ]);
  const admin = user.directoryAdmin;

  return (
    <div>
      <PageHeader
        title="Player directory"
        subtitle={
          <>
            Shared by every organiser and venue.{" "}
            {admin ? "You're a directory admin: you can edit players and rankings." : "Rankings and player records are managed by directory admins."}
          </>
        }
        actions={
          admin && (
            <ButtonLink href="/admin/players/ranks" variant="secondary">
              Handicap ranks
            </ButtonLink>
          )
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card>
          <form className="border-b border-border p-3">
            <Input name="q" defaultValue={query} placeholder="Search by name, nickname or home club…" />
          </form>
          <p className="border-b border-border px-5 py-2 text-sm text-muted">
            {total === 0
              ? null
              : total > players.length
                ? `Showing the first ${players.length} of ${total}: search to narrow down.`
                : `${total} ${query ? "matching" : "players"}`}
          </p>
          {players.length === 0 ? (
            <EmptyState title={query ? "No players match" : "No players yet"}>
              {query ? "Check the spelling, or add them using the form." : "Add players using the form."}
            </EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {players.map((p) => (
                <li key={p.id}>
                  <Link href={`/admin/players/${p.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 hover:bg-surface-2">
                    <span className="flex-1 font-medium">
                      {playerName(p)}
                      {p.nickname && <span className="ml-2 text-sm font-normal text-muted">“{p.nickname}”</span>}
                      {p.homeClub && <span className="ml-2 text-sm font-normal text-muted">· {p.homeClub}</span>}
                    </span>
                    <span className="flex flex-wrap gap-1">
                      {p.ranks.map((r) => (
                        <Badge key={r.discipline}>
                          {DISCIPLINES[r.discipline as Discipline] ?? r.discipline} R{r.rank}
                        </Badge>
                      ))}
                    </span>
                    <span className="w-24 text-right text-xs text-muted">{p._count.entries} comps</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Add a player" subtitle="Search first: they may already be in the directory from another club." />
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
              <Field label="Home club" hint="Optional: helps tell apart people with the same name">
                <Input name="homeClub" placeholder={user.organizationName} />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="differentPerson" />
                This is a different person from an existing player with the same name
              </label>
              <SubmitButton>Add player</SubmitButton>
            </ActionForm>
          </Card>
          {admin && (
            <Card>
              <CardHeader title="Bulk import" subtitle="One per line: “First Last” or “Last, First”. Names already in the directory are skipped." />
              <ActionForm action={importPlayers} className="space-y-3 p-5" resetOnSuccess>
                <Textarea name="names" rows={6} placeholder={"Shane Van Boening\nKaren Corr"} />
                <SubmitButton variant="secondary">Import</SubmitButton>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
