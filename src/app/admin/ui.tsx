export const inputClass =
  "w-full rounded-md border border-line bg-card px-3 py-2 text-base focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/30";

export function PrimaryButton({ children, pending }: { children: React.ReactNode; pending?: boolean }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-foreground px-4 py-2.5 font-semibold text-card hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Saving…" : children}
    </button>
  );
}
