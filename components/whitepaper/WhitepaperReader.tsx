/**
 * 백서 리더 (백서 렌즈) — 목차 있는 "일반 문서"처럼 보이는 3단 읽기 화면.
 * 블록·말풍선 같은 조각 UI 없이, 절 제목 + 증류된 산문만 보여준다.
 * 좌: 목차+진행 / 중앙: 문서정보 카드 + 절별 산문 / 우: 합의 현황.
 *
 * 서버 컴포넌트(순수 렌더). 데이터는 page.tsx에서 props로 내려준다.
 */

import type { CSSProperties } from "react";
import type { Lang, MemberInfo, ProjectRole, SectionContentItem, SignatureInfo } from "@/lib/repo";
import { CONTENT_SECTIONS, META_SECTION, metaTitleL, sectionTitleL, type SectionKey } from "@/lib/sections";
import { t } from "@/lib/i18n";
import Markdown from "@/components/common/Markdown";

const FONT =
  "var(--font-instrument), 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";
const MONO = "var(--font-jetbrains), monospace";

const ROLE: Record<ProjectRole, { c: string; bg: string; label: string }> = {
  planner: { c: "#6D4FC8", bg: "#F1EDFB", label: "기획" },
  developer: { c: "#0D7E74", bg: "#E6F4F2", label: "개발" },
  designer: { c: "#C2410C", bg: "#FBEEE4", label: "디자인" },
  ops: { c: "#2D6FB0", bg: "#E7F0F8", label: "운영" },
};

function fmt(ts: string | null): string {
  return ts ? ts.replace("T", " ").slice(0, 16) : "—";
}

function statusChip(
  status: SectionContentItem["status"],
  lang: Lang
): { label: string; style: CSSProperties } {
  if (status === "agreed") {
    return {
      label: t(lang, "agreed"),
      style: { color: "#1B7F45", background: "#E8F5EC", border: "1px solid #D3EBDC" },
    };
  }
  if (status === "draft") {
    return {
      label: t(lang, "draft"),
      style: { color: "#6E6A60", background: "#F0EEE7", border: "1px solid #E2DDD1" },
    };
  }
  return {
    label: t(lang, "discussing"),
    style: { color: "#2D4FD4", background: "#EDF1FE", border: "1px solid #D7E0F8" },
  };
}

const chipBase: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  borderRadius: 99,
  padding: "2px 9px",
  flexShrink: 0,
};

export type WhitepaperMeta = {
  title: string;
  docId: number;
  statusLabel: string;
  createdAt: string | null;
  agreed: boolean;
  approvalPlannerAt: string | null;
  approvalDeveloperAt: string | null;
  projectTitle: string | null;
};

export default function WhitepaperReader({
  meta,
  members,
  signatures,
  content,
  lang = "ko",
}: {
  meta: WhitepaperMeta;
  members: MemberInfo[];
  signatures: SignatureInfo[];
  content: SectionContentItem[];
  lang?: Lang;
}) {
  const bySection = new Map<SectionKey, SectionContentItem[]>();
  for (const s of CONTENT_SECTIONS) bySection.set(s.key, []);
  for (const item of content) bySection.get(item.sectionKey)?.push(item);

  const writtenSections = CONTENT_SECTIONS.filter(
    (s) => (bySection.get(s.key)?.length ?? 0) > 0
  ).length;
  const allItems = content;
  const agreedItems = allItems.filter((i) => i.status === "agreed").length;
  const progressPct = Math.round((writtenSections / CONTENT_SECTIONS.length) * 100);

  return (
    <div
      className="wp-grid"
      style={{ fontFamily: FONT, color: "#1A1C20", wordBreak: "keep-all" }}
    >
      {/* ============ 좌: 목차 + 진행 ============ */}
      <aside className="wp-rail">
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#9A958A", margin: "0 0 4px" }}>
          {t(lang, "toc")}
        </p>
        <p style={{ fontSize: 10.5, fontFamily: MONO, color: "#B7B1A4", margin: "0 0 12px" }}>
          SYNCDOC.PRD · doc-{meta.docId} · v1
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 20 }}>
          <a href="#sec-meta" style={tocLink}>
            <span style={{ fontFamily: MONO, fontSize: 11, opacity: 0.6, flexShrink: 0 }}>{META_SECTION.num}</span>
            <span>{META_SECTION.title}</span>
          </a>
          {CONTENT_SECTIONS.map((s) => {
            const items = bySection.get(s.key) ?? [];
            return (
              <div key={s.key}>
                <a href={`#sec-${s.key}`} style={tocLink}>
                  <span style={{ fontFamily: MONO, fontSize: 11, opacity: 0.6, flexShrink: 0 }}>{s.num}</span>
                  <span style={{ lineHeight: 1.3 }}>{sectionTitleL(s.key, lang)}</span>
                </a>
                {items.map((it) => (
                  <a key={it.id} href={`#item-${it.id}`} style={{ ...tocLink, paddingInlineStart: 30, fontSize: 12, color: "#9A958A" }}>
                    <span style={{ width: 5, height: 5, borderRadius: 99, flexShrink: 0, background: it.status === "agreed" ? "#1B7F45" : "#C9D6F6" }} />
                    <span style={{ lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title ?? "(제목 없음)"}</span>
                  </a>
                ))}
              </div>
            );
          })}
        </div>
        <div style={{ borderTop: "1px solid #E6E3DC", paddingTop: 16 }}>
          <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "#4A463E", marginBottom: 9 }}>
            {writtenSections}/{CONTENT_SECTIONS.length}절 작성됨
          </span>
          <div style={{ height: 7, borderRadius: 99, background: "#E6E3DC", overflow: "hidden", marginBottom: 10 }}>
            <div style={{ height: "100%", width: `${progressPct}%`, background: "#2D4FD4", borderRadius: 99 }} />
          </div>
          <p style={{ fontSize: 11.5, lineHeight: 1.5, color: "#9A958A", margin: 0 }}>
            세부 항목 {allItems.length}개 · 합의 {agreedItems}개
          </p>
        </div>
      </aside>

      {/* ============ 중앙: 문서 본문 ============ */}
      <main style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, fontFamily: MONO, color: "#2D4FD4", background: "#EDF1FE", border: "1px solid #D7E0F8", borderRadius: 7, padding: "3px 9px" }}>
            백서 · v1
          </span>
          {meta.agreed && (
            <span style={{ ...chipBase, color: "#1B7F45", background: "#E8F5EC", border: "1px solid #D3EBDC" }}>✅ {t(lang, "agreed")}</span>
          )}
          <span style={{ fontSize: 11, fontFamily: MONO, color: "#B7B1A4" }}>doc-{meta.docId}</span>
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.25, margin: "0 0 28px" }}>
          {meta.title}
        </h1>

        <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
          {/* 0. 문서 정보 (meta) */}
          <section id="sec-meta" style={{ scrollMarginTop: 92 }}>
            <SectionHeading num={META_SECTION.num} title={metaTitleL(lang)} />
            <div style={{ background: "#fff", border: "1px solid #E9E6DE", borderRadius: 14, overflow: "hidden" }}>
              <MetaRow label={t(lang, "status")} value={meta.statusLabel} />
              <MetaRow label={t(lang, "agreement")} value={meta.agreed ? `${t(lang, "agreed")} (${fmt(meta.approvalPlannerAt)} · ${fmt(meta.approvalDeveloperAt)})` : "—"} />
              <MetaRow label={t(lang, "createdAt")} value={fmt(meta.createdAt)} />
              <div style={{ display: "flex", gap: 14, padding: "11px 16px", alignItems: "flex-start" }}>
                <span style={{ flexShrink: 0, width: 96, fontSize: 12, fontWeight: 600, color: "#9A958A" }}>{t(lang, "members")}</span>
                <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {members.length === 0 ? (
                    <span style={{ fontSize: 13.5, color: "#9A958A" }}>—</span>
                  ) : (
                    members.map((m) => (
                      <span key={m.userId} style={{ ...chipBase, color: ROLE[m.role].c, background: ROLE[m.role].bg, border: `1px solid ${ROLE[m.role].c}33` }}>
                        {m.name} · {ROLE[m.role].label}
                      </span>
                    ))
                  )}
                </span>
              </div>
            </div>
            {signatures.length > 0 && (
              <p style={{ fontSize: 11.5, color: "#9A958A", margin: "10px 0 0" }}>
                서명: {signatures.map((s) => `${s.name}(${ROLE[s.role].label})`).join(" · ")}
              </p>
            )}
          </section>

          {/* 1~4 본문 절 */}
          {CONTENT_SECTIONS.map((s) => {
            const items = bySection.get(s.key) ?? [];
            return (
              <section key={s.key} id={`sec-${s.key}`} style={{ scrollMarginTop: 92 }}>
                <SectionHeading num={s.num} title={sectionTitleL(s.key, lang)} mnemonic={s.mnemonic} />
                {items.length === 0 ? (
                  <div style={{ border: "1.5px dashed #DAD5C8", borderRadius: 13, padding: 22, textAlign: "center", background: "#FAF9F5" }}>
                    <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "#9A958A", margin: "0 0 12px" }}>
                      {t(lang, "notWritten")}
                    </p>
                    <a href={`/doc/${meta.docId}?lens=conv`} style={drillBtn}>
                      + {t(lang, "startDiscussion")}
                    </a>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
                    {items.map((it) => {
                      const chip = statusChip(it.status, lang);
                      return (
                        <div key={it.id} id={`item-${it.id}`} style={{ scrollMarginTop: 92 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{it.title}</h3>
                            <span style={{ ...chipBase, ...chip.style, marginInlineStart: "auto" }}>{chip.label}</span>
                            <a href={`/doc/${meta.docId}?lens=conv`} style={drillLink} title="이 절의 대화 보기·이어가기">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginInlineEnd: 4, verticalAlign: "-1px" }}>
                                <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.5 0-3-.4-4.2-1.1L3 20l1.1-5.3A8.5 8.5 0 1 1 21 11.5z" />
                              </svg>
                              {t(lang, "continueConversation")}
                            </a>
                          </div>
                          <div className="markdown-body" style={{ fontSize: 14.5, lineHeight: 1.75, color: "#34322C", paddingInlineStart: 20 }}>
                            <Markdown>{it.bodyMd}</Markdown>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </main>

      {/* ============ 우: 합의 현황 ============ */}
      <aside className="wp-rail">
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#9A958A", margin: "0 0 12px" }}>
          {t(lang, "agreementStatus")}
        </p>
        {allItems.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "#9A958A", background: "#fff", border: "1px solid #E9E6DE", borderRadius: 11, padding: "14px 0", textAlign: "center" }}>
            {t(lang, "noAgreementItems")}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {CONTENT_SECTIONS.flatMap((s) => {
              const items = bySection.get(s.key) ?? [];
              return items.map((it) => {
                const chip = statusChip(it.status, lang);
                return (
                  <a
                    key={it.id}
                    href={`#item-${it.id}`}
                    style={{ display: "block", background: "#fff", border: "1px solid #E9E6DE", borderRadius: 11, padding: "11px 13px", textDecoration: "none", color: "inherit" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: "#2D4FD4", flexShrink: 0 }}>{s.num}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.3, minWidth: 0 }}>{it.title}</span>
                      <span style={{ ...chipBase, ...chip.style, marginInlineStart: "auto" }}>{chip.label}</span>
                    </div>
                  </a>
                );
              });
            })}
          </div>
        )}
      </aside>
    </div>
  );
}

const tocLink: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 8px",
  borderRadius: 8,
  textDecoration: "none",
  color: "#4A463E",
  fontSize: 13,
  fontWeight: 500,
};

const drillLink: CSSProperties = {
  flexShrink: 0,
  fontSize: 11.5,
  fontWeight: 600,
  color: "#6E6A60",
  textDecoration: "none",
  borderBottom: "1px solid #E0DCD2",
  paddingBottom: 1,
};

const drillBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: "#fff",
  border: "1px solid #D7E0F8",
  color: "#2D4FD4",
  borderRadius: 9,
  padding: "7px 15px",
  fontSize: 12.5,
  fontWeight: 600,
  textDecoration: "none",
};

function SectionHeading({ num, title, mnemonic }: { num: string; title: string; mnemonic?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
      <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 500, color: "#2D4FD4", flexShrink: 0 }}>{num}</span>
      <h2 style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-0.015em", margin: 0 }}>{title}</h2>
      {mnemonic && (
        <span style={{ fontFamily: MONO, fontSize: 11, color: "#B7B1A4" }}>{mnemonic}</span>
      )}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 14, padding: "11px 16px", borderBottom: "1px solid #F2F0EA", alignItems: "center" }}>
      <span style={{ flexShrink: 0, width: 96, fontSize: 12, fontWeight: 600, color: "#9A958A" }}>{label}</span>
      <span style={{ fontSize: 13.5, color: "#34322C" }}>{value}</span>
    </div>
  );
}
