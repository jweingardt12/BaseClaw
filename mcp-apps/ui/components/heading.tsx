import { cn } from '../lib/utils'

type HeadingProps = { level?: 1 | 2 | 3 | 4 | 5 | 6 } & React.ComponentPropsWithoutRef<
  'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
>

export function Heading({ className, level = 1, ...props }: HeadingProps) {
  var Element: `h${typeof level}` = `h${level}`

  return (
    <Element
      {...props}
      className={cn('text-lg/7 font-semibold text-foreground sm:text-xl/8', className)}
    />
  )
}

export function Subheading({ className, level = 2, ...props }: HeadingProps) {
  var Element: `h${typeof level}` = `h${level}`

  return (
    <Element
      {...props}
      className={cn('text-sm/6 font-semibold text-foreground sm:text-base/7', className)}
    />
  )
}
