package com.golfiq.wear

import java.nio.charset.StandardCharsets
import java.util.Locale
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

data class HudOverlayMiniDistances(
    val f: Double,
    val m: Double,
    val b: Double,
)

enum class HudOverlayMiniPinSection(val wireName: String) {
    FRONT("front"),
    MIDDLE("middle"),
    BACK("back");

    companion object {
        fun fromWireName(value: String): HudOverlayMiniPinSection? {
            val normalized = value.lowercase(Locale.US)
            return values().firstOrNull { it.wireName == normalized }
        }
    }
}

data class HudOverlayMiniPin(
    val section: HudOverlayMiniPinSection,
)

data class HudOverlayMini(
    val fmb: HudOverlayMiniDistances,
    val pin: HudOverlayMiniPin?,
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
    val overlayMini: HudOverlayMini?,
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
            overlayMini = null,
        )
    }
}

object HudCodec {
    private const val VERSION = 1

    private fun parseCaddieHint(raw: Any?): HudCaddieHint? {
        if (raw == null || raw == JSONObject.NULL) {
            return null
        }
        return try {
            val caddieJson = when (raw) {
                is JSONObject -> raw
                is String -> JSONObject(raw)
                else -> return null
            }
            val club = caddieJson.optString("club").orEmpty()
            if (club.isBlank() || !caddieJson.has("carry_m")) {
                return null
            }
            val carry = caddieJson.optDouble("carry_m")
            if (!carry.isFinite()) {
                return null
            }
            val aimJson = when (val aimRaw = caddieJson.opt("aim")) {
                is JSONObject -> aimRaw
                is String -> runCatching { JSONObject(aimRaw) }.getOrNull()
                else -> null
            }
            val aimDir = aimJson?.optString("dir")?.takeIf { it == "L" || it == "C" || it == "R" }
            val aimOffset = aimJson?.opt("offset_m")?.let { candidate ->
                when (candidate) {
                    is Number -> candidate.toDouble().takeIf { it.isFinite() }
                    is String -> candidate.toDoubleOrNull()
                    else -> null
                }
            }
            val risk = when (caddieJson.optString("risk")) {
                "safe", "neutral", "aggressive" -> caddieJson.optString("risk")
                else -> "neutral"
            }
            val total = when (val totalRaw = caddieJson.opt("total_m")) {
                is Number -> totalRaw.toDouble().takeIf { it.isFinite() }
                is String -> totalRaw.toDoubleOrNull()
                else -> null
            }
            val confidence = when (val confidenceRaw = caddieJson.opt("confidence")) {
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
        } catch (_: Exception) {
            null
        }
    }

    fun parseAdvice(raw: Any?): HudCaddieHint? = parseCaddieHint(raw)

    private fun parseOverlayMini(raw: Any?): HudOverlayMini? {
        if (raw == null || raw == JSONObject.NULL) {
            return null
        }
        val json = when (raw) {
            is JSONObject -> raw
            is String -> runCatching { JSONObject(raw) }.getOrNull()
            else -> null
        } ?: return null
        val fmbJson = when (val fmbRaw = json.opt("fmb")) {
            is JSONObject -> fmbRaw
            is String -> runCatching { JSONObject(fmbRaw) }.getOrNull()
            JSONObject.NULL -> null
            else -> null
        } ?: return null
        val front = fmbJson.optDouble("f")
        val middle = fmbJson.optDouble("m")
        val back = fmbJson.optDouble("b")
        if (!front.isFinite() || !middle.isFinite() || !back.isFinite()) {
            return null
        }
        val pin = when (val rawPin = json.opt("pin")) {
            is JSONObject -> rawPin
            is String -> runCatching { JSONObject(rawPin) }.getOrNull()
            JSONObject.NULL -> null
            else -> null
        }?.let { pinJson ->
            val sectionWire = pinJson.optString("section")
            HudOverlayMiniPinSection.fromWireName(sectionWire)?.let { HudOverlayMiniPin(it) }
        }
        return HudOverlayMini(
            fmb = HudOverlayMiniDistances(f = front, m = middle, b = back),
            pin = pin,
        )
    }

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

        val caddie = parseCaddieHint(json.opt("caddie"))
        val overlayMini = parseOverlayMini(json.opt("overlayMini"))

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
            overlayMini = overlayMini,
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
        state.overlayMini?.let { overlay ->
            builder.append(",\"overlayMini\":{")
            builder.append("\"fmb\":{")
            builder.append("\"f\":")
            builder.appendNumber(overlay.fmb.f)
            builder.append(",\"m\":")
            builder.appendNumber(overlay.fmb.m)
            builder.append(",\"b\":")
            builder.appendNumber(overlay.fmb.b)
            builder.append('}')
            overlay.pin?.let { pin ->
                builder.append(",\"pin\":{")
                builder.append("\"section\":\"")
                builder.append(pin.section.wireName)
                builder.append('"')
                builder.append('}')
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
