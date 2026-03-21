import { cn } from '../lib/utils'

export function Text({ className, ...props }: React.ComponentPropsWithoutRef<'p'>) {
  return (
    <p
      data-slot="text"
      {...props}
      className={cn('text-base/6 text-muted-foreground sm:text-sm/6', className)}
    />
  )
}
