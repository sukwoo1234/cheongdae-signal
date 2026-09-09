import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getAdminContext();
  if (!user) {
    redirect("/");
  }
  return <div className="admin-root min-h-screen bg-[#08090b] text-[#e8e8ec]">{children}</div>;
}
