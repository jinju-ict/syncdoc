/**
 * 마크다운 렌더러 — react-markdown + remark-gfm.
 * raw HTML은 렌더하지 않는다 (XSS 방어: rehype-raw 사용 금지).
 *
 * NOTE(worker-mermaid): mermaid 코드블록은 현재 일반 코드로 렌더된다.
 * 추후 이 컴포넌트에 mermaid 클라이언트 렌더(securityLevel: 'strict')를 추가할 것.
 */

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
