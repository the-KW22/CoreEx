import { TAG_COLOURS, type TagColour } from "./tag-colour";

export type Segment = { label: string; bytes: number; colour: TagColour };

// The Admin storage bar: the biggest Users get a colour each and everyone else is "Others". `totalBytes` is what the
// whole system stores, so Users beyond the ones listed still count as "Others".
export function storageSegments(users: { email: string; storageUsedBytes: number }[], totalBytes: number): Segment[] {
  const biggest = users
    .filter((u) => u.storageUsedBytes > 0)
    .sort((a, b) => b.storageUsedBytes - a.storageUsedBytes)
    .slice(0, TAG_COLOURS.length - 1)
    .map((u, i) => ({ label: u.email, bytes: u.storageUsedBytes, colour: TAG_COLOURS[i] }));
  const others = totalBytes - biggest.reduce((sum, s) => sum + s.bytes, 0);
  return others > 0 ? [...biggest, { label: "Others", bytes: others, colour: TAG_COLOURS[TAG_COLOURS.length - 1] }] : biggest;
}
