import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden>
      <rect width="32" height="32" rx="9" fill="#111113" />
      <path d="M12 10.5v11a1 1 0 0 0 1.5.86l9-5.5a1 1 0 0 0 0-1.72l-9-5.5A1 1 0 0 0 12 10.5Z" fill="#fff" />
      <circle cx="24.5" cy="7.5" r="3" fill="#FF5C35" stroke="#111113" strokeWidth="1.5" />
    </svg>
  );
}

export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-tight">Demopolish</span>
    </div>
  );
}
