import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { teamLogoFromAbbrev, getInitials } from "@/lib/images";
import { cn } from "@/lib/utils";

interface TeamAvatarProps {
  teamName: string;
  teamLogoUrl?: string;
  managerImageUrl?: string;
  abbrev?: string;
  className?: string;
  size?: "sm" | "default" | "lg";
  showManager?: boolean;
}

export function TeamAvatar({
  teamName,
  teamLogoUrl,
  managerImageUrl,
  abbrev,
  className,
  size = "default",
  showManager = false,
}: TeamAvatarProps) {
  const imgUrl = showManager && managerImageUrl
    ? managerImageUrl
    : teamLogoUrl || (abbrev ? teamLogoFromAbbrev(abbrev) ?? "" : "");

  return (
    <Avatar size={size} className={cn("rounded-sm", className)}>
      {imgUrl && <AvatarImage src={imgUrl} alt={teamName} className="object-contain" />}
      <AvatarFallback className="rounded-sm">{getInitials(teamName)}</AvatarFallback>
    </Avatar>
  );
}
