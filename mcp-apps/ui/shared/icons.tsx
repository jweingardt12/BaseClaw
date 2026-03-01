import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Activity01Icon,
  Alert02Icon,
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowLeftRightIcon,
  ArrowRight01Icon,
  ArrowUp01Icon,
  Award02Icon,
  BarChartIcon,
  Calendar01Icon,
  Cancel01Icon,
  CancelCircleIcon,
  ChampionIcon,
  CheckmarkCircle02Icon,
  CheckmarkSquare02Icon,
  Copy01Icon,
  CursorInfo01Icon,
  File01Icon,
  HelpCircleIcon,
  InboxDownloadIcon,
  LinkSquare02Icon,
  LockIcon,
  Maximize01Icon,
  Message01Icon,
  Minimize01Icon,
  MinusSignIcon,
  PlayIcon,
  RefreshIcon,
  ReloadIcon,
  Search01Icon,
  SentIcon,
  Shield01Icon,
  SquareIcon,
  StarIcon,
  Sword01Icon,
  Target01Icon,
  Tick02Icon,
  UserAdd01Icon,
  UserGroupIcon,
  UserMinus01Icon,
  ZapIcon,
  CircleLockCheck01Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

type IconDef = unknown;

export interface AppIconProps extends Omit<React.ComponentProps<"svg">, "ref"> {
  size?: number;
  strokeWidth?: number;
}

export type AppIcon = React.ComponentType<AppIconProps>;

function createIcon(icon: IconDef): AppIcon {
  return function AppIconComponent({ className, size = 16, strokeWidth = 1.8, ...props }: AppIconProps) {
    return (
      <HugeiconsIcon
        icon={icon as any}
        size={size}
        strokeWidth={strokeWidth}
        className={cn("shrink-0", className)}
        {...(props as any)}
      />
    );
  };
}

export const Activity = createIcon(Activity01Icon);
export const AlertTriangle = createIcon(Alert02Icon);
export const ArrowLeft = createIcon(ArrowLeft01Icon);
export const ArrowRight = createIcon(ArrowRight01Icon);
export const ArrowRightLeft = createIcon(ArrowLeftRightIcon);
export const ArrowUp = createIcon(ArrowUp01Icon);
export const Award = createIcon(Award02Icon);
export const BarChart3 = createIcon(BarChartIcon);
export const Check = createIcon(Tick02Icon);
export const CheckCircle = createIcon(CheckmarkCircle02Icon);
export const CheckSquare = createIcon(CheckmarkSquare02Icon);
export const ChevronLeft = createIcon(ArrowLeft01Icon);
export const ChevronRight = createIcon(ArrowRight01Icon);
export const Copy = createIcon(Copy01Icon);
export const ExternalLink = createIcon(LinkSquare02Icon);
export const FileText = createIcon(File01Icon);
export const FlaskConical = createIcon(Alert02Icon);
export const HelpCircle = createIcon(HelpCircleIcon);
export const Inbox = createIcon(InboxDownloadIcon);
export const Info = createIcon(CursorInfo01Icon);
export const Loader2 = createIcon(ReloadIcon);
export const Lock = createIcon(LockIcon);
export const Maximize2 = createIcon(Maximize01Icon);
export const MessageSquare = createIcon(Message01Icon);
export const Minimize2 = createIcon(Minimize01Icon);
export const Minus = createIcon(MinusSignIcon);
export const Play = createIcon(PlayIcon);
export const RefreshCw = createIcon(RefreshIcon);
export const Search = createIcon(Search01Icon);
export const Send = createIcon(SentIcon);
export const Shield = createIcon(Shield01Icon);
export const ShieldCheck = createIcon(CircleLockCheck01Icon);
export const Square = createIcon(SquareIcon);
export const Star = createIcon(StarIcon);
export const Swords = createIcon(Sword01Icon);
export const Calendar = createIcon(Calendar01Icon);
export const Target = createIcon(Target01Icon);
export const TrendingDown = createIcon(ArrowDown01Icon);
export const TrendingUp = createIcon(ArrowUp01Icon);
export const Trophy = createIcon(ChampionIcon);
export const UserMinus = createIcon(UserMinus01Icon);
export const UserPlus = createIcon(UserAdd01Icon);
export const Users = createIcon(UserGroupIcon);
export const X = createIcon(Cancel01Icon);
export const XCircle = createIcon(CancelCircleIcon);
export const Sparkles = createIcon(StarIcon);
export const Zap = createIcon(ZapIcon);
