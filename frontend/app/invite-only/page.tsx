import { AuthCard } from "@/components/auth-card";
import { Button } from "@/components/ui/button";

import { signOut } from "../actions";

export default function InviteOnlyPage() {
  return (
    <AuthCard title="CoreEx is invite-only">
      <p className="text-sm text-muted-foreground">
        This email has no Invite yet. Ask the owner to invite you, then sign in again. If you were removed earlier,
        the owner needs to invite this email again too.
      </p>
      <form action={signOut}>
        <Button type="submit" variant="outline" className="h-10 w-full">
          Log out
        </Button>
      </form>
    </AuthCard>
  );
}
