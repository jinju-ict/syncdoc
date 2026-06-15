"use client";

/**
 * 마크다운 렌더러 — react-markdown + remark-gfm.
 * raw HTML은 렌더하지 않는다 (XSS 방어: rehype-raw 사용 금지).
 *
 * mermaid 코드블록은 클라이언트에서만 다이어그램으로 렌더된다:
 * - mermaid는 useEffect 안에서 dynamic import (SSR 번들에 포함되지 않음)
 * - securityLevel: 'strict' (라벨 내 HTML/클릭 핸들러 새니타이즈 — 플랜 §Risks XSS)
 * - 파싱 실패 시 코드 원문을 <pre>로 폴백 + 오류 안내 (절대 크래시하지 않음)
 */

import {
  isValidElement,
  useEffect,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import ReactMarkdown, { type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";

export default function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ pre: PreBlock }}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

/**
 * <pre> 오버라이드 — 자식 <code>가 language-mermaid이면 다이어그램으로 분기.
 * (code 오버라이드 대신 pre를 잡아야 <pre> 안에 <div>가 중첩되는 invalid HTML을 피한다)
 */
function PreBlock({
  children,
  node: _node, // react-markdown이 넘기는 hast 노드 — DOM으로 새지 않게 분리
  ...props
}: ComponentProps<"pre"> & ExtraProps) {
  const code = extractMermaidCode(children);
  if (code !== null) {
    return <MermaidDiagram code={code} />;
  }
  return <pre {...props}>{children}</pre>;
}

function extractMermaidCode(children: ReactNode): string | null {
  const child = Array.isArray(children) ? children[0] : children;
  if (!isValidElement(child)) return null;
  const { className, children: inner } = child.props as {
    className?: string;
    children?: ReactNode;
  };
  if (!className || !/\blanguage-mermaid\b/.test(className)) return null;
  if (typeof inner !== "string") return null;
  return inner.replace(/\n$/, "");
}

// ─── mermaid 클라이언트 렌더 ───────────────────────────────────────────────

/** 모듈 스코프 — initialize는 1회만, render id는 전역 유일하게. */
let mermaidIdCounter = 0;
let mermaidModule: Promise<typeof import("mermaid")> | null = null;

function loadMermaid() {
  if (!mermaidModule) {
    mermaidModule = import("mermaid").then((mod) => {
      mod.default.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "neutral",
        fontFamily:
          'var(--font-geist-sans), "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif',
      });
      return mod;
    });
  }
  return mermaidModule;
}

function MermaidDiagram({ code }: { code: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // SSR/프리렌더 가드 — 브라우저에서만 렌더한다.
    if (typeof window === "undefined") return;

    let cancelled = false;
    const renderId = `syncdoc-mermaid-${mermaidIdCounter++}`;

    (async () => {
      try {
        const mermaid = (await loadMermaid()).default;
        const { svg: rendered } = await mermaid.render(renderId, code);
        if (!cancelled) {
          setSvg(rendered);
          setError(null);
        }
      } catch (e) {
        // mermaid가 파싱 실패 시 body에 남기는 임시 노드 정리
        document.getElementById(`d${renderId}`)?.remove();
        if (!cancelled) {
          setSvg(null);
          setError(e instanceof Error ? e.message : "다이어그램 렌더링 실패");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code]);

  // 파싱 실패 → 코드 원문 폴백 + 오류 안내 (히스토리를 막지 않는다)
  if (error) {
    return (
      <div className="mermaid-error">
        <p className="mermaid-error-note">
          mermaid 다이어그램을 그릴 수 없어 코드 원문을 표시합니다.
        </p>
        <pre>
          <code>{code}</code>
        </pre>
      </div>
    );
  }

  // 렌더 완료 — securityLevel 'strict'로 새니타이즈된 SVG만 주입된다.
  if (svg) {
    return (
      <div
        className="mermaid-figure"
        role="img"
        aria-label="mermaid 다이어그램"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }

  // 로딩 중 (서버 HTML과 동일한 초기 상태 → hydration 안전)
  return (
    <div className="mermaid-figure mermaid-loading" aria-hidden>
      다이어그램 렌더링 중…
    </div>
  );
}
