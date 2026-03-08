import { useState, useRef, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Send, Loader2 } from "lucide-react";
import { postChat } from "@/lib/api";
import { useIsMobile } from "@/hooks/use-mobile";

interface Message {
  role: "user" | "assistant";
  content: string;
  toolCalls?: string[];
}

const quickPrompts = [
  "Who should I start today?",
  "Any waiver wire targets?",
  "Analyze my matchup",
  "Roster advice",
];

export function ChatPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  function handleSend(text?: string) {
    const msg = text || input.trim();
    if (!msg || streaming) return;
    setInput("");
    const userMsg: Message = { role: "user", content: msg };
    setMessages((prev) => [...prev, userMsg]);
    setStreaming(true);

    const assistantMsg: Message = { role: "assistant", content: "", toolCalls: [] };
    setMessages((prev) => [...prev, assistantMsg]);

    abortRef.current = postChat(
      msg,
      (chunk) => {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.role === "assistant") {
            last.content += chunk;
          }
          return updated;
        });
      },
      (tool) => {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.role === "assistant") {
            last.toolCalls = [...(last.toolCalls || []), tool];
          }
          return updated;
        });
      }
    );

    // SSE will close on its own; set streaming false after a timeout or when done
    setTimeout(() => setStreaming(false), 30000);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={isMobile ? "bottom" : "right"} className={isMobile ? "h-[80vh]" : "w-[400px] sm:w-[440px]"}>
        <SheetHeader>
          <SheetTitle>BaseClaw Chat</SheetTitle>
        </SheetHeader>
        <div className="flex h-full flex-col gap-3 pt-4">
          <ScrollArea className="flex-1 pr-4" ref={scrollRef}>
            <div className="space-y-4">
              {messages.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Ask me anything about your fantasy team.
                </p>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-1">
                        {msg.toolCalls.map((tool, j) => (
                          <Badge key={j} variant="outline" className="text-xs">
                            {tool}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <p className="whitespace-pre-wrap">{msg.content || (streaming && msg.role === "assistant" ? "..." : "")}</p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="flex flex-wrap gap-1.5 pb-1">
            {quickPrompts.map((p) => (
              <Button key={p} variant="outline" size="sm" className="text-xs" onClick={() => handleSend(p)}>
                {p}
              </Button>
            ))}
          </div>

          <div className="flex gap-2 pb-4">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your team..."
              className="min-h-[40px] max-h-[120px] resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <Button size="icon" onClick={() => handleSend()} disabled={streaming || !input.trim()}>
              {streaming ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
