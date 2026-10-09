import { describe, expect, it } from "vitest";
import { AnalysisRequestGuard } from "./analysisRequest";

describe("AI 分析响应隔离", () => {
  it("当前请求可以填充结果", () => {
    const guard = new AnalysisRequestGuard();
    expect(guard.isCurrent(guard.begin())).toBe(true);
  });

  it.each(["切题", "关闭弹窗", "修改题干", "修改插图"])("%s后旧响应不可填充", () => {
    const guard = new AnalysisRequestGuard();
    const old = guard.begin();
    guard.invalidate();
    expect(guard.isCurrent(old)).toBe(false);
    const current = guard.begin();
    expect(guard.isCurrent(current)).toBe(true);
    expect(guard.isCurrent(old)).toBe(false);
  });

  it("同一道题发起新请求时，较旧请求不能覆盖新结果或清除加载状态", () => {
    const guard = new AnalysisRequestGuard();
    const old = guard.begin();
    const current = guard.begin();
    expect(guard.isCurrent(old)).toBe(false);
    expect(guard.isCurrent(current)).toBe(true);
  });
});
