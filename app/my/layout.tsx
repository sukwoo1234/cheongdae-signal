import { redirect } from "next/navigation";
import { getActiveUser } from "@/lib/auth";

export default async function MyPagesLayout({ children }: { children: React.ReactNode }) {
  const { denial } = await getActiveUser();

  if (denial) {
    redirect("/");
  }

  return children;
}
