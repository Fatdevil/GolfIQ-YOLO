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
    fun updatesStateOnNewBytes() = runTest {
        val viewModel = HudViewModel()
        assertThat(viewModel.hudState.value).isEqualTo(HudState.EMPTY)

        val state = HudState(
            timestamp = 1716402000000L,
            fmb = HudDistances(front = 150.0, middle = 156.5, back = 163.0),
            playsLikePct = 2.75,
            wind = HudWind(mps = 4.2, deg = 180.0),
            strategy = HudStrategy(
                profile = StrategyProfile.CONSERVATIVE,
                offsetM = 3.0,
                carryM = 158.0,
            ),
            tournamentSafe = false,
        )

        viewModel.onPayload(HudCodec.encode(state))

        assertThat(viewModel.hudState.value).isEqualTo(state)
    }
}
