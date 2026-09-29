import type { GenerateStage, PlaylistTrack, Track } from "../../shared/types.ts";
import { FlowerArt } from "./FlowerArt.tsx";
import { CheckIcon } from "./Icons.tsx";
import { TiltCard } from "./Composer.tsx";

const STAGES: { id: GenerateStage; label: string }[] = [
  { id: "listening", label: "Listening to your seeds" },
  { id: "curating", label: "Picking kindred songs" },
  { id: "verifying", label: "Checking every song exists" },
  { id: "sequencing", label: "Ordering for smooth transitions" },
];

interface Props {
  seeds: Track[];
  found: PlaylistTrack[];
  target: number;
  stage: GenerateStage;
  notices: string[];
  onCancel: () => void;
}

export function Growing({ seeds, found, target, stage, notices, onCancel }: Props) {
  const stageIndex = STAGES.findIndex((s) => s.id === stage);
  const keys = [...seeds.map((s) => s.id), ...found.map((f) => f.id)];
  return (
    <div className="compose growing">
      <section className="stage" aria-label="Your garden, growing">
        <div className="stage-copy">Every song that checks out grows another flower.</div>
        <TiltCard>
          <FlowerArt
            seed="taste-garden"
            palette="meadow"
            flowers={Math.min(7, keys.length)}
            flowerKeys={keys}
            sprouts={Math.max(0, keys.length - 7)}
            label="Your garden, growing"
          />
        </TiltCard>
        <p className="stage-hint" aria-live="polite">
          {found.length ? `${Math.min(found.length, target)} of ${target} songs found` : "warming the soil"}
        </p>
      </section>

      <section className="composer" aria-label="Progress">
        <h1>
          Growing<em>…</em>
        </h1>
        <ol className="stages">
          {STAGES.map((s, i) => (
            <li key={s.id} className={i < stageIndex ? "done" : i === stageIndex ? "now" : ""}>
              <span className="stage-dot">{i < stageIndex ? <CheckIcon size={13} /> : i === stageIndex ? <span className="spinner" /> : null}</span>
              {s.label}
            </li>
          ))}
        </ol>
        {notices.map((n) => (
          <p key={n} className="notice">
            {n}
          </p>
        ))}
        <ul className="feed" aria-live="polite">
          {[...found].reverse().slice(0, 8).map((t) => (
            <li key={t.id}>
              <img src={t.artworkSmall ?? t.artwork} alt="" />
              <div className="truncate">
                <b className="truncate">{t.title}</b>
                <span className="truncate">{t.artist}</span>
              </div>
              {t.why && <em className="feed-why">{t.why}</em>}
            </li>
          ))}
        </ul>
        <button className="btn ghost" onClick={onCancel}>
          Stop
        </button>
      </section>
    </div>
  );
}
