package com.golfiq.wear

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class HudCodecTest {
    @Test
    fun encodeProducesJsonPayload() {
        val state = HudState(
            timestamp = 1716400000000L,
            fmb = HudDistances(front = 128.0, middle = 134.0, back = 140.0),
            playsLikePct = 6.5,
            wind = HudWind(mps = 3.2, deg = 270.0),
            strategy = null,
            tournamentSafe = false,
        )

        val encoded = HudCodec.encode(state)
        val json = String(encoded)

        assertThat(json).contains("\"v\":1")
        assertThat(json).contains("\"fmb\"")
    }
}
