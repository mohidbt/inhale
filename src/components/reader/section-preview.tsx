"use client";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface SectionPreviewProps {
  title: string;
  preview: string;
  children: React.ReactNode;
}

export function SectionPreview({ title, preview, children }: SectionPreviewProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>{children}</TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="font-medium text-xs">{title}</p>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{preview}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
