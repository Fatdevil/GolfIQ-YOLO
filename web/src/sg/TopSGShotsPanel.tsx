import { TopSGShots } from '@web/sg/TopSGShots';

type Props = {
  runId: string;
  limit?: number;
  isClipVisible?: (clipId: string) => boolean;
};

export function TopSGShotsPanel({ runId, limit = 5, isClipVisible }: Props) {
  return <TopSGShots runId={runId} limit={limit} isClipVisible={isClipVisible} />;
}

export default TopSGShotsPanel;
