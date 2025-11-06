import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, ToastAndroid, TouchableOpacity, View } from 'react-native';

import { listCachedCourseIds, removeCachedBundle, getIndex } from '../../../../../shared/arhud/bundle_client';
import { planPrefetch, runPrefetch } from '../../../../../shared/arhud/prefetch';
import { distanceMeters } from '../../../../../shared/arhud/location';

type GeoPoint = { lat: number; lon: number };

type OfflinePanelProps = {
  currentCourseId: string | null;
  position?: GeoPoint | null;
  onStatus?: (message: string) => void;
};

type NearbyCourse = { courseId: string; dist_km: number };

function computeNearby(position: GeoPoint | null | undefined, entries: Awaited<ReturnType<typeof getIndex>>): NearbyCourse[] {
  if (!entries.length) {
    return [];
  }
  return entries.map((entry) => {
    const [minLon, minLat, maxLon, maxLat] = entry.bbox;
    const center: GeoPoint = {
      lat: Number.isFinite(minLat) && Number.isFinite(maxLat) ? (minLat + maxLat) / 2 : 0,
      lon: Number.isFinite(minLon) && Number.isFinite(maxLon) ? (minLon + maxLon) / 2 : 0,
    };
    const distMeters = position ? distanceMeters(position, center) : Number.POSITIVE_INFINITY;
    const dist_km = Number.isFinite(distMeters) ? distMeters / 1000 : Number.POSITIVE_INFINITY;
    return { courseId: entry.courseId, dist_km };
  });
}

const OfflinePanel: React.FC<OfflinePanelProps> = ({ currentCourseId, position, onStatus }) => {
  const [cached, setCached] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const showStatus = useCallback(
    (message: string) => {
      setStatus(message);
      onStatus?.(message);
      if (Platform.OS === 'android') {
        try {
          ToastAndroid.show(message, ToastAndroid.SHORT);
        } catch {
          // ignore toast failures
        }
      }
    },
    [onStatus],
  );

  const refresh = useCallback(async () => {
    try {
      const ids = await listCachedCourseIds();
      setCached(ids);
    } catch (error) {
      showStatus('Failed to load offline cache');
    }
  }, [showStatus]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const isCurrentCached = useMemo(() => {
    if (!currentCourseId) {
      return false;
    }
    return cached.includes(currentCourseId);
  }, [cached, currentCourseId]);

  const handleDownloadCurrent = useCallback(async () => {
    if (!currentCourseId) {
      showStatus('Select a course first');
      return;
    }
    setLoading(true);
    try {
      const report = await runPrefetch({ courseIds: [currentCourseId] });
      const downloaded = report.downloaded.length;
      const skipped = report.skipped.length;
      showStatus(`Downloaded ${downloaded} · Skipped ${skipped}`);
    } catch (error) {
      showStatus('Download failed');
    } finally {
      setLoading(false);
      refresh();
    }
  }, [currentCourseId, refresh, showStatus]);

  const handlePrefetchNearby = useCallback(async () => {
    setLoading(true);
    try {
      const index = await getIndex();
      const nearby = computeNearby(position ?? null, index);
      const plan = await planPrefetch({
        lastCourseId: currentCourseId ?? undefined,
        nearby,
      });
      const report = await runPrefetch(plan);
      const summary = [`${report.downloaded.length} new`];
      if (report.skipped.length) {
        summary.push(`${report.skipped.length} cached`);
      }
      if (report.failed.length) {
        summary.push(`${report.failed.length} failed`);
      }
      showStatus(`Prefetch ${summary.join(' · ')}`);
    } catch (error) {
      showStatus('Prefetch failed');
    } finally {
      setLoading(false);
      refresh();
    }
  }, [currentCourseId, position, refresh, showStatus]);

  const handleDelete = useCallback(
    async (courseId: string) => {
      setLoading(true);
      try {
        await removeCachedBundle(courseId);
        showStatus(`Removed ${courseId}`);
      } catch (error) {
        showStatus('Remove failed');
      } finally {
        setLoading(false);
        refresh();
      }
    },
    [refresh, showStatus],
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Offline bundles</Text>
        {loading ? <ActivityIndicator size="small" color="#60a5fa" /> : null}
      </View>
      <Text style={styles.subtitle}>
        {currentCourseId
          ? isCurrentCached
            ? `Current course ${currentCourseId} cached`
            : `Current course ${currentCourseId} not cached`
          : 'No course selected'}
      </Text>
      <View style={styles.buttonRow}>
        <TouchableOpacity onPress={handleDownloadCurrent} style={styles.button}>
          <Text style={styles.buttonLabel}>Download current</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handlePrefetchNearby} style={styles.buttonSecondary}>
          <Text style={styles.buttonLabel}>Prefetch nearby</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.list}>
        {cached.length === 0 ? (
          <Text style={styles.placeholder}>No offline bundles yet</Text>
        ) : (
          cached.map((courseId) => (
            <View key={courseId} style={styles.listRow}>
              <Text style={styles.listLabel}>{courseId}</Text>
              <TouchableOpacity onPress={() => handleDelete(courseId)} style={styles.deleteButton}>
                <Text style={styles.deleteLabel}>Delete</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>
      {status ? <Text style={styles.status}>{status}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: '#e2e8f0',
    fontSize: 16,
    fontWeight: '600',
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    flex: 1,
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonSecondary: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  buttonLabel: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '500',
  },
  list: {
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    paddingTop: 8,
    gap: 8,
  },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  listLabel: {
    color: '#f1f5f9',
    fontSize: 13,
  },
  deleteButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#7f1d1d',
  },
  deleteLabel: {
    color: '#fecaca',
    fontSize: 12,
    fontWeight: '500',
  },
  placeholder: {
    color: '#64748b',
    fontSize: 12,
  },
  status: {
    color: '#cbd5f5',
    fontSize: 11,
  },
});

export default OfflinePanel;
