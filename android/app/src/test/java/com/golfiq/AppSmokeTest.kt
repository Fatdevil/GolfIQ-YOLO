package com.golfiq

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AppSmokeTest {
    @Test
    fun additionIsCorrect() {
        assertThat(1 + 1 == 2).isTrue()
    }
}
