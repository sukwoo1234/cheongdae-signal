import { redirect } from "next/navigation";
import { getActiveUser } from "@/lib/auth";

export default async function BoardLayout({ children }: { children: React.ReactNode }) {
  const { denial } = await getActiveUser();

  if (denial) {
    redirect("/");
  }

  return children;
}
