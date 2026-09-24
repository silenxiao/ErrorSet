import { useCallback, useEffect, useRef, useState } from "react";

import { getExam } from "../api/exam";
import type { ExamDetail, ExamStatus } from "../types/exam";

const POLLING_STATUSES: ExamStatus[] = [
  "uploaded",
  "global_processing",
  "local_processing",
];
const POLL_INTERVAL_MS = 1500;

/** 识别状态轮询（§6：每 1～2 秒查询一次），终态时停止。 */
export function useRecognition(examId: number | undefined) {
  const [exam, setExam] = useState<ExamDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (examId === undefined) return;
    try {
      setExam(await getExam(examId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [examId]);

  useEffect(() => {
    void refresh();

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (examId !== undefined && exam && POLLING_STATUSES.includes(exam.status)) {
      timerRef.current = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [examId, exam?.status, refresh]);

  return { exam, error, refresh };
}
