"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useLibraryStore } from "@/store/library";
import { toast } from "@/store/toast";
import { LiquidButton } from "@/components/ui/LiquidButton";
import { LiquidDialog } from "@/components/ui/LiquidDialog";
import { LiquidInput } from "@/components/ui/LiquidInput";

export function CreatePlaylistControl({
  label = "New playlist",
  variant = "secondary",
  size = "md",
  className,
}: {
  label?: string;
  variant?: "secondary" | "primary" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const router = useRouter();
  const createPlaylist = useLibraryStore((state) => state.createPlaylist);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const submit = () => {
    const id = createPlaylist(title, description);
    setOpen(false);
    setTitle("");
    setDescription("");
    toast("Playlist created", "success");
    router.push(`/playlist/${id}`);
  };

  return (
    <>
      <LiquidButton
        variant={variant}
        size={size}
        className={className}
        icon={<Plus size={14} />}
        onClick={() => setOpen(true)}
      >
        {label}
      </LiquidButton>
      <LiquidDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Create playlist"
        size="sm"
        footer={
          <>
            <LiquidButton variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </LiquidButton>
            <LiquidButton variant="primary" onClick={submit}>
              Create
            </LiquidButton>
          </>
        }
      >
        <div className="space-y-3">
          <LiquidInput
            label="Name"
            placeholder="e.g. Night bus"
            value={title}
            maxLength={80}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
            }}
          />
          <LiquidInput
            label="Description (optional)"
            placeholder="What is this playlist for?"
            value={description}
            maxLength={280}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
      </LiquidDialog>
    </>
  );
}
