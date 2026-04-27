import { db } from "@/db";
import { gkPms } from "@/db/schema/tile-engine";
import { eq } from "drizzle-orm";
import { UnsubscribeForm } from "./unsubscribe-form";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let firstName: string | null = null;
  let alreadyOptedOut = false;
  let valid = false;

  if (UUID_RE.test(token)) {
    const [pm] = await db
      .select({
        firstName: gkPms.firstName,
        optedOut: gkPms.optedOut,
      })
      .from(gkPms)
      .where(eq(gkPms.id, token));
    if (pm) {
      valid = true;
      firstName = pm.firstName;
      alreadyOptedOut = pm.optedOut;
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F7F7] px-4 py-12">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold text-[#1C1E26]">
            Response Time Champions
          </h1>
          <p className="mt-1 text-xs uppercase tracking-wider text-[#9A9BA7]">
            Powered by Ailo
          </p>
        </div>

        {!valid ? (
          <div className="text-center">
            <p className="text-sm text-[#292B32]">
              This unsubscribe link isn&apos;t valid. If you were trying to opt
              out, please reply to the email and we&apos;ll take care of it.
            </p>
          </div>
        ) : (
          <UnsubscribeForm
            token={token}
            firstName={firstName}
            alreadyOptedOut={alreadyOptedOut}
          />
        )}
      </div>
    </div>
  );
}
