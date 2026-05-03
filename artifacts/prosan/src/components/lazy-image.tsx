import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";

export type LazyImageProps = ImgHTMLAttributes<HTMLImageElement>;

/**
 * Ürün / vitrin görselleri: `loading="lazy"` + eski tarayıcılar için IntersectionObserver.
 */
export function LazyImage({ src, alt = "", className, ...rest }: LazyImageProps) {
  const ref = useRef<HTMLImageElement>(null);
  const [active, setActive] = useState(
    () => typeof HTMLImageElement !== "undefined" && "loading" in HTMLImageElement.prototype,
  );

  useEffect(() => {
    if (active) return;
    const el = ref.current;
    if (!el || !src) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setActive(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [active, src]);

  return (
    <img
      ref={ref}
      src={active ? src : undefined}
      alt={alt}
      className={className}
      loading={active ? "lazy" : undefined}
      decoding="async"
      {...rest}
    />
  );
}
