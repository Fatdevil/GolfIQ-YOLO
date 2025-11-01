package com.golfiq.watch

import java.nio.charset.StandardCharsets

enum class StrategyProfile(val wireName: String) {
    CONSERVATIVE("conservative"),
    NEUTRAL("neutral"),
    AGGRESSIVE("aggressive");
}

data class WatchHudStrategy(
    val profile: StrategyProfile,
    val offsetM: Double,
    val carryM: Double,
)

data class WatchHudDistances(
    val front: Double,
    val middle: Double,
    val back: Double,
)

data class WatchHudWind(
    val mps: Double,
    val deg: Double,
)

data class WatchHudStateV1(
    val ts: Long,
    val fmb: WatchHudDistances,
    val playsLikePct: Double,
    val wind: WatchHudWind,
    val strategy: WatchHudStrategy?,
    val tournamentSafe: Boolean,
) {
    val version: Int = 1
}

object HudCodec {
    private fun StringBuilder.appendNumber(value: Double): StringBuilder {
        return if (value.isFinite() && value == value.toLong().toDouble()) {
            append(value.toLong())
        } else {
            append(value)
        }
    }

    private fun StringBuilder.appendStrategy(strategy: WatchHudStrategy): StringBuilder {
        append("\"strategy\":{")
        append("\"profile\":\"")
        append(strategy.profile.wireName)
        append("\",\"offset_m\":")
        appendNumber(strategy.offsetM)
        append(",\"carry_m\":")
        appendNumber(strategy.carryM)
        append('}')
        return this
    }

    fun encode(state: WatchHudStateV1): ByteArray {
        val builder = StringBuilder(160)
        builder.append('{')
        builder.append("\"v\":")
        builder.append(state.version)
        builder.append(",\"ts\":")
        builder.append(state.ts)
        builder.append(",\"fmb\":{")
        builder.append("\"front\":")
        builder.appendNumber(state.fmb.front)
        builder.append(",\"middle\":")
        builder.appendNumber(state.fmb.middle)
        builder.append(",\"back\":")
        builder.appendNumber(state.fmb.back)
        builder.append('}')
        builder.append(",\"playsLikePct\":")
        builder.appendNumber(state.playsLikePct)
        builder.append(",\"wind\":{")
        builder.append("\"mps\":")
        builder.appendNumber(state.wind.mps)
        builder.append(",\"deg\":")
        builder.appendNumber(state.wind.deg)
        builder.append('}')
        state.strategy?.let {
            builder.append(',')
            builder.appendStrategy(it)
        }
        builder.append(",\"tournamentSafe\":")
        builder.append(if (state.tournamentSafe) "true" else "false")
        builder.append('}')
        return builder.toString().toByteArray(StandardCharsets.UTF_8)
    }
}
