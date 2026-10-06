import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const tones = {
  default: "bg-raised border border-line hover:border-mist/50",
  accent: "bg-accent text-ink font-semibold hover:brightness-110",
  ghost: "bg-transparent border border-transparent hover:bg-raised text-mist",
  danger: "bg-transparent border border-red-400/40 text-red-300 hover:bg-red-500/10",
};

export function Button({
  tone = "default",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: keyof typeof tones }) {
  return (
    <button
      {...props}
      className={`rounded-md px-3 py-1.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${tones[tone]} ${className}`}
    />
  );
}

export function TextInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-md border border-line bg-ink px-2 py-1.5 text-sm outline-none focus:border-accent2 ${className}`}
    />
  );
}

export function TextArea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-md border border-line bg-ink px-2 py-2 text-sm outline-none focus:border-accent2 ${className}`}
    />
  );
}

export function SelectInput({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-md border border-line bg-ink px-2 py-1.5 text-sm outline-none focus:border-accent2 ${className}`}
    />
  );
}

export function Panel({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-panel">
      <header className="flex items-center justify-between border-b border-line px-3 py-2">
        <h2 className="text-sm font-medium">{title}</h2>
        {action}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}
