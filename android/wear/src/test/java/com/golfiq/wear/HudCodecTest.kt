package com.golfiq.wear

import com.golfiq.wear.HudOverlayMini
import com.golfiq.wear.HudOverlayMiniDistances
import com.golfiq.wear.HudOverlayMiniPin
import com.golfiq.wear.HudOverlayMiniPinSection
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
            caddie = null,
            overlayMini = HudOverlayMini(
                fmb = HudOverlayMiniDistances(f = 126.0, m = 134.0, b = 142.0),
                pin = HudOverlayMiniPin(section = HudOverlayMiniPinSection.MIDDLE),
            ),
        )

        val encoded = HudCodec.encode(state)
        val json = String(encoded)

        assertThat(json).contains("\"v\":1")
        assertThat(json).contains("\"fmb\"")
        assertThat(json).contains("\"overlayMini\"")
    }

    @Test
    fun decodeParsesOptionalCaddie() {
        val json = """
            {
              "v":1,
              "ts":123,
              "fmb":{"front":120,"middle":125,"back":130},
              "playsLikePct":2.5,
              "wind":{"mps":1.2,"deg":45},
              "tournamentSafe":true,
              "caddie":{
                "club":"7i",
                "carry_m":152.4,
                "total_m":160.0,
                "aim":{"dir":"R","offset_m":5.1},
                "risk":"aggressive",
                "confidence":0.62
              }
            }
        """.trimIndent()

        val state = HudCodec.decode(json.toByteArray())

        assertThat(state.caddie).isNotNull()
        val hint = state.caddie!!
        assertThat(hint.club).isEqualTo("7i")
        assertThat(hint.carryM).isWithin(0.0001).of(152.4)
        assertThat(hint.aimDir).isEqualTo("R")
        assertThat(hint.aimOffsetM).isWithin(0.0001).of(5.1)
        assertThat(hint.risk).isEqualTo("aggressive")
    }

    @Test
    fun decodeParsesOverlayMini() {
        val json = """
            {
              "v":1,
              "ts":42,
              "fmb":{"front":120,"middle":125,"back":130},
              "playsLikePct":2.5,
              "wind":{"mps":1.2,"deg":45},
              "tournamentSafe":true,
              "overlayMini":{
                "fmb":{"f":118,"m":126,"b":134},
                "pin":{"section":"back"}
              }
            }
        """.trimIndent()

        val state = HudCodec.decode(json.toByteArray())

        assertThat(state.overlayMini).isNotNull()
        val overlay = state.overlayMini!!
        assertThat(overlay.fmb.f).isWithin(0.0001).of(118.0)
        assertThat(overlay.fmb.m).isWithin(0.0001).of(126.0)
        assertThat(overlay.fmb.b).isWithin(0.0001).of(134.0)
        assertThat(overlay.pin?.section).isEqualTo(HudOverlayMiniPinSection.BACK)
    }
}
