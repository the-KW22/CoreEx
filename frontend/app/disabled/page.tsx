import { AuthCard } from "@/components/auth-card";
import { Button } from "@/components/ui/button";

import { signOut } from "../actions";

export default function DisabledPage() {
  return (
    <AuthCard title="Your account is disabled">
      <p className="text-sm text-muted-foreground">
        You can no longer sign in to CoreEx. Contact the owner if this is a mistake.
      </p>
      <form action={signOut}>
        <Button type="submit" variant="outline" className="h-10 w-full">
          Log out
        </Button>
      </form>
    </AuthCard>
  );
}
