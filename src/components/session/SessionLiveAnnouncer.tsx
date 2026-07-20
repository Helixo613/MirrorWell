export interface SessionLiveAnnouncerProps {
  message: string;
}

/** Screen-reader-only updates for rep completion and ease-off cues. */
export function SessionLiveAnnouncer({ message }: SessionLiveAnnouncerProps) {
  return (
    <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {message}
    </p>
  );
}
