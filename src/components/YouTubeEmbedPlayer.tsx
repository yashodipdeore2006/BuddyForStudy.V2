import { useEffect, useRef, useState } from "react";
import { getYouTubeEmbedUrl } from "@/lib/youtubeEmbed";
import { RotateCcw } from "lucide-react";

declare global {
  interface Window {
    YT?: {
      Player: new (element: HTMLElement | string, options: {
        events?: {
          onReady?: (event: { target: YouTubePlayerInstance }) => void;
          onStateChange?: (event: { data: number; target?: YouTubePlayerInstance }) => void;
        };
      }) => YouTubePlayerInstance;
      PlayerState: { ENDED: number; PLAYING: number; PAUSED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}
type YouTubePlayerInstance = {
  playVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  destroy: () => void;
};

let youtubeApiPromise: Promise<void> | null = null;
function loadYouTubeIframeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (!youtubeApiPromise) {
    youtubeApiPromise = new Promise((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady;
      const timeout = window.setTimeout(() => {
        youtubeApiPromise = null;
        reject(new Error("Timed out loading the YouTube player API"));
      }, 15000);

      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        window.clearTimeout(timeout);
        resolve();
      };

      let script = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
      if (!script) {
        script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        script.async = true;
        document.head.appendChild(script);
      }
      script.addEventListener("error", () => {
        window.clearTimeout(timeout);
        youtubeApiPromise = null;
        reject(new Error("Unable to load the YouTube player API"));
      }, { once: true });
    });
  }
  return youtubeApiPromise;
}

type Props = {
  videoId: string;
  title?: string;
  autoplay?: boolean;
  className?: string;
  onPausedAt?: (seconds: number) => void;
  seekRequest?: { seconds: number; id: number } | null;
};

export default function YouTubeEmbedPlayer({ videoId, title = "Course video", autoplay = false, className = "", onPausedAt, seekRequest }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YouTubePlayerInstance | null>(null);
  const [ended, setEnded] = useState(false);
  const onPausedAtRef = useRef(onPausedAt);
  useEffect(() => { onPausedAtRef.current = onPausedAt; }, [onPausedAt]);

  useEffect(() => {
    setEnded(false);
    playerRef.current = null;
    let cancelled = false;
    let player: YouTubePlayerInstance | null = null;
    const mount = mountRef.current;
    if (!mount || !String(videoId || "").trim()) {
      mount?.replaceChildren();
      return;
    }

    // Render the normal iframe immediately. Playback must still work if the
    // optional IFrame API is blocked by an extension, network policy, or CSP.
    const iframe = document.createElement("iframe");
    iframe.title = title;
    iframe.src = getYouTubeEmbedUrl(videoId, { autoplay });
    iframe.className = "absolute inset-0 h-full w-full border-0";
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.allowFullscreen = true;
    iframe.id = "youtube-player-" + Math.random().toString(36).slice(2);
    mount.replaceChildren(iframe);

    void loadYouTubeIframeApi().then(() => {
      if (cancelled || !mountRef.current || !window.YT) return;
      player = new window.YT.Player(iframe, {
        events: {
          onReady: (event) => {
            if (!cancelled) playerRef.current = event.target;
          },
          onStateChange: (event) => {
            if (cancelled || !window.YT) return;
            setEnded(event.data === window.YT.PlayerState.ENDED);
            if (event.data === window.YT.PlayerState.PAUSED) {
              const seconds = Number(event.target?.getCurrentTime?.());
              if (Number.isFinite(seconds)) onPausedAtRef.current?.(Math.floor(seconds));
            }
          },
        },
      });
      playerRef.current = player;
    }).catch(() => {
      // The iframe itself remains usable; only the custom end screen is unavailable.
    });

    return () => {
      cancelled = true;
      try { player?.destroy(); } catch { /* Player may not have initialized. */ }
      playerRef.current = null;
    };
  }, [videoId, title, autoplay]);

  useEffect(() => {
    if (!seekRequest || !Number.isFinite(seekRequest.seconds)) return;
    playerRef.current?.seekTo(Math.max(0, seekRequest.seconds), true);
  }, [seekRequest?.id]);

  const replay = () => {
    setEnded(false);
    playerRef.current?.seekTo(0, true);
    playerRef.current?.playVideo();
  };

  return (
    <div className={`relative aspect-video w-full overflow-hidden bg-slate-950 ${className}`}>
      <div ref={mountRef} className="absolute inset-0" />
      {ended && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-slate-950/95 p-6 text-center text-white">
          <div className="text-lg font-bold">Lesson completed</div>
          <p className="text-sm text-slate-300">Continue learning on BuddyForStudy.</p>
          <button type="button" onClick={replay} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-slate-200">
            <RotateCcw className="h-4 w-4" /> Replay lesson
          </button>
        </div>
      )}
    </div>
  );
}
