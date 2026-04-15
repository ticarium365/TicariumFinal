import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface AutocompleteInputProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
  required?: boolean;
}

export function AutocompleteInput({
  id,
  name,
  value,
  onChange,
  suggestions,
  placeholder,
  className,
  required,
}: AutocompleteInputProps) {
  const [open, setOpen] = useState(false);
  const [filtered, setFiltered] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (value.length > 0) {
      const f = suggestions
        .filter((s) => s.toLowerCase().includes(value.toLowerCase()))
        .slice(0, 10);
      setFiltered(f);
      setOpen(f.length > 0);
    } else {
      setFiltered([]);
      setOpen(false);
    }
  }, [value, suggestions]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const select = (s: string) => {
    onChange(s);
    setOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className="relative">
      <Input
        ref={inputRef}
        id={id}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          if (value.length > 0) {
            const f = suggestions
              .filter((s) => s.toLowerCase().includes(value.toLowerCase()))
              .slice(0, 10);
            if (f.length > 0) { setFiltered(f); setOpen(true); }
          }
        }}
        placeholder={placeholder}
        className={className}
        required={required}
        autoComplete="off"
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "ArrowDown" && filtered.length > 0) {
            const el = containerRef.current?.querySelector<HTMLDivElement>("[data-suggestion]");
            el?.focus();
          }
        }}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg overflow-hidden">
          {filtered.map((s, i) => (
            <div
              key={s}
              data-suggestion
              tabIndex={0}
              className="px-3 py-2 text-sm cursor-pointer hover:bg-muted focus:bg-muted outline-none"
              onMouseDown={(e) => { e.preventDefault(); select(s); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") select(s);
                if (e.key === "Escape") { setOpen(false); inputRef.current?.focus(); }
              }}
            >
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
