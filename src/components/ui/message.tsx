import { CircleAlert, CircleCheck, Info } from "lucide-react";
import type { ReactNode } from "react";

const TONES = {
  success: { Icon: CircleCheck, role: "status", box: "bg-success-subtle", icon: "text-success" },
  info: { Icon: Info, role: "status", box: "bg-info-subtle", icon: "text-info" },
  danger: { Icon: CircleAlert, role: "alert", box: "bg-danger-subtle", icon: "text-danger" },
} as const;

interface MessageProps {
  tone: keyof typeof TONES;
  className?: string;
  children: ReactNode;
}

/** A short status or alert. The words say what happened; the icon only reinforces them. */
export function Message({ tone, className = "", children }: MessageProps) {
  const { Icon, role, box, icon } = TONES[tone];
  return (
    <p
      role={role}
      className={`flex items-start gap-3 rounded-lg border border-border p-4 text-fg ${box} ${className}`}
    >
      <Icon aria-hidden="true" className={`mt-0.5 size-5 shrink-0 ${icon}`} />
      <span>{children}</span>
    </p>
  );
}
