import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "btn focus-ring select-none disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        primary: "btn-primary",
        ghost: "btn-ghost",
        outline: "btn-outline",
        lime: "btn-lime",
        danger: "btn-danger",
      },
      size: {
        sm: "text-[11px] px-3 py-1.5",
        md: "text-[13px] px-4 py-2.5",
        lg: "text-[15px] px-6 py-3",
        icon: "w-9 h-9 p-0",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
  },
);
Button.displayName = "Button";

export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      "peer inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border border-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 data-[state=checked]:bg-brand data-[state=unchecked]:bg-white/10",
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb className="pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg transition-transform data-[state=checked]:translate-x-6 data-[state=unchecked]:translate-x-1" />
  </SwitchPrimitive.Root>
));
Switch.displayName = "Switch";

export const Tabs = TabsPrimitive.Root;
export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List ref={ref} className={cn("inline-flex items-center gap-1 rounded-full bg-black/25 p-1", className)} {...props} />
));
TabsList.displayName = "TabsList";
export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "rounded-full px-4 py-2 text-[12px] font-bold text-muted transition-all hover:text-paper data-[state=active]:bg-brand/18 data-[state=active]:text-paper data-[state=active]:shadow-[inset_0_0_0_1px_hsl(var(--brand)/.35)]",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = "TabsTrigger";
export const TabsContent = TabsPrimitive.Content;

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;
export const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 8, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-[200] rounded-xl border border-white/10 bg-[#1b1824] px-3 py-1.5 text-[11px] font-semibold text-paper shadow-float animate-scale-in",
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = "TooltipContent";

export const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root ref={ref} className={cn("relative flex shrink-0 overflow-hidden rounded-full", className)} {...props} />
));
Avatar.displayName = "Avatar";
export const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn("flex h-full w-full items-center justify-center rounded-full bg-raised font-display font-extrabold text-paper", className)}
    {...props}
  />
));
AvatarFallback.displayName = "AvatarFallback";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-[150] bg-black/65 backdrop-blur-sm data-[state=open]:animate-fade-up" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "glass fixed left-1/2 top-1/2 z-[151] w-[min(520px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-panel p-7 shadow-float animate-scale-in focus:outline-none",
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-5 top-5 grid h-8 w-8 place-items-center rounded-full text-muted transition hover:bg-white/10 hover:text-paper">
        <X size={16} />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = "DialogContent";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-[13px] text-paper outline-none transition placeholder:text-muted/60 focus:border-brand/60 focus:ring-2 focus:ring-brand/15",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "w-full resize-none rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-[13px] leading-relaxed text-paper outline-none transition placeholder:text-muted/60 focus:border-brand/60 focus:ring-2 focus:ring-brand/15",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export function Badge({ className, children, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[.06] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-muted",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-[10px] font-extrabold uppercase tracking-[.14em] text-muted/60", className)}>{children}</p>;
}
