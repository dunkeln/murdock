import * as React from "react";

import { cn } from "@/lib/utils";

type PageContainerProps = React.ComponentProps<"div">;

export function PageContainer({ className, ...props }: PageContainerProps) {
  return (
    <div
      className={cn("mx-auto w-full max-w-6xl px-6 lg:px-8", className)}
      {...props}
    />
  );
}
