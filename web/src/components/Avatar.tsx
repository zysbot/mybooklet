import { avatarFor } from "@/lib/avatar";

/** 由化名產生的頭像（印章樣式）。觀眾不能修改。 */
export function Avatar({ pseudonym, size = 48 }: { pseudonym: string; size?: number }) {
  const a = avatarFor(pseudonym);
  const inset = Math.max(3, Math.round(size * 0.08));
  return (
    <span
      role="img"
      aria-label={pseudonym}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        flex: "none",
        borderRadius: a.ring === 2 ? Math.round(size * 0.22) : "50%",
        background: a.background,
        color: "#F4EFE6",
        fontFamily: "var(--serif)",
        fontWeight: 700,
        fontSize: Math.round(size * 0.46),
        lineHeight: 1,
      }}
    >
      {a.ring !== 0 && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            inset,
            borderRadius: "inherit",
            border: `${a.ring === 1 ? 1.5 : 1}px ${a.ring === 1 ? "solid" : "dashed"} rgba(244,239,230,0.55)`,
          }}
        />
      )}
      {a.char}
    </span>
  );
}
