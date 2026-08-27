"use client";

import { useState } from "react";
import Image from "next/image";

export function CollectionArtwork({ detail = false }: { detail?: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="relative aspect-[16/10] overflow-hidden bg-card" data-artwork>
      <div
        className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground"
        aria-hidden={!detail || !failed}
      >
        Cover unavailable
      </div>
      {!failed ? (
        <Image
          src="/artwork/aster-v1.png"
          alt={detail ? "An abstract lime-green orbit on a dark green field." : ""}
          width={1280}
          height={800}
          sizes={
            detail
              ? "(min-width: 816px) 768px, calc(100vw - 48px)"
              : "(min-width: 1152px) 350px, (min-width: 1024px) calc((100vw - 102px) / 3), (min-width: 640px) calc((100vw - 76px) / 2), calc(100vw - 50px)"
          }
          loading={detail ? "eager" : "lazy"}
          fetchPriority={detail ? "high" : "auto"}
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => {
            setFailed(true);
          }}
        />
      ) : null}
    </div>
  );
}
