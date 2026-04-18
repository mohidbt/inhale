"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface ReferenceCardProps {
  id: number;
  title: string;
  authors: string | Array<{ name?: string | null }> | null | unknown;
  year: string | null;
  venue: string | null;
  citationCount: number | null;
  abstract: string | null;
  doi: string | null;
  url: string | null;
}

function formatAuthors(raw: ReferenceCardProps["authors"]): string | null {
  if (!raw) return null;
  if (typeof raw === "string") return raw || null;
  if (Array.isArray(raw)) {
    const names = raw
      .map((a) => (a && typeof a === "object" && "name" in a ? (a as { name?: string }).name : null))
      .filter((n): n is string => typeof n === "string" && n.length > 0);
    return names.length ? names.join(", ") : null;
  }
  return null;
}

export function ReferenceCard(props: ReferenceCardProps) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isRemoving, startRemove] = useTransition();

  const abstract =
    props.abstract && props.abstract.length > 300
      ? props.abstract.slice(0, 300) + "…"
      : props.abstract;
  const authorsText = formatAuthors(props.authors);

  function handleRemove() {
    startRemove(async () => {
      const res = await fetch(`/api/library/references/${props.id}`, { method: "DELETE" });
      if (!res.ok) { alert("Failed to remove."); return; }
      setConfirmOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="border rounded-lg p-4 space-y-1.5" data-testid={`reference-card-${props.id}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold leading-snug">{props.title}</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setConfirmOpen(true)}
          data-testid={`reference-remove-${props.id}`}
          aria-label={`Remove ${props.title}`}
        >
          Remove
        </Button>
      </div>

      {authorsText && (
        <p className="text-sm text-muted-foreground line-clamp-1">{authorsText}</p>
      )}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
        {props.year && <span>{props.year}</span>}
        {props.venue && (<>{props.year && <span aria-hidden>·</span>}<span className="italic line-clamp-1">{props.venue}</span></>)}
        {props.citationCount != null && (<>{(props.year || props.venue) && <span aria-hidden>·</span>}<span>{props.citationCount} citations</span></>)}
      </div>

      {abstract && <p className="text-sm text-foreground/80 leading-relaxed pt-1">{abstract}</p>}

      {props.doi && (
        <a href={`https://doi.org/${props.doi}`} target="_blank" rel="noopener noreferrer" className="block truncate text-sm text-blue-600 hover:underline dark:text-blue-400">
          doi:{props.doi}
        </a>
      )}
      {!props.doi && props.url && (
        <a href={props.url} target="_blank" rel="noopener noreferrer" className="block truncate text-sm text-blue-600 hover:underline dark:text-blue-400">
          {props.url}
        </a>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove saved reference?</AlertDialogTitle>
            <AlertDialogDescription className="line-clamp-2">
              {props.title}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleRemove(); }}
              disabled={isRemoving}
              data-testid={`reference-remove-confirm-${props.id}`}
            >
              {isRemoving ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
