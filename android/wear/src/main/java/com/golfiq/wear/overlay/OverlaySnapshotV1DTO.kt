package com.golfiq.wear.overlay

import org.json.JSONArray
import org.json.JSONObject
import kotlin.text.Charsets

data class OverlaySnapshotV1DTO(
    val version: Int,
    val size: Size,
    val ring: List<Pair<Float, Float>>,
    val corridor: List<Pair<Float, Float>>,
    val labelsAllowed: Boolean,
    val meta: Meta?,
) {
    data class Size(val w: Float, val h: Float)

    data class Meta(val club: String?, val p50_m: Float?)

    val hasRing: Boolean get() = ring.size >= 3
    val hasCorridor: Boolean get() = corridor.size >= 3

    companion object {
        fun fromJsonBytes(bytes: ByteArray): OverlaySnapshotV1DTO? {
            val json = bytes.toString(Charsets.UTF_8)
            return fromJsonString(json)
        }

        fun fromJsonString(json: String): OverlaySnapshotV1DTO? {
            return try {
                val root = JSONObject(json)
                val versionValue = root.opt("v")
                val version = when (versionValue) {
                    is Number -> versionValue.toInt()
                    is String -> versionValue.toIntOrNull() ?: 0
                    else -> 0
                }
                if (version != 1) {
                    throw IllegalArgumentException("Unsupported overlay version $version")
                }
                val sizeObject = root.optJSONObject("size") ?: JSONObject()
                val size = Size(
                    w = sizeObject.optDouble("w", 1.0).toFloat(),
                    h = sizeObject.optDouble("h", 1.0).toFloat(),
                )
                val ring = root.optJSONArray("ring")?.toPointList() ?: emptyList()
                val corridor = root.optJSONArray("corridor")?.toPointList() ?: emptyList()
                val labelsAllowed = root.optBoolean("labelsAllowed", false)
                val meta = root.optJSONObject("meta")?.let { metaObject ->
                    val club = (metaObject.opt("club") as? String)?.takeIf { it.isNotBlank() }
                    val p50 = metaObject.optDouble("p50_m")
                    val p50Value = if (p50.isFinite()) p50.toFloat() else null
                    if (club == null && p50Value == null) {
                        null
                    } else {
                        Meta(club = club, p50_m = p50Value)
                    }
                }
                OverlaySnapshotV1DTO(
                    version = version,
                    size = size,
                    ring = ring,
                    corridor = corridor,
                    labelsAllowed = labelsAllowed,
                    meta = meta,
                )
            } catch (_: Exception) {
                null
            }
        }
    }
}

private fun JSONArray.toPointList(): List<Pair<Float, Float>> {
    val points = mutableListOf<Pair<Float, Float>>()
    for (i in 0 until length()) {
        val pair = optJSONArray(i) ?: continue
        val x = pair.optDouble(0)
        val y = pair.optDouble(1)
        if (x.isFinite() && y.isFinite()) {
            points += Pair(x.toFloat(), y.toFloat())
        }
    }
    return points
}
