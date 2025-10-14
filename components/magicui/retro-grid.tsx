import { cn } from "@/lib/utils";

export default function RetroGrid({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute size-full overflow-hidden opacity-70 [perspective:200px]",
        className,
      )}
    >
      {/* Grid */}
      <div className="absolute inset-0 [transform:rotateX(35deg)]">
        <div
          className={cn(
            "animate-grid",

            "[background-repeat:repeat] [background-size:60px_60px] [height:300vh] [inset:0%_0px] [margin-left:-50%] [transform-origin:100%_0_0] [width:600vw]",

            // Neon magenta grid lines (light)
            "[background-image:linear-gradient(to_right,rgba(255,20,147,0.9)_1px,transparent_0),linear-gradient(to_bottom,rgba(255,20,147,0.9)_1px,transparent_0)]",

            // Neon magenta grid lines (dark)
            "dark:[background-image:linear-gradient(to_right,rgba(255,0,180,0.95)_1px,transparent_0),linear-gradient(to_bottom,rgba(255,0,180,0.95)_1px,transparent_0)]",
          )}
        />
      </div>

      {/* Background Gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#ff00aaff] via-[#7c3aed66] to-transparent to-90% dark:from-[#ff00aaee] dark:via-[#7c3aed88]" />
    </div>
  );
}
