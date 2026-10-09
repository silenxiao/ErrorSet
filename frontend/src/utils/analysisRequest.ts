/** 切题、关闭弹窗、修改输入或发起新请求时，让旧分析响应失效。 */
export class AnalysisRequestGuard {
  private generation = 0;

  invalidate(): void {
    this.generation += 1;
  }

  begin(): number {
    this.invalidate();
    return this.generation;
  }

  isCurrent(ticket: number): boolean {
    return ticket === this.generation;
  }
}
