package com.golfiq.shared.playslike

object PlaysLikeService {
    data class Config(
        val windModel: String = "basic",
        val alphaHeadPerMph: Double = 0.0,
        val alphaTailPerMph: Double = 0.0,
        val slopeFactor: Double = 1.0,
        val windCapPctOfD: Double = 0.2,
        val taperStartMph: Double = 10.0,
        val sidewindDistanceAdjust: Boolean = false,
    )

    data class Options(
        val kS: Double = 1.0,
        val kHW: Double = 0.0,
        val config: Config? = null,
    )

    data class Components(
        val slopeM: Double,
        val windM: Double,
    )

    data class Quality(val value: String)

    data class Result(
        val distanceEff: Double,
        val components: Components,
        val quality: Quality,
    )

    fun compute(
        distanceMeters: Double,
        deltaH: Double,
        windParallel: Double,
        options: Options,
    ): Result {
        val slopeContribution = deltaH * options.kS
        val windContribution = windParallel * options.kHW
        val distanceEff = distanceMeters + slopeContribution + windContribution
        val quality = when {
            !distanceEff.isFinite() || distanceEff <= 0.0 -> "invalid"
            kotlin.math.abs(windContribution) > distanceMeters * 0.5 -> "low"
            else -> "ok"
        }
        return Result(
            distanceEff = distanceEff,
            components = Components(
                slopeM = slopeContribution,
                windM = windContribution,
            ),
            quality = Quality(quality),
        )
    }
}
