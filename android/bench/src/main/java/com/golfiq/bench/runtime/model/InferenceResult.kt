package com.golfiq.bench.runtime.model

data class InferenceResult(
    val detections: List<Detection>,
    val latencyMillis: Long,
)
