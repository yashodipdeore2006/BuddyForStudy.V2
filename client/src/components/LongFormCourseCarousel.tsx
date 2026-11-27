import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Clock3, Layers3 } from "lucide-react";
import { Link } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { routes } from "@/lib/routes";
import { selectLongFormCourses, type LongFormCourseCard } from "@/lib/longFormCourses";
import CourseThumbnail from "@/components/CourseThumbnail";
import { getCourseThumbnailProps } from "@/lib/courseThumbnail";
import "@/styles/long-form-course-carousel.css";

type PublicCourseCatalogueResponse = {
  courses?: unknown;
};

function LongFormCourseLink({
  course,
  active,
  dimmed,
  duplicate = false,
  onHover,
  onLeave,
  onFocus,
  onBlur
}: {
  course: LongFormCourseCard;
  active: boolean;
  dimmed: boolean;
  duplicate?: boolean;
  onHover: () => void;
  onLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
}) {
  const className = [
    "bfs-long-form-carousel__card",
    active ? "is-active" : "",
    dimmed ? "is-dimmed" : ""
  ].filter(Boolean).join(" ");

  return (
    <Link
      to={routes.course(course.id)}
      className={className}
      aria-label={"Open " + course.title + ". " + course.durationLabel + ", " + course.moduleCount + " " + (course.moduleCount === 1 ? "module" : "modules") + "."}
      tabIndex={duplicate ? -1 : undefined}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <div className="bfs-long-form-carousel__media" aria-hidden="true">
        <CourseThumbnail {...getCourseThumbnailProps({
          id: course.id,
          title: course.title,
          category: course.category,
          domain: course.domain,
          tags: course.tags,
          level: course.level,
          thumbnail: course.thumbnailUrl,
          cardMetadata: {
            previewThumbnailUrl: course.previewThumbnailUrl,
            previewVideoId: course.previewVideoId,
          },
          modules: course.modules,
          learning_outcomes: course.learning_outcomes,
        })} />
      </div>
      <span className="bfs-long-form-carousel__body">
        <span className="bfs-long-form-carousel__domain">{course.domainTag}</span>
        <span className="bfs-long-form-carousel__title">{course.title}</span>
        <span className="bfs-long-form-carousel__metadata">
          <span className="bfs-long-form-carousel__duration">
            <Clock3 size={14} aria-hidden="true" />
            {course.durationLabel}
          </span>
          <span className="bfs-long-form-carousel__modules">
            <Layers3 size={14} aria-hidden="true" />
            {course.moduleCount} {course.moduleCount === 1 ? "module" : "modules"}
          </span>
        </span>
      </span>
    </Link>
  );
}

export default function LongFormCourseCarousel() {
  const [courses, setCourses] = useState<LongFormCourseCard[]>([]);
  const [hoveredCardKey, setHoveredCardKey] = useState<string | null>(null);
  const [focusedCardKey, setFocusedCardKey] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;

    void apiFetch<PublicCourseCatalogueResponse>(
      "/api/courses?limit=50&sort=quality&includeLongFormMetadata=true",
      { signal: controller.signal, cache: "no-store" }
    ).then((response) => {
      if (mounted) setCourses(selectLongFormCourses(response.courses));
    }).catch(() => {
      // This showcase is progressive enhancement. Catalogue or network failure
      // must not affect the rest of the public landing page.
      if (mounted) setCourses([]);
    });

    return () => {
      mounted = false;
      controller.abort();
    };
  }, []);

  if (courses.length === 0) return null;

  // Four distinct courses provide enough track width to complete a seamless
  // loop inside the landing-page content frame. Smaller catalogues stay static.
  const isLooping = courses.length >= 4;
  const activeCardKey = focusedCardKey ?? hoveredCardKey;
  const trackStyle = {
    "--bfs-long-form-duration": Math.max(30, courses.length * 5.5) + "s"
  } as CSSProperties;
  const groups = isLooping ? [false, true] : [false];

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const step = Math.max(260, Math.round(viewport.clientWidth * 0.72));

    if (event.key === "ArrowRight") {
      event.preventDefault();
      viewport.scrollBy({ left: step, behavior: "smooth" });
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      viewport.scrollBy({ left: -step, behavior: "smooth" });
    } else if (event.key === "Home") {
      event.preventDefault();
      viewport.scrollTo({ left: 0, behavior: "smooth" });
    } else if (event.key === "End") {
      event.preventDefault();
      viewport.scrollTo({ left: viewport.scrollWidth, behavior: "smooth" });
    }
  };

  return (
    <section className="bfs-long-form-carousel" aria-label="Long-form technology courses">
      <div
        ref={viewportRef}
        className={[
          "bfs-long-form-carousel__viewport",
          !isLooping ? "is-static" : "",
          manualMode ? "is-manual" : ""
        ].filter(Boolean).join(" ")}
        role="region"
        aria-label="Browse published technology courses with at least 20 hours of YouTube lessons"
        aria-roledescription="carousel"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onFocusCapture={() => setManualMode(true)}
        onBlurCapture={(event) => {
          const nextTarget = event.relatedTarget;
          if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
            setManualMode(false);
            setFocusedCardKey(null);
            setHoveredCardKey(null);
          }
        }}
        onMouseLeave={() => setHoveredCardKey(null)}
      >
        <div className={"bfs-long-form-carousel__track " + (isLooping ? "is-looping" : "is-static")} style={trackStyle}>
          {groups.map((duplicate) => (
            <div
              className="bfs-long-form-carousel__group"
              key={duplicate ? "duplicate" : "primary"}
              aria-hidden={duplicate ? true : undefined}
            >
              {courses.map((course) => (
                <LongFormCourseLink
                  key={(duplicate ? "duplicate-" : "primary-") + course.id}
                  course={course}
                  active={activeCardKey === ((duplicate ? "duplicate-" : "primary-") + course.id)}
                  dimmed={activeCardKey !== null && activeCardKey !== ((duplicate ? "duplicate-" : "primary-") + course.id)}
                  duplicate={duplicate}
                  onHover={() => setHoveredCardKey((duplicate ? "duplicate-" : "primary-") + course.id)}
                  onLeave={() => setHoveredCardKey(null)}
                  onFocus={() => setFocusedCardKey((duplicate ? "duplicate-" : "primary-") + course.id)}
                  onBlur={() => setFocusedCardKey(null)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
