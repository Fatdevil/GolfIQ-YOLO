package com.golfiq.bench.runtime.model

data class Detection(
    val score: Float,
    val classId: Int,
    val x1: Float,
    val y1: Float,
    val x2: Float,
    val y2: Float,
)
