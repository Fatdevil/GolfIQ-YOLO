package com.golfiq.wear

import java.nio.charset.StandardCharsets
import org.json.JSONObject

enum class StrategyProfile(val wireName: String) {
    CONSERVATIVE("conservative"),
    NEUTRAL("neutral"),
    AGGRESSIVE("aggressive");

    companion object {
        fun fromWireName(value: String): StrategyProfile? {
            return values().firstOrNull { it.wireName == value }
        }
    }
}

data class HudStrategy(
    val profile: StrategyProfile,
    val offsetM: Double,
    val carryM: Double,
)

data class HudDistances(
    val front: Double,
    val middle: Double,
    val back: Double,
)

data class HudWind(
    val mps: Double,
    val deg: Double,
)

data class HudState(
    val timestamp: Long,
    val fmb: HudDistances,
    val playsLikePct: Double,
    val wind: HudWind,
    val strategy: HudStrategy?,
    val tournamentSafe: Boolean,
) {
    val hasData: Boolean get() = timestamp > 0

    companion object {
        val EMPTY = HudState(
            timestamp = 0L,
            fmb = HudDistances(0.0, 0.0, 0.0),
            playsLikePct = 0.0,
            wind = HudWind(0.0, 0.0),
            strategy = null,
            tournamentSafe = false,
        )
    }
}

object HudCodec {
    private const val VERSION = 1

    fun decode(bytes: ByteArray): HudState {
        val json = JSONObject(String(bytes, StandardCharsets.UTF_8))
        val version = when (val rawVersion = json.opt("v")) {
            is Number -> rawVersion.toInt()
            is String -> rawVersion.toIntOrNull() ?: VERSION
            else -> VERSION
        }
        require(version == VERSION) { "Unsupported HUD payload version: $version" }

        val fmbJson = when (val rawFmb = json.opt("fmb")) {
            is JSONObject -> rawFmb
            is String -> JSONObject(rawFmb)
            JSONObject.NULL -> null
            else -> null
        } ?: throw IllegalArgumentException("Missing fmb distances")
        val windJson = when (val rawWind = json.opt("wind")) {
            is JSONObject -> rawWind
            is String -> JSONObject(rawWind)
            JSONObject.NULL -> null
            else -> null
        } ?: throw IllegalArgumentException("Missing wind data")
        val strategy = if (json.has("strategy") && !json.isNull("strategy")) {
            val strategyJson = when (val rawStrategy = json.opt("strategy")) {
                is JSONObject -> rawStrategy
                is String -> JSONObject(rawStrategy)
                JSONObject.NULL -> null
                else -> null
            } ?: throw IllegalArgumentException("Invalid strategy payload")
            val profileWire = strategyJson.getString("profile")
            val profile = StrategyProfile.fromWireName(profileWire)
                ?: throw IllegalArgumentException("Unknown strategy profile: $profileWire")
            HudStrategy(
                profile = profile,
                offsetM = strategyJson.getDouble("offset_m"),
                carryM = strategyJson.getDouble("carry_m"),
            )
        } else {
            null
        }

        return HudState(
            timestamp = json.getLong("ts"),
            fmb = HudDistances(
                front = fmbJson.getDouble("front"),
                middle = fmbJson.getDouble("middle"),
                back = fmbJson.getDouble("back"),
            ),
            playsLikePct = json.getDouble("playsLikePct"),
            wind = HudWind(
                mps = windJson.getDouble("mps"),
                deg = windJson.getDouble("deg"),
            ),
            strategy = strategy,
            tournamentSafe = json.optBoolean("tournamentSafe"),
        )
    }

    fun encode(state: HudState): ByteArray {
        val builder = StringBuilder(160)
        builder.append('{')
        builder.append("\"v\":")
        builder.append(VERSION)
        builder.append(",\"ts\":")
        builder.append(state.timestamp)
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
        state.strategy?.let { strategy ->
            builder.append(",\"strategy\":{")
            builder.append("\"profile\":\"")
            builder.append(strategy.profile.wireName)
            builder.append("\",\"offset_m\":")
            builder.appendNumber(strategy.offsetM)
            builder.append(",\"carry_m\":")
            builder.appendNumber(strategy.carryM)
            builder.append('}')
        }
        builder.append(",\"tournamentSafe\":")
        builder.append(if (state.tournamentSafe) "true" else "false")
        builder.append('}')
        return builder.toString().toByteArray(StandardCharsets.UTF_8)
    }

    private fun StringBuilder.appendNumber(value: Double): StringBuilder {
        return if (value.isFinite() && value == value.toLong().toDouble()) {
            append(value.toLong())
        } else {
            append(value)
        }
    }
}
