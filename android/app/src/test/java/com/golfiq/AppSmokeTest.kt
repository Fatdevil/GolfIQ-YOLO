package com.golfiq

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AppSmokeTest {
    @Test
    fun appIdIsConfigured() {
        assertThat(BuildConfig.APPLICATION_ID).isEqualTo("com.golfiq")
    }
}
