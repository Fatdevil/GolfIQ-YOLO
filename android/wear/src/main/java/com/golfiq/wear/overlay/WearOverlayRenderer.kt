package com.golfiq.wear.overlay

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path

private fun clamp(value: Float): Float = value.coerceIn(0f, 1f)

fun corridorFillColor(isDark: Boolean): Color =
    if (isDark) Color(0xFF60A5FA).copy(alpha = 0.28f) else Color(0xFF3B82F6).copy(alpha = 0.22f)

fun corridorStrokeColor(isDark: Boolean): Color =
    if (isDark) Color(0xFF60A5FA).copy(alpha = 0.55f) else Color(0xFF60A5FA).copy(alpha = 0.48f)

fun ringFillColor(isDark: Boolean): Color =
    if (isDark) Color(0xFF67E8F9).copy(alpha = 0.24f) else Color(0xFF22D3EE).copy(alpha = 0.2f)

fun ringStrokeColor(isDark: Boolean): Color =
    if (isDark) Color(0xFF67E8F9).copy(alpha = 0.6f) else Color(0xFF38BDF8).copy(alpha = 0.55f)

fun labelColor(isDark: Boolean): Color = if (isDark) Color.White.copy(alpha = 0.9f) else Color.Black.copy(alpha = 0.75f)

fun buildPath(points: List<Pair<Float, Float>>, width: Float, height: Float): Path? {
    if (points.size < 3) return null
    val path = Path()
    var moved = false
    points.forEach { pair ->
        val x = clamp(pair.first) * width
        val y = clamp(pair.second) * height
        if (!moved) {
            path.moveTo(x, y)
            moved = true
        } else {
            path.lineTo(x, y)
        }
    }
    if (moved) {
        path.close()
    }
    return if (moved) path else null
}

fun centroid(points: List<Pair<Float, Float>>, width: Float, height: Float): Offset? {
    if (points.isEmpty()) return null
    var sumX = 0f
    var sumY = 0f
    var count = 0
    points.forEach { pair ->
        val x = clamp(pair.first) * width
        val y = clamp(pair.second) * height
        sumX += x
        sumY += y
        count += 1
    }
    if (count == 0) return null
    return Offset(sumX / count, sumY / count)
}
