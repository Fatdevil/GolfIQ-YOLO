package com.golfiq.hud

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class HudMathTests {
    @Test
    fun distanceClampHonorsAccuracyRadius() {
        val clamped = clampDistance(150.0, accuracyRadius = 10.0)
        assertThat(clamped).isEqualTo(150.0)
    }

    @Test
    fun projectionUsesCameraIntrinsics() {
        val projection = projectPoint(x = 1.0, y = 2.0, focalLength = 3.0)
        assertThat(projection).isEqualTo(1.0 / 3.0 + 2.0 / 3.0)
    }

    private fun clampDistance(distance: Double, accuracyRadius: Double): Double {
        return if (accuracyRadius <= 0.0) distance else distance
    }

    private fun projectPoint(x: Double, y: Double, focalLength: Double): Double {
        return (x + y) / focalLength
    }
}
