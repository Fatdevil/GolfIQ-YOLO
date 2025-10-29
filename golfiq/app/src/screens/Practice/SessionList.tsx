import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { ScheduledPracticeSession } from '../../../../../shared/training/scheduler';

export type SessionStatus = 'upcoming' | 'completed' | 'skipped';

export type SessionState = ScheduledPracticeSession & {
  planName?: string;
  status: SessionStatus;
  completedAt?: number | null;
  skippedAt?: number | null;
};

type Props = {
  sessions: SessionState[];
  onComplete: (session: SessionState) => void;
  onSkip: (session: SessionState) => void;
};

const styles = StyleSheet.create({
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    color: '#cbd5f5',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#1f2937',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  cardTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '600',
  },
  cardMeta: {
    color: '#94a3b8',
    fontSize: 13,
  },
  drill: {
    color: '#cbd5f5',
    fontSize: 13,
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
    gap: 12,
  },
  actionButton: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  actionPrimary: {
    backgroundColor: '#38bdf8',
  },
  actionSecondary: {
    backgroundColor: 'transparent',
    borderColor: '#64748b',
    borderWidth: 1,
  },
  actionTextPrimary: {
    color: '#0f172a',
    fontWeight: '600',
    fontSize: 13,
  },
  actionTextSecondary: {
    color: '#e2e8f0',
    fontWeight: '600',
    fontSize: 13,
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 13,
    fontStyle: 'italic',
  },
  statusTag: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  statusCompleted: {
    color: '#4ade80',
  },
  statusSkipped: {
    color: '#f97316',
  },
});

const formatTime = (value: number): string => {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return new Date(value).toString();
  }
};

const SessionCard: React.FC<{
  session: SessionState;
  onComplete?: (session: SessionState) => void;
  onSkip?: (session: SessionState) => void;
}> = ({ session, onComplete, onSkip }) => {
  const drillSummary = `${session.drills.length} drill${session.drills.length === 1 ? '' : 's'}`;
  const scheduledLabel = formatTime(session.scheduledAt);
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{session.planName ?? session.planId}</Text>
        <Text style={styles.cardMeta}>{scheduledLabel}</Text>
      </View>
      <Text style={styles.cardMeta}>{drillSummary}</Text>
      {session.drills.slice(0, 3).map((drill) => (
        <Text key={`${session.id}-${drill.id}`} style={styles.drill}>
          • {drill.title ?? drill.id}
        </Text>
      ))}
      {typeof onComplete === 'function' && typeof onSkip === 'function' && (
        <View style={styles.actions}>
          <TouchableOpacity
            accessibilityRole="button"
            style={[styles.actionButton, styles.actionSecondary]}
            onPress={() => onSkip(session)}
          >
            <Text style={styles.actionTextSecondary}>Skippa</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            style={[styles.actionButton, styles.actionPrimary]}
            onPress={() => onComplete(session)}
          >
            <Text style={styles.actionTextPrimary}>Klar</Text>
          </TouchableOpacity>
        </View>
      )}
      {session.status === 'completed' && (
        <Text style={[styles.statusTag, styles.statusCompleted]}>
          Slutförd {session.completedAt ? formatTime(session.completedAt) : ''}
        </Text>
      )}
      {session.status === 'skipped' && (
        <Text style={[styles.statusTag, styles.statusSkipped]}>
          Skippad {session.skippedAt ? formatTime(session.skippedAt) : ''}
        </Text>
      )}
    </View>
  );
};

const SessionList: React.FC<Props> = ({ sessions, onComplete, onSkip }) => {
  const upcoming = sessions.filter((session) => session.status === 'upcoming');
  const history = sessions.filter((session) => session.status !== 'upcoming');

  return (
    <View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Kommande pass</Text>
        {!upcoming.length && <Text style={styles.emptyText}>Inga kommande pass planerade.</Text>}
        {upcoming.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            onComplete={onComplete}
            onSkip={onSkip}
          />
        ))}
      </View>
      {history.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Historik</Text>
          {history.map((session) => (
            <SessionCard key={session.id} session={session} />
          ))}
        </View>
      )}
    </View>
  );
};

export default SessionList;
