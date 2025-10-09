package com.golfiq.hud.arhud

import android.content.Context
import android.graphics.drawable.GradientDrawable
import android.util.AttributeSet
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import java.util.Locale

class ARHUDOverlayView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : FrameLayout(context, attrs) {

    val calibrateButton: Button = Button(context).apply { text = "Aim → Calibrate" }
    val recenterButton: Button = Button(context).apply { text = "Re-center" }
    val markButton: Button = Button(context).apply { text = "Mark" }
    val fieldRunStartButton: Button = Button(context).apply { text = "Start 9-hole" }
    val fieldRunNextButton: Button = Button(context).apply { text = "Next hole" }
    val fieldRunEndButton: Button = Button(context).apply { text = "End run" }
    private val statusLabel: TextView = TextView(context)
    private val frontLabel: TextView = TextView(context)
    private val centerLabel: TextView = TextView(context)
    private val backLabel: TextView = TextView(context)
    private val modeBadge: TextView = TextView(context)
    private val qaContainer: LinearLayout = LinearLayout(context)
    private val qaFpsLabel: TextView = TextView(context)
    private val qaLatencyLabel: TextView = TextView(context)
    private val qaTrackingLabel: TextView = TextView(context)
    private val qaEtagLabel: TextView = TextView(context)
    private val qaHoleLabel: TextView = TextView(context)
    private val qaRecenterLabel: TextView = TextView(context)
    private val qaPlaysLikeHeader: TextView = TextView(context)
    private val qaPlaysLikeDistanceLabel: TextView = TextView(context)
    private val qaPlaysLikeDeltaHLabel: TextView = TextView(context)
    private val qaPlaysLikeWindLabel: TextView = TextView(context)
    private val qaPlaysLikeKsLabel: TextView = TextView(context)
    private val qaPlaysLikeAlphaHeadLabel: TextView = TextView(context)
    private val qaPlaysLikeAlphaTailLabel: TextView = TextView(context)
    private val qaPlaysLikeEffLabel: TextView = TextView(context)
    private val qaPlaysLikeQualityLabel: TextView = TextView(context)
    private val playsLikeContainer: LinearLayout = LinearLayout(context)
    private val playsLikeHeadline: TextView = TextView(context)
    private val playsLikeDeltaLabel: TextView = TextView(context)
    private val playsLikeChipRow: LinearLayout = LinearLayout(context)
    private val playsLikeSlopeChip: TextView = TextView(context)
    private val playsLikeWindChip: TextView = TextView(context)
    private val playsLikeQualityBadge: TextView = TextView(context)

    enum class Mode {
        GEOSPATIAL,
        COMPASS,
    }

    init {
        setWillNotDraw(false)
        foregroundGravity = Gravity.BOTTOM

        statusLabel.apply {
            text = "Align with pin, then calibrate"
            setTextColor(ContextCompat.getColor(context, android.R.color.white))
            textSize = 12f
            gravity = Gravity.CENTER
        }

        modeBadge.apply {
            text = "Compass"
            setTextColor(ContextCompat.getColor(context, android.R.color.black))
            textSize = 12f
            val density = resources.displayMetrics.density
            val horizontal = (16 * density).toInt()
            val vertical = (6 * density).toInt()
            setPadding(horizontal, vertical, horizontal, vertical)
            background = GradientDrawable().apply {
                cornerRadius = 16 * density
                setColor(ContextCompat.getColor(context, android.R.color.white))
                alpha = (0.9f * 255).toInt()
            }
        }

        val distanceContainer = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.END
        }

        listOf(frontLabel to "F:", centerLabel to "C:", backLabel to "B:").forEach { (label, prefix) ->
            label.apply {
                text = "$prefix --"
                setTextColor(ContextCompat.getColor(context, android.R.color.white))
                textSize = 16f
            }
            distanceContainer.addView(label)
        }

        configurePlaysLike(distanceContainer)

        val controls = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            addView(calibrateButton)
            addView(recenterButton)
        }

        val stack = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            val density = resources.displayMetrics.density
            val horizontal = (16 * density).toInt()
            val vertical = (24 * density).toInt()
            setPadding(horizontal, vertical, horizontal, vertical * 2)
            gravity = Gravity.CENTER_HORIZONTAL or Gravity.BOTTOM
            addView(statusLabel)
            addView(controls)
            addView(distanceContainer)
        }

        addView(stack, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
            gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
        })
        addView(modeBadge, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
            gravity = Gravity.TOP or Gravity.START
            val density = resources.displayMetrics.density
            val margin = (12 * density).toInt()
            setMargins(margin, margin, margin, margin)
        })

        configureQaOverlay()
    }

    fun updateStatus(text: String) {
        post { statusLabel.text = text }
    }

    fun updateDistances(front: String, center: String, back: String) {
        post {
            frontLabel.text = "F: $front"
            centerLabel.text = "C: $center"
            backLabel.text = "B: $back"
        }
    }

    fun updateModeBadge(mode: Mode) {
        val label = when (mode) {
            Mode.GEOSPATIAL -> "Geospatial"
            Mode.COMPASS -> "Compass"
        }
        post { modeBadge.text = label }
    }

    fun setPlaysLikeVisible(visible: Boolean) {
        post { playsLikeContainer.visibility = if (visible) View.VISIBLE else View.GONE }
    }

    fun updatePlaysLike(distanceEff: Double, slope: Double, wind: Double, quality: String) {
        post {
            val total = slope + wind
            playsLikeDeltaLabel.text = String.format(
                Locale.US,
                "Plays-like: %.1f m (Δ %+.1f m)",
                distanceEff,
                total,
            )
            playsLikeSlopeChip.text = String.format(Locale.US, "slope %+.1f m", slope)
            playsLikeWindChip.text = String.format(Locale.US, "wind %+.1f m", wind)
            updateQualityBadge(quality)
        }
    }

    fun updatePlaysLikeQa(
        distanceMeters: Double,
        deltaHMeters: Double,
        windParallel: Double,
        kS: Double,
        alphaHead: Double,
        alphaTail: Double,
        eff: Double,
        quality: String,
    ) {
        post {
            qaPlaysLikeDistanceLabel.text = String.format(Locale.US, "D: %.1f m", distanceMeters)
            qaPlaysLikeDeltaHLabel.text = String.format(Locale.US, "Δh: %+0.1f m", deltaHMeters)
            qaPlaysLikeWindLabel.text = String.format(Locale.US, "W∥: %+0.1f m/s", windParallel)
            qaPlaysLikeKsLabel.text = String.format(Locale.US, "kS: %.2f", kS)
            qaPlaysLikeAlphaHeadLabel.text = String.format(Locale.US, "α_head: %.3f /mph", alphaHead)
            qaPlaysLikeAlphaTailLabel.text = String.format(Locale.US, "α_tail: %.3f /mph", alphaTail)
            qaPlaysLikeEffLabel.text = String.format(Locale.US, "Eff: %.1f m", eff)
            qaPlaysLikeQualityLabel.text = String.format(
                Locale.US,
                "Quality: %s",
                quality.uppercase(Locale.US),
            )
        }
    }

    private fun configurePlaysLike(parent: LinearLayout) {
        val density = resources.displayMetrics.density
        playsLikeContainer.orientation = LinearLayout.VERTICAL
        playsLikeContainer.visibility = View.GONE
        playsLikeContainer.setPadding(0, (8 * density).toInt(), 0, 0)

        playsLikeHeadline.apply {
            text = "Plays-like"
            setTextColor(ContextCompat.getColor(context, android.R.color.white))
            textSize = 14f
        }

        playsLikeQualityBadge.apply {
            text = "--"
            textSize = 11f
            setTextColor(ContextCompat.getColor(context, android.R.color.black))
            val horizontal = (10 * density).toInt()
            val vertical = (4 * density).toInt()
            setPadding(horizontal, vertical, horizontal, vertical)
            background = GradientDrawable().apply {
                cornerRadius = 12 * density
                setColor(ContextCompat.getColor(context, android.R.color.white))
                alpha = (0.85f * 255).toInt()
            }
        }

        playsLikeDeltaLabel.apply {
            text = "Plays-like: --"
            setTextColor(ContextCompat.getColor(context, android.R.color.darker_gray))
            textSize = 12f
        }

        playsLikeChipRow.orientation = LinearLayout.HORIZONTAL
        playsLikeChipRow.setPadding(0, (6 * density).toInt(), 0, 0)

        listOf(playsLikeSlopeChip, playsLikeWindChip).forEach { chip ->
            chip.text = "--"
            chip.textSize = 11f
            chip.setTextColor(ContextCompat.getColor(context, android.R.color.white))
            val horizontal = (10 * density).toInt()
            val vertical = (4 * density).toInt()
            chip.setPadding(horizontal, vertical, horizontal, vertical)
            chip.background = GradientDrawable().apply {
                cornerRadius = 999f
                setColor(ContextCompat.getColor(context, android.R.color.darker_gray))
                alpha = (0.5f * 255).toInt()
            }
        }

        playsLikeChipRow.addView(playsLikeSlopeChip)
        playsLikeChipRow.addView(playsLikeWindChip)

        val headerRow = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.END or Gravity.CENTER_VERTICAL
            addView(playsLikeHeadline)
            addView(playsLikeQualityBadge, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
                leftMargin = (8 * density).toInt()
            })
        }

        playsLikeContainer.addView(headerRow)
        playsLikeContainer.addView(playsLikeDeltaLabel)
        playsLikeContainer.addView(playsLikeChipRow)

        parent.addView(playsLikeContainer)
    }

    private fun updateQualityBadge(quality: String) {
        val normalized = quality.lowercase(Locale.US)
        val (label, colorRes) = when (normalized) {
            "good" -> "GOOD" to android.R.color.holo_green_light
            "warn" -> "WARN" to android.R.color.holo_orange_light
            else -> "LOW" to android.R.color.holo_red_light
        }
        playsLikeQualityBadge.text = label
        val density = resources.displayMetrics.density
        val drawable = playsLikeQualityBadge.background as? GradientDrawable
            ?: GradientDrawable().apply { cornerRadius = 12 * density }
        drawable.setColor(ContextCompat.getColor(context, colorRes))
        drawable.alpha = (0.85f * 255).toInt()
        playsLikeQualityBadge.background = drawable
    }

    private fun configureQaOverlay() {
        val density = resources.displayMetrics.density
        qaContainer.apply {
            orientation = LinearLayout.VERTICAL
            val padding = (12 * density).toInt()
            setPadding(padding, padding, padding, padding)
            background = GradientDrawable().apply {
                cornerRadius = 12 * density
                setColor(ContextCompat.getColor(context, android.R.color.black))
                alpha = (0.75f * 255).toInt()
            }
            visibility = View.GONE
        }

        val qaTitle = TextView(context).apply {
            text = "Field QA"
            setTextColor(ContextCompat.getColor(context, android.R.color.white))
            textSize = 14f
        }

        listOf(
            qaTitle,
            qaFpsLabel,
            qaLatencyLabel,
            qaTrackingLabel,
            qaEtagLabel,
            qaHoleLabel,
            qaRecenterLabel,
            qaPlaysLikeHeader,
            qaPlaysLikeDistanceLabel,
            qaPlaysLikeDeltaHLabel,
            qaPlaysLikeWindLabel,
            qaPlaysLikeKsLabel,
            qaPlaysLikeAlphaHeadLabel,
            qaPlaysLikeAlphaTailLabel,
            qaPlaysLikeEffLabel,
            qaPlaysLikeQualityLabel,
        ).forEach { label ->
            label.setTextColor(ContextCompat.getColor(context, android.R.color.white))
            label.textSize = 12f
        }

        qaFpsLabel.text = "FPS: --"
        qaLatencyLabel.text = "Latency: --"
        qaTrackingLabel.text = "Tracking: --"
        qaEtagLabel.text = "ETag age: --"
        qaHoleLabel.text = "Hole: –"
        qaRecenterLabel.text = "Recenter marks: 0"
        qaPlaysLikeHeader.apply {
            text = "Plays-like QA"
            textSize = 13f
            val topPadding = (8 * density).toInt()
            setPadding(0, topPadding, 0, 0)
        }
        qaPlaysLikeDistanceLabel.text = "D: --"
        qaPlaysLikeDeltaHLabel.text = "Δh: --"
        qaPlaysLikeWindLabel.text = "W∥: --"
        qaPlaysLikeKsLabel.text = "kS: --"
        qaPlaysLikeAlphaHeadLabel.text = "α_head: --"
        qaPlaysLikeAlphaTailLabel.text = "α_tail: --"
        qaPlaysLikeEffLabel.text = "Eff: --"
        qaPlaysLikeQualityLabel.text = "Quality: --"

        val markRow = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            addView(markButton)
        }

        val runButtons = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            val spacing = (6 * density).toInt()
            setPadding(0, spacing, 0, 0)
            addView(fieldRunStartButton)
            addView(fieldRunNextButton)
            addView(fieldRunEndButton)
        }

        listOf(markButton, fieldRunStartButton, fieldRunNextButton, fieldRunEndButton).forEach { button ->
            button.textSize = 12f
        }

        fieldRunNextButton.isEnabled = false
        fieldRunEndButton.isEnabled = false
        markButton.isEnabled = false

        qaContainer.addView(qaTitle)
        qaContainer.addView(qaFpsLabel)
        qaContainer.addView(qaLatencyLabel)
        qaContainer.addView(qaTrackingLabel)
        qaContainer.addView(qaEtagLabel)
        qaContainer.addView(qaHoleLabel)
        qaContainer.addView(qaRecenterLabel)
        qaContainer.addView(qaPlaysLikeHeader)
        qaContainer.addView(qaPlaysLikeDistanceLabel)
        qaContainer.addView(qaPlaysLikeDeltaHLabel)
        qaContainer.addView(qaPlaysLikeWindLabel)
        qaContainer.addView(qaPlaysLikeKsLabel)
        qaContainer.addView(qaPlaysLikeAlphaHeadLabel)
        qaContainer.addView(qaPlaysLikeAlphaTailLabel)
        qaContainer.addView(qaPlaysLikeEffLabel)
        qaContainer.addView(qaPlaysLikeQualityLabel)
        qaContainer.addView(markRow)
        qaContainer.addView(runButtons)

        addView(qaContainer, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
            gravity = Gravity.TOP or Gravity.END
            val margin = (12 * density).toInt()
            setMargins(margin, margin, margin, margin)
        })
    }

    fun setFieldTestVisible(visible: Boolean) {
        post { qaContainer.visibility = if (visible) View.VISIBLE else View.GONE }
    }

    fun updateFieldTestFps(fps: String) {
        post { qaFpsLabel.text = "FPS: $fps" }
    }

    fun updateFieldTestLatency(label: String) {
        post { qaLatencyLabel.text = "Latency: $label" }
    }

    fun updateFieldTestTracking(label: String) {
        post { qaTrackingLabel.text = "Tracking: $label" }
    }

    fun updateFieldTestEtagAge(days: Int?) {
        val value = when {
            days == null -> "–"
            days <= 0 -> "<1d"
            else -> "${days}d"
        }
        post { qaEtagLabel.text = "ETag age: $value" }
    }

    fun updateFieldRunState(active: Boolean, currentHole: Int?, recenterCount: Int) {
        val holeLabel = if (active && currentHole != null) {
            "Hole: $currentHole/9"
        } else {
            "Hole: –"
        }
        post {
            qaHoleLabel.text = holeLabel
            qaRecenterLabel.text = "Recenter marks: $recenterCount"
            markButton.isEnabled = active
            fieldRunStartButton.isEnabled = !active
            fieldRunNextButton.isEnabled = active && (currentHole ?: 1) < 9
            fieldRunEndButton.isEnabled = active
        }
    }
}
