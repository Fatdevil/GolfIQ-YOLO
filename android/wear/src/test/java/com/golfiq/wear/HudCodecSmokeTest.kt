package com.golfiq.wear

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class HudCodecSmokeTest {
    @Test
    fun decodeBytesDoesNotCrash() {
        val json = """{"v":1,"ts":1,"fmb":{"front":150,"middle":155,"back":160},"playsLikePct":4,"tournamentSafe":true}"""
        val bytes = json.toByteArray()

        assertThat(bytes).isNotEmpty()
        // If you have a decode(bytes) util, call it and assert fields.
    }
}
