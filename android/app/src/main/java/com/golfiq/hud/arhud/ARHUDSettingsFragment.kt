package com.golfiq.hud.arhud

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.Switch
import android.widget.TextView
import androidx.core.view.setPadding
import androidx.fragment.app.Fragment
import com.golfiq.hud.config.FeatureFlagsService

class ARHUDSettingsFragment : Fragment() {

    private val featureFlagsService: FeatureFlagsService by lazy { FeatureFlagsService() }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val density = resources.displayMetrics.density

        val root = LinearLayout(requireContext()).apply {
            orientation = LinearLayout.VERTICAL
            val padding = (16 * density).toInt()
            setPadding(padding)
        }

        root.addView(makeToggleRow(
            title = "Enable AR HUD",
            subtitle = "Show Aim → Calibrate overlay",
            initial = featureFlagsService.current().hudEnabled
        ) { enabled ->
            featureFlagsService.setHudEnabled(enabled)
        })

        root.addView(makeToggleRow(
            title = "HUD tracer",
            subtitle = "Render debug tracer lines",
            initial = featureFlagsService.current().hudTracerEnabled
        ) { enabled ->
            featureFlagsService.setHudTracerEnabled(enabled)
        })

        root.addView(makeToggleRow(
            title = "Field test mode",
            subtitle = "Show QA overlay and field markers",
            initial = featureFlagsService.current().fieldTestModeEnabled
        ) { enabled ->
            featureFlagsService.setFieldTestModeEnabled(enabled)
        })

        val refreshButton = Button(requireContext()).apply {
            text = "Refresh bundle"
            setOnClickListener { BundleRefreshBus.requestRefresh() }
        }
        root.addView(refreshButton)

        return root
    }

    private fun makeToggleRow(
        title: String,
        subtitle: String,
        initial: Boolean,
        onToggle: (Boolean) -> Unit
    ): View {
        val row = LinearLayout(requireContext()).apply {
            orientation = LinearLayout.VERTICAL
            val vertical = (12 * density).toInt()
            setPadding(0, vertical, 0, vertical)
        }

        val titleLabel = TextView(requireContext()).apply {
            text = title
            textSize = 16f
        }

        val subtitleLabel = TextView(requireContext()).apply {
            text = subtitle
            textSize = 12f
        }

        val toggle = Switch(requireContext()).apply {
            isChecked = initial
            setOnCheckedChangeListener { _, checked -> onToggle(checked) }
        }

        row.addView(titleLabel)
        row.addView(subtitleLabel)
        row.addView(toggle)
        return row
    }
}
