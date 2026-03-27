import { cn } from '../lib/utils'

export function Text({ className, ...props }: React.ComponentPropsWithoutRef<'p'>) {
  return (
    <p
      data-slot="text"
      {...props}
      className={cn('text-sm/6 text-muted-foreground sm:text-base/6', className)}
    />
  )
}
