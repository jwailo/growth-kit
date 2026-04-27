"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, Loader2 } from "lucide-react";

type State =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "done" }
  | { kind: "error"; message: string };

export function UnsubscribeForm({
  token,
  firstName,
  alreadyOptedOut,
}: {
  token: string;
  firstName: string | null;
  alreadyOptedOut: boolean;
}) {
  const [state, setState] = useState<State>(
    alreadyOptedOut ? { kind: "done" } : { kind: "idle" },
  );

  async function handleConfirm() {
    setState({ kind: "submitting" });
    try {
      const res = await fetch(`/api/unsubscribe/${token}`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setState({
          kind: "error",
          message: data.error ?? "Something went wrong, please try again.",
        });
        return;
      }
      setState({ kind: "done" });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
    }
  }

  if (state.kind === "done") {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-green-100">
          <Check className="size-6 text-green-600" />
        </div>
        <h2 className="text-base font-semibold text-[#1C1E26]">
          You&apos;ve been unsubscribed
        </h2>
        <p className="mt-2 text-sm text-[#9A9BA7]">
          {firstName ? `Thanks ${firstName}. ` : null}You won&apos;t receive any
          more Response Time Champions tiles from us.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-2 text-base font-semibold text-[#1C1E26]">
        {firstName ? `Hi ${firstName},` : "Hi there,"}
      </p>
      <p className="mb-6 text-sm leading-relaxed text-[#292B32]">
        You&apos;ve been unsubscribed from Response Time Champions emails. You
        won&apos;t receive any more tiles from us. Click confirm to finalise.
      </p>
      {state.kind === "error" && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.message}
        </p>
      )}
      <Button
        onClick={handleConfirm}
        disabled={state.kind === "submitting"}
        className="w-full bg-[#EE0B4F] text-white hover:bg-[#d40945]"
      >
        {state.kind === "submitting" ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Unsubscribing
          </>
        ) : (
          <>Confirm unsubscribe</>
        )}
      </Button>
    </div>
  );
}
