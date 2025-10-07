package com.golfiq.shared.playslike

import kotlin.math.abs
import kotlin.math.max

object PlaysLikeService {
    data class Components(
        val slopeM: Double,
        val windM: Double,
    )

    data class Result(
        val distanceEff: Double,
        val components: Components,
        val quality: Quality,
    )

    data class Options(
        val kS: Double = 1.0,
        val kHW: Double = 2.5,
        val warnThresholdRatio: Double = 0.05,
        val lowThresholdRatio: Double = 0.12,
    )

    enum class Quality(val value: String) {
        GOOD("good"),
        WARN("warn"),
        LOW("low"),
    }

    fun computeSlopeAdjust(D: Double, deltaH: Double, kS: Double = 1.0): Double {
        if (!D.isFinite() || D <= 0.0) return 0.0
        if (!deltaH.isFinite()) return 0.0
        val clampedKs = kS.coerceIn(0.2, 3.0)
        return deltaH * clampedKs
    }

    fun computeWindAdjust(D: Double, wParallel: Double, kHW: Double = 2.5): Double {
        if (!D.isFinite() || D <= 0.0) return 0.0
        if (!wParallel.isFinite()) return 0.0
        val clamped = kHW.coerceIn(0.5, 6.0)
        return wParallel * clamped
    }

    fun compute(
        D: Double,
        deltaH: Double,
        wParallel: Double,
        opts: Options = Options(),
    ): Result {
        val distance = if (D.isFinite()) max(D, 0.0) else 0.0
        val slopeM = computeSlopeAdjust(distance, deltaH, opts.kS)
        val windM = computeWindAdjust(distance, wParallel, opts.kHW)
        val eff = distance + slopeM + windM
        val total = abs(slopeM) + abs(windM)
        val ratio = if (distance > 0.0) total / distance else Double.POSITIVE_INFINITY
        val quality = when {
            ratio <= opts.warnThresholdRatio -> Quality.GOOD
            ratio <= opts.lowThresholdRatio -> Quality.WARN
            else -> Quality.LOW
        }
        return Result(
            distanceEff = eff,
            components = Components(slopeM = slopeM, windM = windM),
            quality = quality,
        )
    }
}
