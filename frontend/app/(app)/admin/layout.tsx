import { AdminTabs } from "./admin-tabs";

// The Admin area: Overview, Users and Invites. Each page asks the API, which refuses non-admins on its own.
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <header className="grid gap-3">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Admin</h1>
        <AdminTabs />
      </header>
      {children}
    </div>
  );
}
