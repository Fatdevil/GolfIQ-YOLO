package com.golfiq.wear.tile

import androidx.concurrent.futures.CallbackToFutureAdapter
import androidx.wear.tiles.DimensionBuilders
import androidx.wear.tiles.LayoutElementBuilders
import androidx.wear.tiles.RequestBuilders.ResourcesRequest
import androidx.wear.tiles.RequestBuilders.TileRequest
import androidx.wear.tiles.ResourceBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.tiles.TileService
import androidx.wear.tiles.TimelineBuilders
import com.golfiq.wear.HudState
import com.golfiq.wear.data.HudStateRepository
import com.google.common.util.concurrent.ListenableFuture
import java.util.Locale
import kotlin.math.absoluteValue
import kotlin.math.roundToInt

private const val RESOURCES_VERSION = "1"

class HudTileService : TileService() {
    override fun onTileRequest(requestParams: TileRequest): ListenableFuture<TileBuilders.Tile> {
        return CallbackToFutureAdapter.getFuture { completer ->
            val state = HudStateRepository.latest()
            completer.set(buildTile(state))
            "HudTileRequest"
        }
    }

    override fun onResourcesRequest(requestParams: ResourcesRequest): ListenableFuture<ResourceBuilders.Resources> {
        return CallbackToFutureAdapter.getFuture { completer ->
            completer.set(
                ResourceBuilders.Resources.Builder()
                    .setVersion(RESOURCES_VERSION)
                    .build()
            )
            "HudTileResources"
        }
    }

    private fun buildTile(state: HudState): TileBuilders.Tile {
        val column = LayoutElementBuilders.Column.Builder()
            .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
            .addContent(
                LayoutElementBuilders.Text.Builder()
                    .setText(formatFmb(state))
                    .setFontStyle(
                        LayoutElementBuilders.FontStyle.Builder()
                            .setSize(
                                DimensionBuilders.SpProp.Builder()
                                    .setValue(18f)
                                    .build()
                            )
                            .build()
                    )
                    .build()
            )
            .addContent(
                LayoutElementBuilders.Text.Builder()
                    .setText(formatPl(state))
                    .setFontStyle(
                        LayoutElementBuilders.FontStyle.Builder()
                            .setSize(
                                DimensionBuilders.SpProp.Builder()
                                    .setValue(14f)
                                    .build()
                            )
                            .build()
                    )
                    .build()
            )
            .apply {
                if (!state.tournamentSafe && state.caddie != null) {
                    addContent(
                        LayoutElementBuilders.Text.Builder()
                            .setText(formatCaddie(state))
                            .setFontStyle(
                                LayoutElementBuilders.FontStyle.Builder()
                                    .setSize(
                                        DimensionBuilders.SpProp.Builder()
                                            .setValue(12f)
                                            .build()
                                    )
                                    .build()
                            )
                            .build()
                    )
                }
            }
            .build()

        val layout = LayoutElementBuilders.Layout.Builder()
            .setRoot(column)
            .build()

        val entry = TimelineBuilders.TimelineEntry.Builder()
            .setLayout(layout)
            .build()

        val timeline = TimelineBuilders.Timeline.Builder()
            .addTimelineEntry(entry)
            .build()

        return TileBuilders.Tile.Builder()
            .setResourcesVersion(RESOURCES_VERSION)
            .setTimeline(timeline)
            .build()
    }

    private fun formatFmb(state: HudState): String {
        return if (!state.hasData) {
            "F -- | M -- | B --"
        } else {
            String.format(
                Locale.US,
                "F %d | M %d | B %d",
                state.fmb.front.roundToInt(),
                state.fmb.middle.roundToInt(),
                state.fmb.back.roundToInt(),
            )
        }
    }

    private fun formatPl(state: HudState): String {
        return if (!state.hasData) {
            "PL --"
        } else {
            String.format(Locale.US, "PL %+.1f%%", state.playsLikePct)
        }
    }

    private fun formatCaddie(state: HudState): String {
        val hint = state.caddie ?: return ""
        val aimSegment = when (hint.aimDir) {
            "L" -> "L${hint.aimOffsetM?.absoluteValue?.roundToInt()?.let { "${it}m" } ?: ""}"
            "R" -> "R${hint.aimOffsetM?.absoluteValue?.roundToInt()?.let { "${it}m" } ?: ""}"
            "C" -> "C"
            else -> "C"
        }
        val riskInitial = hint.risk.firstOrNull()?.uppercaseChar() ?: 'N'
        return String.format(
            Locale.US,
            "🏌  %s • %dm • %s • %c",
            hint.club,
            hint.carryM.roundToInt(),
            aimSegment,
            riskInitial,
        )
    }
}
