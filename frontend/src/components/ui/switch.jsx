import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"
import { motion } from "motion/react"

import { cn } from "@/lib/utils"
import { tapScale, snappy } from "@/lib/motion"

const MotionSwitchRoot = motion.create(SwitchPrimitives.Root)

const Switch = React.forwardRef(({ className, ...props }, ref) => (
  <MotionSwitchRoot
    whileTap={tapScale}
    transition={snappy}
    className={cn(
      "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
      className
    )}
    {...props}
    ref={ref}>
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0"
      )} />
  </MotionSwitchRoot>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
