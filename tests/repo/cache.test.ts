import { describe, it, expect } from "vitest";
import * as repo from "@/lib/repo";

const SRC = "초과 시 429 응답과 함께 Retry-After 헤더(60초)를 반환한다.";
const OUT = "한도를 넘으면 '약 60초 뒤 다시 시도'라는 응답을 돌려준다.";

describe("translation_cache — 내용 해시 캐시", () => {
  it("저장 후 동일 (내용·직군·언어·수준) 조회 성공", () => {
    repo.putCachedTranslation(SRC, "planner", "ko", "intermediate", OUT);
    expect(repo.getCachedTranslation(SRC, "planner", "ko", "intermediate")).toBe(OUT);
  });

  it("공백/개행만 다른 문장은 같은 캐시에 적중 (정규화)", () => {
    const messy = "  초과 시   429 응답과 함께\n  Retry-After 헤더(60초)를 반환한다.  ";
    expect(repo.getCachedTranslation(messy, "planner", "ko", "intermediate")).toBe(OUT);
  });

  it("직군·언어·수준이 다르면 캐시 미스", () => {
    expect(repo.getCachedTranslation(SRC, "developer", "ko", "intermediate")).toBeNull();
    expect(repo.getCachedTranslation(SRC, "planner", "en", "intermediate")).toBeNull();
    expect(repo.getCachedTranslation(SRC, "planner", "ko", "beginner")).toBeNull();
  });

  it("다른 내용은 미스", () => {
    expect(repo.getCachedTranslation("전혀 다른 문장", "planner", "ko", "intermediate")).toBeNull();
  });
});
