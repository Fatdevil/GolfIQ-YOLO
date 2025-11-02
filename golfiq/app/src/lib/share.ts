import * as Clipboard from 'expo-clipboard';
import { Linking, Platform } from 'react-native';

type ExpoSharingModule = typeof import('expo-sharing');
type ExpoFileSystemModule = typeof import('expo-file-system');

export async function tryShareSvg(
  dataUri: string,
  svgRaw: string,
  options?: { dialogTitle?: string },
): Promise<{ ok: boolean; msg: string }> {
  const dialogTitle = options?.dialogTitle ?? 'Share';
  if (Platform.OS === 'web') {
    try {
      await Linking.openURL(dataUri);
      return { ok: true, msg: 'Opened in new tab' };
    } catch {
      // fallthrough to clipboard
    }
    await Clipboard.setStringAsync(svgRaw);
    return { ok: true, msg: 'Copied SVG to clipboard' };
  }

  let Sharing: ExpoSharingModule | null = null;
  let FileSystem: ExpoFileSystemModule | null = null;
  try {
    Sharing = await import('expo-sharing');
  } catch {
    Sharing = null;
  }
  try {
    FileSystem = await import('expo-file-system');
  } catch {
    FileSystem = null;
  }

  const available = !!Sharing?.isAvailableAsync && (await Sharing.isAvailableAsync());

  if (available && FileSystem?.writeAsStringAsync) {
    const path = `${FileSystem.cacheDirectory ?? ''}golfiq-share.svg`;
    const encoding = FileSystem?.EncodingType?.UTF8 ?? 'utf8';
    await FileSystem.writeAsStringAsync(path, svgRaw, { encoding });
    await Sharing.shareAsync(path, {
      mimeType: 'image/svg+xml',
      dialogTitle,
    });
    return { ok: true, msg: 'Shared SVG card' };
  }

  await Clipboard.setStringAsync(svgRaw);
  return { ok: true, msg: 'Sharing not available — copied SVG to clipboard' };
}

