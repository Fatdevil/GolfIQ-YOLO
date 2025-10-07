package com.golfiq.hud.playslike

import java.util.concurrent.ConcurrentHashMap
import kotlin.math.roundToInt

class ElevationProvider(private val demClient: DemClient? = null) {
    fun interface DemClient {
        fun elevationMeters(latitude: Double, longitude: Double): Double?
    }

    private data class TileKey(val latBucket: Int, val lonBucket: Int)

    private val cache = ConcurrentHashMap<TileKey, Double>()

    @Volatile
    private var barometerDelta: Double = 0.0

    fun updateBarometerDelta(deltaMeters: Double?) {
        barometerDelta = deltaMeters ?: 0.0
    }

    fun elevationMeters(latitude: Double, longitude: Double, fallback: Double? = null): Double {
        val key = tileKey(latitude, longitude)
        val cached = cache[key]
        val base = if (cached != null) {
            cached
        } else {
            val sampled = demClient?.elevationMeters(latitude, longitude)
            val resolved = sampled ?: fallback ?: 0.0
            cache[key] = resolved
            resolved
        }
        return base + barometerDelta
    }

    fun clearCache() {
        cache.clear()
    }

    private fun tileKey(latitude: Double, longitude: Double): TileKey {
        val scale = 100.0
        val latBucket = (latitude * scale).roundToInt()
        val lonBucket = (longitude * scale).roundToInt()
        return TileKey(latBucket, lonBucket)
    }
}
