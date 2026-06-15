/**
 * 번역 생성 러너 — 서버 액션과 문서 페이지(서버 컴포넌트)가 공유한다.
 * "use server"가 아니므로 일반 함수로 export 가능. AI 호출은 항상 흡수(throw 안 함).
 */

import * as repo from "./repo";
import type { Role } from "./repo";
import { translate, translateProse } from "./ai";

/** 단일 (블록, 직군, 언어) 번역 실행 → 결과 기록 */
export async function runBlockJob(
  job: repo.TranslationJob,
  projectId: number | null
): Promise<void> {
  try {
    const level =
      projectId != null
        ? repo.getLevelForProjectRole(projectId, job.targetRole)
        : repo.getLevelForRole(job.targetRole as Role);

    // 내용 캐시 — 같은 (정규화 메시지, 직군, 언어, 수준) 번역이 있으면 AI 생략
    const cached = repo.getCachedTranslation(
      job.sourceMd,
      job.targetRole,
      job.targetLang,
      level
    );
    if (cached !== null) {
      repo.recordTranslation(job.blockId, job.targetRole, job.targetLang, {
        ok: true,
        md: cached,
      });
      return;
    }

    const r = await translate(job.sourceMd, job.targetRole, level, job.targetLang);
    if (r.ok) {
      repo.putCachedTranslation(job.sourceMd, job.targetRole, job.targetLang, level, r.md);
    }
    repo.recordTranslation(
      job.blockId,
      job.targetRole,
      job.targetLang,
      r.ok ? { ok: true, md: r.md } : { ok: false, error: r.error }
    );
  } catch (e) {
    repo.recordTranslation(job.blockId, job.targetRole, job.targetLang, {
      ok: false,
      error: String(e),
    });
  }
}

/** 백서 절 산문 자연어 번역 실행 → 결과 기록 */
export async function runSectionI18nJob(job: repo.SectionI18nJob): Promise<void> {
  try {
    const [tt, b] = await Promise.all([
      job.sourceTitle ? translateProse(job.sourceTitle, job.lang) : null,
      translateProse(job.sourceBody, job.lang),
    ]);
    if (b.ok) {
      repo.recordSectionI18n(job.contentId, job.lang, {
        ok: true,
        title: tt && tt.ok ? tt.md : (job.sourceTitle ?? ""),
        bodyMd: b.md,
      });
    } else {
      repo.recordSectionI18n(job.contentId, job.lang, { ok: false });
    }
  } catch {
    repo.recordSectionI18n(job.contentId, job.lang, { ok: false });
  }
}
