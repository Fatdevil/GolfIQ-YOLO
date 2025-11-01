package com.golfiq.wear

import org.junit.Assert.assertEquals
import org.junit.Test

class HudCodecTest {
    @Test
    fun roundTripWithStrategy() {
        val state = HudState(
            timestamp = 1716400000000L,
            fmb = HudDistances(front = 128.0, middle = 134.0, back = 140.0),
            playsLikePct = 6.5,
            wind = HudWind(mps = 3.2, deg = 270.0),
            strategy = HudStrategy(
                profile = StrategyProfile.NEUTRAL,
                offsetM = -4.0,
                carryM = 136.0,
            ),
            tournamentSafe = false,
        )

        val encoded = HudCodec.encode(state)
        val decoded = HudCodec.decode(encoded)

        assertEquals(state, decoded)
    }

    @Test
    fun roundTripWithoutStrategy() {
        val state = HudState(
            timestamp = 1716401234567L,
            fmb = HudDistances(front = 102.0, middle = 110.5, back = 119.0),
            playsLikePct = -3.25,
            wind = HudWind(mps = 5.0, deg = 45.0),
            strategy = null,
            tournamentSafe = true,
        )

        val encoded = HudCodec.encode(state)
        val decoded = HudCodec.decode(encoded)

        assertEquals(state, decoded)
    }
}
