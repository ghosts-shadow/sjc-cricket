"use client";

import Link from "next/link";
import { useActionState } from "react";
import { clearScoring, reopenScoring, type FormState } from "../../actions";

/** Organiser controls for a match's live scoring: unlock a submitted scorer, or wipe it. */
export function ScoringControls({
  matchNo,
  session,
}: {
  matchNo: number;
  /** by = the last login to send balls (or submit) from the scorer. */
  session: { submitted: boolean; balls: number; by: string | null; at: string } | null;
}) {
  const [reopenState, reopen, reopening] = useActionState<FormState, FormData>(reopenScoring, {});
  const [clearState, clear, clearing] = useActionState<FormState, FormData>(clearScoring, {});
  const message = clearState.message ?? reopenState.message;
  const error = clearState.error ?? reopenState.error;
  const submitted = session?.submitted ?? false;
  const balls = session?.balls ?? 0;

  return (
    <section className="space-y-3 rounded-lg border border-line bg-card p-4 text-sm shadow-sm">
      <div>
        <h2 className="font-medium">Live scoring</h2>
        <p className="mt-1 text-muted">
          {session
            ? `${balls} ball${balls === 1 ? "" : "s"} scored${submitted ? ", submitted (the scorer is locked)" : ", in progress"}` +
              `${session.by ? ` · last update by ${session.by}, ${session.at}` : ""}. `
            : "No live scoring for this match. "}
          <Link href={`/score/${matchNo}`} className="underline underline-offset-2">
            Open scorer
          </Link>
        </p>
        {session && (
          <p className="mt-1 text-xs text-muted">These don&apos;t change the saved result above. To remove a result, set it to “Not played yet”.</p>
        )}
      </div>

      {session && (
        <div className="flex flex-wrap gap-2">
          {submitted && (
            <form
              action={reopen}
              onSubmit={(e) => {
                if (!window.confirm("Reopen live scoring? The scorer keeps all balls and can submit again.")) e.preventDefault();
              }}
            >
              <input type="hidden" name="matchNo" value={matchNo} />
              <button disabled={reopening} className="rounded-md border border-line bg-soft px-3 py-2 font-medium hover:bg-raised disabled:opacity-60">
                {reopening ? "Reopening…" : "Reopen live scoring"}
              </button>
            </form>
          )}
          <form
            action={clear}
            onSubmit={(e) => {
              if (!window.confirm(`Delete all ${balls} scored balls for this match? The scorer starts again from the toss. This can't be undone.`)) {
                e.preventDefault();
              }
            }}
          >
            <input type="hidden" name="matchNo" value={matchNo} />
            <button disabled={clearing} className="rounded-md border border-danger/60 px-3 py-2 font-medium text-danger hover:bg-danger-tint disabled:opacity-60">
              {clearing ? "Clearing…" : "Clear live scoring"}
            </button>
          </form>
        </div>
      )}

      {error && <p className="text-loss">{error}</p>}
      {message && <p className="text-win">{message}</p>}
    </section>
  );
}
