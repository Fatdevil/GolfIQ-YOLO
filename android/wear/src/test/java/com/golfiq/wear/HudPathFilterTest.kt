package com.golfiq.wear

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class HudPathFilterTest {
    object Paths {
        const val HUD = "/golfiq/hud/v1"
        const val OTHER = "/foo"
    }

    private fun matches(path: String): Boolean = path.startsWith(Paths.HUD)

    @Test
    fun matchesHudPath() {
        assertThat(matches("/golfiq/hud/v1")).isTrue()
        assertThat(matches("/golfiq/hud/v1/extra")).isTrue()
        assertThat(matches(Paths.OTHER)).isFalse()
    }
}
