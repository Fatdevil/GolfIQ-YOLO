package com.golfiq.watch

import com.google.common.truth.Truth.assertThat
import com.golfiq.shared.playslike.PlaysLikeService
import org.junit.Test

class HudCodecTest {
    @Test
    fun playsLikeComputeProducesResult() {
        val options = PlaysLikeService.Options(kS = 0.5, kHW = 0.2)
        val result = PlaysLikeService.compute(150.0, 5.0, -3.0, options)
        assertThat(result.distanceEff).isFinite()
        assertThat(result.components.slopeM).isEqualTo(2.5)
        assertThat(result.components.windM).isEqualTo(-0.6000000000000001)
    }
}
