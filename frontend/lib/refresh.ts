import { revalidatePath } from "next/cache";

// What a server action returns once it has run: when it worked, every page is refreshed, since Folders, Tags and
// counts show on all of them.
export const done = (ok: boolean) => {
  if (ok) revalidatePath("/", "layout");
  return ok;
};
