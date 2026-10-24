import { useEffect, useRef, useState } from "react";
import { getYouTubeEmbedUrl } from "@/lib/youtubeEmbed";
import { Play, RotateCcw } from "lucide-react";

declare global {
  interface Window {
    YT?: {
      Player: new (element: HTMLElement | string, options: {
        events?: {
          onReady?: (event: { target: YouTubePlayerInstance }) => void;
          onStateChange?: (event: { data: number }) => void;
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
  destroy: () => void;
};

let youtubeApiPromise: Promise<void> | null = null;
function loadYouTubeIframeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (!youtubeApiPromise) {
    youtubeApiPromise = new Promise((resolve) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        resolve();
      };
      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        script.async = true;
        document.head.appendChild(script);
      }
    });
  }
  return youtubeApiPromise;
}

type Props = {
  videoId: string;
  title?: string;
  autoplay?: boolean;
  className?: string;
};

export default function YouTubeEmbedPlayer({ videoId, title = "Course video", autoplay = false, className = "" }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YouTubePlayerInstance | null>(null);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    setEnded(false);
    let cancelled = false;
    let player: YouTubePlayerInstance | null = null;
    void loadYouTubeIframeApi().then(() => {
      if (cancelled || !mountRef.current || !window.YT) return;
      const iframe = document.createElement("iframe");
      iframe.title = title;
      iframe.src = getYouTubeEmbedUrl(videoId, { autoplay });
      iframe.className = "absolute inset-0 h-full w-full border-0";
      iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
      iframe.referrerPolicy = "strict-origin-when-cross-origin";
      iframe.allowFullscreen = true;
      iframe.id = "youtube-player-" + Math.random().toString(36).slice(2);
      mountRef.current.replaceChildren(iframe);
      player = new window.YT.Player(iframe, {
        events: {
          onReady: () => { playerRef.current = player; },
          onStateChange: (event) => setEnded(event.data === window.YT?.PlayerState.ENDED),
        },
      });
      playerRef.current = player;
    });
    return () => {
      cancelled = true;
      try { player?.destroy(); } catch { /* player may not have initialized */ }
      playerRef.current = null;
    };
  }, [videoId, title, autoplay]);

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
