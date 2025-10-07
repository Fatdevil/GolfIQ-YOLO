package com.golfiq.hud.playslike

import kotlin.math.cos

class WindProvider(private val client: WeatherClient? = null) {
    fun interface WeatherClient {
        fun fetchWind(latitude: Double, longitude: Double): WindSample?
    }

    data class WindSample(
        val speed: Double,
        val directionDegrees: Double,
    )

    data class WindVector(
        val speed: Double,
        val directionDegrees: Double,
        val parallel: Double,
    )

    fun current(latitude: Double, longitude: Double, bearingDegrees: Double?): WindVector {
        val sample = client?.fetchWind(latitude, longitude) ?: WindSample(0.0, 0.0)
        val parallel = if (bearingDegrees != null) {
            computeParallel(sample, bearingDegrees)
        } else {
            0.0
        }
        return WindVector(
            speed = sample.speed,
            directionDegrees = sample.directionDegrees,
            parallel = parallel,
        )
    }

    private fun computeParallel(sample: WindSample, bearingDegrees: Double): Double {
        val normalizedDir = ((sample.directionDegrees % 360) + 360) % 360
        val normalizedBearing = ((bearingDegrees % 360) + 360) % 360
        val diff = Math.toRadians(normalizedDir - normalizedBearing)
        return sample.speed * cos(diff)
    }
}
