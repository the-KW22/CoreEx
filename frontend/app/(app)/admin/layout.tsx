import Link from "next/link";

// The Admin area: Invites, Users and the Overview. Each page asks the API, which refuses non-admins on its own.
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <>
      <nav aria-label="Admin" className="admin-nav">
        <Link href="/admin">Invites</Link>
        <Link href="/admin/users">Users</Link>
        <Link href="/admin/overview">Overview</Link>
      </nav>
      {children}
    </>
  );
}
