package com.golfiq.wear

import com.golfiq.wear.data.HudStateRepository
import com.golfiq.wear.ui.HudViewModel
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Before
import org.junit.Test

class HudViewModelTest {
    @Before
    fun setUp() {
        HudStateRepository.reset()
    }

    @After
    fun tearDown() {
        HudStateRepository.reset()
    }

    @Test
    fun retainsStateWhenPayloadMalformed() = runTest {
        val viewModel = HudViewModel()
        val initial = viewModel.hudState.value

        viewModel.onPayload("{}".toByteArray())

        assertThat(viewModel.hudState.value).isEqualTo(initial)
    }
}
