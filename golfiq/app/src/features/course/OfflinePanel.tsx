import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';

import { getIndex, type BundleIndexEntry } from '../../../../shared/arhud/bundle_client';
import { listCachedCourseIds, removeCachedCourse } from '../../../../shared/arhud/offline';
import { planPrefetch, runPrefetch } from '../../../../shared/arhud/prefetch';
import { distanceMeters, type DistancePoint } from '../../../../shared/arhud/location';

type OfflinePanelProps = {
  currentCourseId: string | null;
  gnssFix: DistancePoint | null;
};

function showToast(message: string): void {
  if (Platform.OS === 'android') {
    try {
      ToastAndroid.show(message, ToastAndroid.SHORT);
    } catch {
      // ignore toast failures
    }
  }
}

function bboxCenter(entry: BundleIndexEntry): DistancePoint | null {
  const [minLon, minLat, maxLon, maxLat] = entry.bbox;
  if (![minLon, minLat, maxLon, maxLat].every((value) => Number.isFinite(value))) {
    return null;
  }
  return {
    lat: (minLat + maxLat) / 2,
    lon: (minLon + maxLon) / 2,
  };
}

const OfflinePanel: React.FC<OfflinePanelProps> = ({ currentCourseId, gnssFix }) => {
  const [cached, setCached] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const ids = await listCachedCourseIds();
      setCached(ids);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleDelete = useCallback(
    async (id: string) => {
      setLoading(true);
      try {
        await removeCachedCourse(id);
        const message = `Removed ${id}`;
        setStatus(message);
        showToast(message);
        await refresh();
      } catch (error) {
        const message = `Failed to remove ${id}`;
        setStatus(message);
        showToast(message);
      } finally {
        setLoading(false);
      }
    },
    [refresh],
  );

  const handleDownloadCurrent = useCallback(async () => {
    if (!currentCourseId) {
      const message = 'Select a course to download';
      setStatus(message);
      showToast(message);
      return;
    }
    setLoading(true);
    try {
      const report = await runPrefetch({ courseIds: [currentCourseId] });
      const message = report.failed.length
        ? `Download failed for ${report.failed.join(', ')}`
        : report.downloaded.length
          ? `Downloaded ${report.downloaded.join(', ')}`
          : `Already cached ${currentCourseId}`;
      setStatus(message);
      showToast(message);
      await refresh();
    } catch (error) {
      const message = `Download failed for ${currentCourseId}`;
      setStatus(message);
      showToast(message);
    } finally {
      setLoading(false);
    }
  }, [currentCourseId, refresh]);

  const handlePrefetchNearby = useCallback(async () => {
    if (!gnssFix) {
      const message = 'GNSS fix required for nearby prefetch';
      setStatus(message);
      showToast(message);
      return;
    }
    setLoading(true);
    try {
      const index = await getIndex();
      const nearby = index
        .map((entry) => {
          const center = bboxCenter(entry);
          if (!center) {
            return null;
          }
          const distMeters = distanceMeters(gnssFix, center);
          if (!Number.isFinite(distMeters)) {
            return null;
          }
          return { courseId: entry.courseId, dist_km: distMeters / 1000 };
        })
        .filter((entry): entry is { courseId: string; dist_km: number } => Boolean(entry));

      const plan = await planPrefetch({ lastCourseId: currentCourseId ?? undefined, nearby });
      const report = await runPrefetch(plan);
      const message = `Prefetch · downloaded ${report.downloaded.length}, skipped ${report.skipped.length}, failed ${report.failed.length}`;
      setStatus(message);
      showToast(message);
      await refresh();
    } catch (error) {
      const message = 'Prefetch failed';
      setStatus(message);
      showToast(message);
    } finally {
      setLoading(false);
    }
  }, [currentCourseId, gnssFix, refresh]);

  const sortedCached = useMemo(() => [...cached].sort(), [cached]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Offline bundles</Text>
        {loading ? <ActivityIndicator size="small" color="#cbd5f5" /> : null}
      </View>
      {status ? <Text style={styles.status}>{status}</Text> : null}
      <View style={styles.actions}>
        <TouchableOpacity
          onPress={handleDownloadCurrent}
          disabled={!currentCourseId || loading}
          style={[styles.button, (!currentCourseId || loading) && styles.buttonDisabled]}
        >
          <Text style={styles.buttonLabel}>Download current</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handlePrefetchNearby}
          disabled={loading}
          style={[styles.button, loading && styles.buttonDisabled]}
        >
          <Text style={styles.buttonLabel}>Prefetch nearby</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.list}>
        {sortedCached.length === 0 ? (
          <Text style={styles.empty}>No cached courses</Text>
        ) : (
          sortedCached.map((id) => (
            <View key={id} style={styles.row}>
              <Text style={styles.courseId}>{id}</Text>
              <TouchableOpacity onPress={() => void handleDelete(id)} style={styles.deleteButton}>
                <Text style={styles.deleteLabel}>Delete</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '600',
  },
  status: {
    color: '#cbd5f5',
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    backgroundColor: '#1d4ed8',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  buttonDisabled: {
    backgroundColor: '#1e293b',
  },
  buttonLabel: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '500',
  },
  list: {
    gap: 8,
  },
  empty: {
    color: '#94a3b8',
    fontSize: 13,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  courseId: {
    color: '#f8fafc',
    fontSize: 14,
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
});

export default OfflinePanel;

