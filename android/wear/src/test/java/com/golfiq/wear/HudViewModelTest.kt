package com.golfiq.wear

import com.golfiq.wear.data.HudStateRepository
import com.golfiq.wear.ui.HudViewModel
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.json.JSONObject

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

    @Test
    fun mergesAdviceFromMessage() = runTest {
        val viewModel = HudViewModel()
        val base = """
            {"v":1,"ts":1,"fmb":{"front":120,"middle":130,"back":140},"playsLikePct":0,"wind":{"mps":0,"deg":0},"tournamentSafe":false}
        """.trimIndent()
        viewModel.onPayload(base.toByteArray())

        val advice = JSONObject()
            .put("club", "8i")
            .put("carry_m", 140.0)
            .put("risk", "aggressive")
        HudStateRepository.updateCaddieAdvice(advice)

        val hint = viewModel.hudState.value.caddie
        assertThat(hint?.club).isEqualTo("8i")
        assertThat(hint?.risk).isEqualTo("aggressive")
    }
}
