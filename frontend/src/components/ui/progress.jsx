import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"
import { motion } from "motion/react"

import { cn } from "@/lib/utils"
import { snappy } from "@/lib/motion"

const MotionIndicator = motion.create(ProgressPrimitive.Indicator)

// `indeterminate`: total is unknown (a plain paste-and-go download never gets
// one), so a running job still reads as "actively working" via a sweeping
// bar instead of showing nothing at all.
const Progress = React.forwardRef(({ className, value, indeterminate, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn(
      "relative h-2 w-full overflow-hidden rounded-full bg-primary/20",
      className
    )}
    value={indeterminate ? null : value}
    {...props}>
    {indeterminate ? (
      <motion.div
        className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-primary"
        animate={{ left: ['-33%', '100%'] }}
        transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
      />
    ) : (
      <MotionIndicator
        className="h-full w-full flex-1 bg-primary"
        animate={{ x: `${-(100 - (value || 0))}%` }}
        transition={snappy}
      />
    )}
  </ProgressPrimitive.Root>
))
Progress.displayName = ProgressPrimitive.Root.displayName

export { Progress }
