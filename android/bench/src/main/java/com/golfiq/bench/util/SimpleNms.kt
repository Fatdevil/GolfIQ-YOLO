package com.golfiq.bench.util

import com.golfiq.bench.runtime.model.Detection
import kotlin.math.max
import kotlin.math.min

object SimpleNms {
    fun apply(detections: List<Detection>, iouThreshold: Float = 0.45f): List<Detection> {
        if (detections.isEmpty()) return emptyList()
        val sorted = detections.sortedByDescending { it.score }
        val result = mutableListOf<Detection>()
        val suppressed = BooleanArray(sorted.size)
        for (i in sorted.indices) {
            if (suppressed[i]) continue
            val candidate = sorted[i]
            result += candidate
            for (j in i + 1 until sorted.size) {
                if (suppressed[j]) continue
                val other = sorted[j]
                if (iou(candidate, other) > iouThreshold) {
                    suppressed[j] = true
                }
            }
        }
        return result
    }

    private fun iou(a: Detection, b: Detection): Float {
        val areaA = (a.x2 - a.x1) * (a.y2 - a.y1)
        val areaB = (b.x2 - b.x1) * (b.y2 - b.y1)
        if (areaA <= 0f || areaB <= 0f) return 0f
        val x1 = max(a.x1, b.x1)
        val y1 = max(a.y1, b.y1)
        val x2 = min(a.x2, b.x2)
        val y2 = min(a.y2, b.y2)
        val interWidth = max(0f, x2 - x1)
        val interHeight = max(0f, y2 - y1)
        val intersection = interWidth * interHeight
        val union = areaA + areaB - intersection
        return if (union <= 0f) 0f else intersection / union
    }
}
