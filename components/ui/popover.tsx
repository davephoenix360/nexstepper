"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * Popover — shadcn new-york style, built on the Radix UI primitive.
 *
 * Used by the inline-issue surface (`lib/inline-issue/inline-issue-popover.tsx`)
 * to anchor AI rewrite suggestions to the affected EditableText leaf. The
 * Radix primitive handles focus trapping, outside-click dismissal, and
 * Escape-to-close out of the box.
 *
 * Conventions (match the rest of the shadcn UI in this repo):
 *  - `data-slot` on every primitive so consumers can target sub-pieces.
 *  - Portal'd content so the popover escapes any `overflow: hidden`
 *    ancestors (the editor's print-mode container is one).
 *  - `text-balance` on the bubble so the line wraps gracefully.
 *  - `z-50` to sit above sheet/modal overlays but below the toast layer.
 *
 * Why Radix Popover (and not a hand-rolled popover): the inline-issue
 * surface is the only place this primitive is used, and rolling our own
 * focus trap + outside-click handler is exactly the kind of thing that
 * drifts under iterative copy-and-paste. Radix already covers keyboard
 * a11y (Escape, Tab, focus restoration) and we get it without a homegrown
 * a11y audit.
 */
function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 8,
  children,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-72 origin-(--radix-popover-content-transform-origin) rounded-md border p-3 shadow-md outline-none",
          className
        )}
        {...props}
      >
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}

function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };