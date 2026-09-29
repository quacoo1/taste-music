import type { Ref } from "react";
import type { Playlist } from "../../shared/types.ts";
import { PAINTS } from "./FlowerArt.tsx";
import { FlowerArt } from "./FlowerArt.tsx";

export function coverFlowers(p: Playlist) {
  return Math.min(7, Math.max(3, p.tracks.filter((t) => t.seed).length + 2));
}

export function Vinyl({ playlist, spinning, svgRef }: { playlist: Playlist; spinning: boolean; svgRef?: Ref<SVGSVGElement> }) {
  const paint = PAINTS[playlist.palette];
  const keys = playlist.tracks.filter((t) => t.seed).map((t) => t.id);
  return (
    <div className={`vinyl${spinning ? " spinning" : ""}`}>
      <div className="record" aria-hidden>
        <div className="record-disc">
          <div className="record-label" style={{ background: paint.petals[0] }}>
            <span style={{ background: paint.sky[1] }} />
          </div>
        </div>
      </div>
      <div className="sleeve">
        <FlowerArt
          seed={playlist.id}
          palette={playlist.palette}
          flowers={coverFlowers(playlist)}
          flowerKeys={keys}
          square
          svgRef={svgRef}
          label={`Cover art for ${playlist.name}`}
        />
      </div>
    </div>
  );
}
