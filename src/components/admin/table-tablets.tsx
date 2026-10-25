import "server-only";
import { networkInterfaces } from "node:os";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { cancelPairing, createPairingCode, unpairDevice } from "@/actions/venues";
import { ActionButton } from "@/components/forms";
import { Card, CardHeader } from "@/components/ui";
import { PollRefresh } from "./poll-refresh";

type TableWithDevices = {
  id: string;
  name: string;
  pairingCode: string | null;
  pairingExpiresAt: Date | null;
  devices: { id: string; name: string; lastSeenAt: Date | null }[];
};

// Server component rendered per request, so reading the clock is intended.
const requestTime = () => Date.now();

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

// VPN and virtual adapters a tablet on the venue wifi can't reach.
const VIRTUAL_ADAPTER = /vpn|nord|lynx|wireguard|wg\d|tun|tap|tailscale|zerotier|vethernet|virtual|vmware|vbox|docker|wsl|hyper-v/i;

/** This machine's private IPv4 address on the local network, for when the admin is browsing via localhost. */
function lanAddress() {
  const candidates: { address: string; rank: number }[] = [];
  for (const [name, addresses] of Object.entries(networkInterfaces())) {
    if (VIRTUAL_ADAPTER.test(name)) continue;
    for (const a of addresses ?? []) {
      if (a.family !== "IPv4" || a.internal) continue;
      // Home and venue routers almost always hand out 192.168.x.x.
      const rank = a.address.startsWith("192.168.") ? 0 : a.address.startsWith("10.") ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(a.address) ? 2 : -1;
      if (rank >= 0) candidates.push({ address: a.address, rank });
    }
  }
  return candidates.sort((a, b) => a.rank - b.rank)[0]?.address ?? null;
}

/** The base URL a tablet on the venue network should open. */
async function tabletBaseUrl() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const [hostname, port] = host.split(/:(?=\d+$)/);
  if (!LOCAL_HOSTS.has(hostname)) return { url: `${proto}://${host}`, local: false };
  const lan = lanAddress();
  return { url: lan ? `${proto}://${lan}${port ? `:${port}` : ""}` : `${proto}://${host}`, local: !lan };
}

function lastSeen(date: Date | null, now: number) {
  if (!date) return "never connected";
  const mins = Math.round((now - date.getTime()) / 60000);
  if (mins < 2) return "online";
  if (mins < 60) return `seen ${mins} min ago`;
  if (mins < 60 * 24) return `seen ${Math.round(mins / 60)} h ago`;
  return `seen ${date.toLocaleDateString("en-GB")}`;
}

export async function TableTablets({ tables }: { tables: TableWithDevices[] }) {
  const { url: base, local } = await tabletBaseUrl();
  const now = requestTime();
  const pairing = tables.filter((t) => t.pairingCode && t.pairingExpiresAt && t.pairingExpiresAt.getTime() > now);
  const qrCodes = new Map(
    await Promise.all(
      pairing.map(async (t) => {
        const svg = await QRCode.toString(`${base}/table?code=${t.pairingCode}`, { type: "svg", margin: 1, width: 176 });
        return [t.id, svg] as const;
      }),
    ),
  );

  return (
    <Card>
      <CardHeader
        title="Table tablets"
        subtitle={
          <>
            Pair a tablet with each table. It loads every match assigned to that table automatically, and players score
            their own matches on it. Tablets open <span className="font-mono text-foreground">{base}/table</span>
          </>
        }
      />
      {local && (
        <p className="mx-5 mt-4 rounded-lg bg-warn/15 px-4 py-3 text-sm text-warn">
          Tablets can&apos;t reach &quot;localhost&quot;. Open this page using this computer&apos;s network address instead.
        </p>
      )}
      {pairing.length > 0 && <PollRefresh intervalMs={3000} />}
      <ul className="divide-y divide-border">
        {tables.map((table) => {
          const svg = qrCodes.get(table.id);
          return (
            <li key={table.id} className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="w-28 font-semibold">{table.name}</span>
                <div className="flex flex-1 flex-wrap gap-2">
                  {table.devices.length === 0 && !svg && <span className="text-sm text-muted">No tablet</span>}
                  {table.devices.map((d) => {
                    const status = lastSeen(d.lastSeenAt, now);
                    return (
                      <span key={d.id} className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-2 py-1 pr-1 pl-3 text-sm">
                        <span className={`h-2 w-2 rounded-full ${status === "online" ? "bg-accent" : "bg-muted/50"}`} />
                        {d.name}
                        <span className="text-muted">· {status}</span>
                        <ActionButton
                          action={unpairDevice.bind(null, d.id)}
                          variant="ghost"
                          className="px-2 py-0.5 text-xs text-live"
                          confirm={`Unpair ${d.name}? It will stop showing ${table.name}.`}
                        >
                          Unpair
                        </ActionButton>
                      </span>
                    );
                  })}
                </div>
                {!svg && (
                  <ActionButton action={createPairingCode.bind(null, table.id)} variant="secondary" className="py-1.5">
                    {table.devices.length ? "Pair another" : "Pair a tablet"}
                  </ActionButton>
                )}
              </div>
              {svg && (
                <div className="mt-4 flex flex-wrap items-center gap-6 rounded-xl border-2 border-dashed border-accent/50 bg-accent-soft/40 p-4">
                  <div className="rounded-lg bg-white p-1" dangerouslySetInnerHTML={{ __html: svg }} />
                  <div className="space-y-2">
                    <p className="text-sm text-muted">
                      Scan with the tablet&apos;s camera, or open <span className="font-mono text-foreground">{base}/table</span> and enter:
                    </p>
                    <p className="font-mono text-4xl font-bold tracking-[0.3em]">{table.pairingCode}</p>
                    <p className="text-sm text-muted">
                      Expires at {table.pairingExpiresAt!.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}. Single use.
                    </p>
                    <ActionButton action={cancelPairing.bind(null, table.id)} variant="ghost" className="px-0 text-sm text-muted">
                      Cancel
                    </ActionButton>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
