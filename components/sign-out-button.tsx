import { logout } from "@/app/login/actions";
import { Button } from "@/components/ui/button";

// A plain <form action={...}> submit — no client component/onClick
// needed, this is a Server Action the browser can post to directly.
export function SignOutButton() {
  return (
    <form action={logout}>
      <Button type="submit" variant="secondary" size="sm">
        Sign Out
      </Button>
    </form>
  );
}
