import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { mlbHeadshotUrl, getInitials } from "@/lib/images";
import { cn } from "@/lib/utils";

interface PlayerAvatarProps {
  name: string;
  mlbId?: number | string | null;
  className?: string;
  size?: "sm" | "default" | "lg";
}

export function PlayerAvatar({ name, mlbId, className, size = "default" }: PlayerAvatarProps) {
  const headshotUrl = mlbId ? mlbHeadshotUrl(mlbId) : "";
  return (
    <Avatar size={size} className={cn(className)}>
      {headshotUrl && <AvatarImage src={headshotUrl} alt={name} />}
      <AvatarFallback>{getInitials(name)}</AvatarFallback>
    </Avatar>
  );
}
