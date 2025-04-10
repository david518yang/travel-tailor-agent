import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Textarea } from "./textarea";

interface ChatListProps {
  children: React.ReactNode;
  className?: string;
}

export function ChatList({ children, className }: ChatListProps) {
  return <div className={cn("space-y-4", className)}>{children}</div>;
}

interface ChatMessageProps {
  role: "user" | "assistant";
  children: React.ReactNode;
  className?: string;
}

export function ChatMessage({ role, children, className }: ChatMessageProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-4 p-4 rounded-lg",
        role === "user" ? "bg-muted" : "bg-background border",
        className
      )}
    >
      <div className="flex-1">{children}</div>
    </div>
  );
}

interface ChatInputProps
  extends React.ComponentPropsWithoutRef<typeof Textarea> {
  onSend?: () => void;
}

export function ChatInput({ onSend, className, ...props }: ChatInputProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend?.();
    }
  };

  return (
    <div className="flex gap-2">
      <Textarea
        ref={textareaRef}
        rows={1}
        className={cn("min-h-[44px] w-full resize-none px-4 py-3", className)}
        onKeyDown={handleKeyDown}
        {...props}
      />
      <Button
        type="submit"
        size="icon"
        onClick={onSend}
        className="h-[44px] w-[44px]"
      >
        Send
      </Button>
    </div>
  );
}
