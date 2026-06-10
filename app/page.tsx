import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getFirstDocumentId } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login");

  const docId = getFirstDocumentId();
  if (!docId) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">문서가 없습니다.</p>
      </main>
    );
  }
  redirect(`/doc/${docId}`);
}
