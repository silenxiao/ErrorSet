import { absUrl } from '@/api/config';
import { illustrationImageUrl } from '@/api/question';
import type { Illustration } from '@/types/question';

/** 快照优先，确保来源试卷删除后错题插图仍可阅读。 */
export function illustrationUris(record: { illustrationImages?: string[]; illustrations?: Illustration[] }): string[] {
  const snapshots = (record.illustrationImages || []).map(absUrl).filter((uri): uri is string => !!uri);
  return snapshots.length ? snapshots : (record.illustrations || []).map((ill) => illustrationImageUrl(ill.id));
}
