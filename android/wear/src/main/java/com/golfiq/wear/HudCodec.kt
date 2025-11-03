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

data class HudCaddieHint(
    val club: String,
    val carryM: Double,
    val totalM: Double?,
    val aimDir: String?,
    val aimOffsetM: Double?,
    val risk: String,
    val confidence: Double?,
)

data class HudState(
    val timestamp: Long,
    val fmb: HudDistances,
    val playsLikePct: Double,
    val wind: HudWind,
    val strategy: HudStrategy?,
    val tournamentSafe: Boolean,
    val caddie: HudCaddieHint?,
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
            caddie = null,
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

        val caddie = if (json.has("caddie") && !json.isNull("caddie")) {
            try {
                val raw = json.opt("caddie")
                val caddieJson = when (raw) {
                    is JSONObject -> raw
                    is String -> JSONObject(raw)
                    JSONObject.NULL -> null
                    else -> null
                }
                if (caddieJson != null) {
                    val club = caddieJson.optString("club").orEmpty()
                    if (club.isBlank() || !caddieJson.has("carry_m")) {
                        null
                    } else {
                        val carry = caddieJson.optDouble("carry_m")
                        if (!carry.isFinite()) {
                            null
                        } else {
                            val aimJson = when (val aimRaw = caddieJson.opt("aim")) {
                                is JSONObject -> aimRaw
                                is String -> JSONObject(aimRaw)
                                else -> null
                            }
                            val aimDir = aimJson?.optString("dir")?.takeIf { it == "L" || it == "C" || it == "R" }
                            val aimOffset = aimJson?.optDouble("offset_m")?.takeIf { it.isFinite() }
                            val risk = when (caddieJson.optString("risk")) {
                                "safe", "neutral", "aggressive" -> caddieJson.optString("risk")
                                else -> "neutral"
                            }
                            val totalRaw = caddieJson.opt("total_m")
                            val total = when (totalRaw) {
                                is Number -> totalRaw.toDouble().takeIf { it.isFinite() }
                                is String -> totalRaw.toDoubleOrNull()
                                else -> null
                            }
                            val confidenceRaw = caddieJson.opt("confidence")
                            val confidence = when (confidenceRaw) {
                                is Number -> confidenceRaw.toDouble().takeIf { it.isFinite() }
                                is String -> confidenceRaw.toDoubleOrNull()
                                else -> null
                            }
                            HudCaddieHint(
                                club = club,
                                carryM = carry,
                                totalM = total,
                                aimDir = aimDir,
                                aimOffsetM = aimOffset,
                                risk = risk,
                                confidence = confidence,
                            )
                        }
                    }
                } else {
                    null
                }
            } catch (ignored: Exception) {
                null
            }
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
            caddie = caddie,
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
        state.caddie?.let { hint ->
            builder.append(",\"caddie\":{")
            builder.append("\"club\":\"")
            builder.append(hint.club)
            builder.append("\",\"carry_m\":")
            builder.appendNumber(hint.carryM)
            hint.totalM?.let { total ->
                builder.append(",\"total_m\":")
                builder.appendNumber(total)
            }
            val aimDir = hint.aimDir
            if (!aimDir.isNullOrBlank()) {
                builder.append(",\"aim\":{")
                builder.append("\"dir\":\"")
                builder.append(aimDir)
                builder.append('"')
                hint.aimOffsetM?.let { offset ->
                    builder.append(",\"offset_m\":")
                    builder.appendNumber(offset)
                }
                builder.append('}')
            }
            builder.append(",\"risk\":\"")
            builder.append(hint.risk)
            builder.append('"')
            hint.confidence?.let { confidence ->
                builder.append(",\"confidence\":")
                builder.appendNumber(confidence)
            }
            builder.append('}')
        }
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
