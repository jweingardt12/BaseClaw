import { Outlet, useLocation, Link } from "react-router-dom";
import { useState } from "react";
import {
  Home,
  Users,
  UserPlus,
  Trophy,
  ArrowLeftRight,
  Brain,
  CalendarDays,
  History,
  MessageSquare,
  Settings,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarInset,
} from "@/components/ui/sidebar";
import { ChatPanel } from "@/components/chat-panel";

const navItems = [
  { title: "Home", icon: Home, path: "/" },
  { title: "Roster", icon: Users, path: "/roster" },
  { title: "Free Agents", icon: UserPlus, path: "/free-agents" },
  { title: "Standings", icon: Trophy, path: "/standings" },
  { title: "Trade Center", icon: ArrowLeftRight, path: "/trade-center" },
  { title: "Intelligence", icon: Brain, path: "/intelligence" },
  { title: "Week Planner", icon: CalendarDays, path: "/week-planner" },
  { title: "League History", icon: History, path: "/league-history" },
  { title: "Settings", icon: Settings, path: "/settings" },
];

export function AppShell() {
  const location = useLocation();
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <SidebarProvider>
      <Sidebar className="hidden md:flex">
        <SidebarHeader>
          <div className="flex items-center gap-2 px-4 py-2">
            <span className="text-lg font-bold tracking-tight">BaseClaw</span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton render={<Link to={item.path} />} isActive={location.pathname === item.path}>
                        <item.icon className="size-4" />
                        <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={() => setChatOpen(true)}>
                    <MessageSquare className="size-4" />
                    <span>Chat</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>

      <SidebarInset>
        <main className="flex-1 overflow-auto p-4 pb-20 md:pb-4">
          <Outlet />
        </main>
      </SidebarInset>

      {/* Mobile bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex md:hidden border-t bg-background">
        {navItems.slice(0, 5).map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`flex flex-1 flex-col items-center gap-1 py-2 text-xs ${
              location.pathname === item.path
                ? "text-primary"
                : "text-muted-foreground"
            }`}
          >
            <item.icon className="size-4" />
            <span className="truncate">{item.title.split(" ")[0]}</span>
          </Link>
        ))}
        <button
          onClick={() => setChatOpen(true)}
          className="flex flex-1 flex-col items-center gap-1 py-2 text-xs text-muted-foreground"
        >
          <MessageSquare className="size-4" />
          <span>Chat</span>
        </button>
      </nav>

      <ChatPanel open={chatOpen} onOpenChange={setChatOpen} />
    </SidebarProvider>
  );
}
