/**
 * The venue tables a comp plays on, in venue order: the ones picked for it, or all of them when
 * none are picked (or none of the picked ones are still at the venue).
 */
export function compTables<T extends { id: string }>(venueTables: T[], tableIds: string[]): T[] {
  const picked = venueTables.filter((t) => tableIds.includes(t.id));
  return picked.length ? picked : venueTables;
}
