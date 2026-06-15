import { describe, it, expect } from "vitest";
import { toCoreRole, PROJECT_ROLES } from "@/lib/schema";
import { isSectionKey, sectionLabel, CONTENT_SECTIONS } from "@/lib/sections";
import { t, roleLabelL } from "@/lib/i18n";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("schema.toCoreRole — 4직군 → 2축", () => {
  it("planner는 planner, 그 외는 developer로 매핑", () => {
    expect(toCoreRole("planner")).toBe("planner");
    expect(toCoreRole("developer")).toBe("developer");
    expect(toCoreRole("designer")).toBe("developer");
    expect(toCoreRole("ops")).toBe("developer");
  });
  it("PROJECT_ROLES는 4직군", () => {
    expect([...PROJECT_ROLES].sort()).toEqual(
      ["designer", "developer", "ops", "planner"].sort()
    );
  });
});

describe("sections", () => {
  it("isSectionKey는 유효 절만 통과", () => {
    for (const s of CONTENT_SECTIONS) expect(isSectionKey(s.key)).toBe(true);
    expect(isSectionKey("none")).toBe(false);
    expect(isSectionKey("meta")).toBe(false);
    expect(isSectionKey(undefined)).toBe(false);
    expect(isSectionKey(42)).toBe(false);
  });
  it("sectionLabel은 각 절에 비어있지 않은 라벨을 준다", () => {
    for (const s of CONTENT_SECTIONS) {
      expect(typeof sectionLabel(s.key)).toBe("string");
      expect(sectionLabel(s.key).length).toBeGreaterThan(0);
    }
  });
});

describe("i18n", () => {
  it("t는 언어별로 다른 값을, 미지원 언어는 ko로 폴백하지 않고 정의된 값을 준다", () => {
    expect(t("ko", "lens.conv")).toBe("대화");
    expect(t("en", "lens.conv")).toBe("Conversation");
    expect(t("ja", "lens.conv")).toBe("会話");
  });
  it("roleLabelL은 직군×언어 라벨", () => {
    expect(roleLabelL("planner", "ko")).toBe("기획");
    expect(roleLabelL("developer", "en")).toBe("Dev");
  });
});

describe("password — 해시 라운드트립", () => {
  it("같은 비밀번호는 검증 통과, 틀린 건 실패", () => {
    const h = hashPassword("demo1234");
    expect(h).not.toBe("demo1234"); // 평문 저장 금지
    expect(verifyPassword("demo1234", h)).toBe(true);
    expect(verifyPassword("wrong", h)).toBe(false);
  });
  it("같은 입력도 솔트로 매번 다른 해시", () => {
    expect(hashPassword("x")).not.toBe(hashPassword("x"));
  });
});
