export const inputClass =
  "w-full rounded-md border border-edge bg-background px-3 py-2 text-base focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/30";

export function PrimaryButton({ children, pending }: { children: React.ReactNode; pending?: boolean }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-accent px-4 py-2.5 font-medium text-white hover:bg-accent-hover disabled:opacity-60"
    >
      {pending ? "Saving…" : children}
    </button>
  );
}
