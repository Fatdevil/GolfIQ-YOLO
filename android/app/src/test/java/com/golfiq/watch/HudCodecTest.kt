package com.golfiq.watch

import java.nio.charset.StandardCharsets
import kotlin.test.assertEquals
import org.junit.Test

class HudCodecTest {
    @Test
    fun encodeProducesDeterministicJson() {
        val state = WatchHudStateV1(
            ts = 1716400000000L,
            fmb = WatchHudDistances(front = 128.0, middle = 134.0, back = 140.0),
            playsLikePct = 6.5,
            wind = WatchHudWind(mps = 3.2, deg = 270.0),
            strategy = WatchHudStrategy(StrategyProfile.NEUTRAL, offsetM = -4.0, carryM = 136.0),
            tournamentSafe = false,
        )
        val encoded = HudCodec.encode(state)
        val json = String(encoded, StandardCharsets.UTF_8)
        assertEquals(
            "{\"v\":1,\"ts\":1716400000000,\"fmb\":{\"front\":128,\"middle\":134,\"back\":140},\"playsLikePct\":6.5,\"wind\":{\"mps\":3.2,\"deg\":270},\"strategy\":{\"profile\":\"neutral\",\"offset_m\":-4,\"carry_m\":136},\"tournamentSafe\":false}",
            json,
        )
    }

    @Test
    fun encodeOmitsStrategyWhenMissing() {
        val state = WatchHudStateV1(
            ts = 1716401234567L,
            fmb = WatchHudDistances(front = 102.0, middle = 110.5, back = 119.0),
            playsLikePct = -3.25,
            wind = WatchHudWind(mps = 5.0, deg = 45.0),
            strategy = null,
            tournamentSafe = true,
        )
        val encoded = HudCodec.encode(state)
        val json = String(encoded, StandardCharsets.UTF_8)
        assertEquals(
            "{\"v\":1,\"ts\":1716401234567,\"fmb\":{\"front\":102,\"middle\":110.5,\"back\":119},\"playsLikePct\":-3.25,\"wind\":{\"mps\":5,\"deg\":45},\"tournamentSafe\":true}",
            json,
        )
    }
}
