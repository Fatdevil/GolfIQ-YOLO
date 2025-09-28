package com.golfiq.hud.cache

import com.golfiq.hud.model.CachedHole
import java.time.Instant
import java.time.temporal.ChronoUnit

class CachedHoleStore {
    private val cache = mutableMapOf<String, CachedHole>()

    fun set(hole: CachedHole) {
        cache[hole.holeId] = hole
    }

    fun get(holeId: String): CachedHole? = cache[holeId]

    fun clearStale(hours: Long) {
        val cutoff = Instant.now().minus(hours, ChronoUnit.HOURS)
        cache.entries.removeIf { (_, hole) ->
            val timestamp = Instant.parse(hole.lastSyncedAt)
            timestamp.isBefore(cutoff)
        }
    }
}