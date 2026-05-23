import { ArrowUp, Paperclip, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function ChatInput() {
  return (
    <form className="flex w-full max-w-3xl flex-col gap-3 border border-paper/15 bg-ink p-3">
      <Textarea
        aria-label="Chat prompt"
        className="min-h-24 border-0 bg-transparent px-1 py-1 text-base text-paper placeholder:text-paper/40 focus-visible:border-transparent focus-visible:ring-0 md:text-base"
        placeholder="Ask about a matter, deadline, document, or workflow..."
      />

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            aria-label="Attach file"
            className="rounded-none border-paper/15 bg-ink text-paper hover:bg-paper hover:text-ink"
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <Paperclip data-icon="inline-start" />
          </Button>
          <Button
            className="rounded-none border-paper/15 bg-ink text-paper/70 hover:bg-paper hover:text-ink"
            type="button"
            variant="ghost"
          >
            <SlidersHorizontal data-icon="inline-start" />
            Review mode
          </Button>
        </div>

        <Button
          aria-label="Send message"
          className="rounded-none bg-paper text-ink hover:bg-paper/90"
          size="icon-sm"
          type="submit"
        >
          <ArrowUp data-icon="inline-start" />
        </Button>
      </div>
    </form>
  );
}
