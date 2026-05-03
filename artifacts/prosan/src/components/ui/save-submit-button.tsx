import * as React from "react";

import { Button, type ButtonProps } from "@/components/ui/button";

export interface DirtySubmitButtonProps extends ButtonProps {
  /** Kaydet / gönder yalnızca form kirliyken etkin (`disabled` ile birleştirilir). */
  dirty: boolean;
}

/** Kaydet — `dirty` false iken devre dışı (kayıtlı değişiklik yok). */
export const DirtySubmitButton = React.forwardRef<HTMLButtonElement, DirtySubmitButtonProps>(
  ({ dirty, children = "Kaydet", type = "submit", variant = "primary", disabled, ...props }, ref) => {
    return (
      <Button ref={ref} type={type} variant={variant} disabled={!dirty || !!disabled} {...props}>
        {children}
      </Button>
    );
  }
);
DirtySubmitButton.displayName = "DirtySubmitButton";
