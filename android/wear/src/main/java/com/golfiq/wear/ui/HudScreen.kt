package com.golfiq.wear.ui

import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.Text
import com.golfiq.wear.HudCaddieHint
import com.golfiq.wear.HudState
import com.golfiq.wear.HudStrategy
import com.golfiq.wear.overlay.WearOverlay
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.Wearable
import java.nio.charset.StandardCharsets
import java.util.Locale
import kotlin.math.absoluteValue
import kotlin.math.roundToInt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

@Composable
fun HudRoute(viewModel: HudViewModel = viewModel()) {
    val hudState by viewModel.hudState.collectAsStateWithLifecycle(initialValue = HudState.EMPTY)
    val overlay by viewModel.overlayState.collectAsStateWithLifecycle(initialValue = null)
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    Box(modifier = Modifier.fillMaxSize()) {
        WearOverlay(snapshot = overlay)
        HudScreen(
            state = hudState,
            modifier = Modifier.fillMaxSize(),
            onUseClub = { hint ->
                scope.launch {
                    sendCaddieAccept(context, hint.club)
                }
            },
        )
    }
}

@Composable
fun HudScreen(
    state: HudState,
    modifier: Modifier = Modifier,
    onUseClub: ((HudCaddieHint) -> Unit)? = null,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.SpaceEvenly,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceEvenly,
        ) {
            DistanceColumn(label = "F", value = formatDistance(state.fmb.front, state.hasData))
            DistanceColumn(label = "M", value = formatDistance(state.fmb.middle, state.hasData))
            DistanceColumn(label = "B", value = formatDistance(state.fmb.back, state.hasData))
        }

        state.caddie?.let { hint ->
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = formatCaddie(hint),
                fontSize = 14.sp,
                textAlign = TextAlign.Center,
            )
            if (onUseClub != null) {
                Spacer(modifier = Modifier.height(4.dp))
                Button(onClick = { onUseClub(hint) }) {
                    Text(
                        text = "Use club",
                        fontSize = 12.sp,
                        textAlign = TextAlign.Center,
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = "PL ${formatPercent(state.playsLikePct, state.hasData)}",
            fontSize = 18.sp,
            textAlign = TextAlign.Center,
        )

        Text(
            text = "Wind ${formatWind(state, state.hasData)}",
            fontSize = 16.sp,
            textAlign = TextAlign.Center,
        )

        if (!state.tournamentSafe && state.strategy != null) {
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = formatStrategy(state.strategy),
                fontSize = 14.sp,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
private fun DistanceColumn(label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = label,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Text(
            text = value,
            fontSize = 24.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
        )
    }
}

private fun formatDistance(value: Double, hasData: Boolean): String {
    if (!hasData) return "--"
    val rounded = value.roundToInt()
    return String.format(Locale.US, "%d", rounded)
}

private fun formatPercent(value: Double, hasData: Boolean): String {
    if (!hasData) return "--"
    return String.format(Locale.US, "%+.1f%%", value)
}

private fun formatWind(state: HudState, hasData: Boolean): String {
    if (!hasData) return "--"
    val speed = state.wind.mps
    val direction = state.wind.deg
    return String.format(Locale.US, "%.0fm/s @ %.0f°", speed, direction)
}

private fun formatCaddie(hint: HudCaddieHint): String {
    val club = hint.club
    val carry = hint.carryM.roundToInt()
    val aimSegment = when (hint.aimDir) {
        "L" -> "L${hint.aimOffsetM?.absoluteValue?.roundToInt()?.let { "${it}m" } ?: ""}"
        "R" -> "R${hint.aimOffsetM?.absoluteValue?.roundToInt()?.let { "${it}m" } ?: ""}"
        "C" -> "C"
        else -> "C"
    }
    val riskInitial = hint.risk.firstOrNull()?.uppercaseChar() ?: 'N'
    return "🏌  $club • ${carry}m • $aimSegment • $riskInitial"
}

private fun formatStrategy(strategy: HudStrategy): String {
    val profile = strategy.profile.name.lowercase(Locale.US).replaceFirstChar { it.titlecase(Locale.US) }
    val carry = String.format(Locale.US, "%dm", strategy.carryM.roundToInt())
    val offset = if (strategy.offsetM.absoluteValue < 0.5) {
        "even"
    } else {
        String.format(Locale.US, "%+.0fm", strategy.offsetM)
    }
    return "Strategy $profile $carry ($offset)"
}

private const val WATCH_MESSAGE_PATH = "/golfiq/watch/msg"

private suspend fun sendCaddieAccept(context: Context, club: String): Boolean {
    return withContext(Dispatchers.IO) {
        runCatching {
            val nodes = Tasks.await(Wearable.getNodeClient(context).connectedNodes)
            if (nodes.isEmpty()) {
                return@withContext false
            }
            val payload = JSONObject()
                .put("type", "CADDIE_ACCEPTED_V1")
                .put("club", club)
                .toString()
                .toByteArray(StandardCharsets.UTF_8)
            val messageClient = Wearable.getMessageClient(context)
            var delivered = false
            for (node in nodes) {
                val task = messageClient.sendMessage(node.id, WATCH_MESSAGE_PATH, payload)
                Tasks.await(task)
                delivered = true
            }
            delivered
        }.getOrElse { false }
    }
}
