import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-md)] text-sm font-semibold transition-[background,transform,color,box-shadow] disabled:pointer-events-none disabled:opacity-60 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none aria-invalid:ring-destructive/25 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-sm hover:bg-[color-mix(in_oklab,var(--primary)_90%,black)] focus-visible:ring-ring/60',
        primary:
          'bg-primary text-primary-foreground shadow-sm hover:bg-[color-mix(in_oklab,var(--primary)_90%,black)] focus-visible:ring-ring/60',
        secondary:
          'bg-secondary text-secondary-foreground border border-border hover:bg-[color-mix(in_oklab,var(--secondary)_94%,var(--foreground)_6%)]',
        destructive:
          'bg-destructive text-destructive-foreground shadow-sm hover:bg-[color-mix(in_oklab,var(--destructive)_90%,black)] focus-visible:ring-destructive/40',
        danger:
          'bg-destructive text-destructive-foreground shadow-sm hover:bg-[color-mix(in_oklab,var(--destructive)_90%,black)] focus-visible:ring-destructive/40',
        outline:
          'border border-border bg-card text-foreground shadow-xs hover:bg-muted/60',
        ghost:
          'text-foreground hover:bg-muted/70',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-[var(--control-height)] px-4 has-[>svg]:px-3',
        sm: 'h-[var(--control-height-sm)] rounded-[var(--radius-sm)] gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-[var(--control-height-lg)] rounded-[var(--radius-lg)] px-6 has-[>svg]:px-4',
        icon: 'size-[var(--control-height)]',
        'icon-sm': 'size-[var(--control-height-sm)]',
        'icon-lg': 'size-[var(--control-height-lg)]',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
)

const Button = React.forwardRef<
  React.ElementRef<'button'>,
  React.ComponentPropsWithoutRef<'button'> &
    VariantProps<typeof buttonVariants> & {
      asChild?: boolean
    }
>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      ref={ref}
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
})

Button.displayName = 'Button'

export { Button, buttonVariants }

