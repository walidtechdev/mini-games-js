import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { isRasterImage } from "../lib/images";
import { useStudio } from "../store";

export function DropImage({
  onFile,
  children,
  label = "Drop a PNG, WebP, or JPEG, or choose a file",
  className = "",
}: {
  onFile: (file: File) => void;
  children?: ReactNode;
  label?: string;
  className?: string;
}) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pushToast = useStudio((state) => state.pushToast);

  function take(file: File | undefined): void {
    if (!file) return;
    if (!isRasterImage(file)) {
      pushToast("Only PNG, WebP, and JPEG images can be dropped here.", "error");
      return;
    }
    onFile(file);
  }

  function allow(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    event.stopPropagation();
    setOver(true);
  }

  return (
    <div
      className={`rounded-md border border-dashed ${over ? "border-accent bg-accent/10" : "border-line"} ${className}`}
      onDragEnter={allow}
      onDragOver={allow}
      onDragLeave={(event) => {
        event.preventDefault();
        setOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setOver(false);
        take(event.dataTransfer.files[0]);
      }}
    >
      {children}
      <button type="button" className="block w-full px-2 py-2 text-left text-xs text-mist" onClick={() => inputRef.current?.click()}>
        {label}
      </button>
      <input
        ref={inputRef}
        className="hidden"
        type="file"
        accept="image/png,image/webp,image/jpeg,.png,.webp,.jpg,.jpeg"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          take(file);
        }}
      />
    </div>
  );
}
