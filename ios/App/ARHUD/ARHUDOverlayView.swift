import Foundation
import UIKit

final class ARHUDOverlayView: UIView {
    let calibrateButton: UIButton = UIButton(type: .system)
    let recenterButton: UIButton = UIButton(type: .system)
    let markButton: UIButton = UIButton(type: .system)
    let fieldRunStartButton: UIButton = UIButton(type: .system)
    let fieldRunNextButton: UIButton = UIButton(type: .system)
    let fieldRunEndButton: UIButton = UIButton(type: .system)
    private let statusLabel: UILabel = UILabel()
    private let frontLabel: UILabel = UILabel()
    private let centerLabel: UILabel = UILabel()
    private let backLabel: UILabel = UILabel()
    private let modeBadge: UILabel = UILabel()
    private let qaContainer: UIView = UIView()
    private let qaStack: UIStackView = UIStackView()
    private let qaFpsLabel: UILabel = UILabel()
    private let qaLatencyLabel: UILabel = UILabel()
    private let qaTrackingLabel: UILabel = UILabel()
    private let qaEtagLabel: UILabel = UILabel()
    private let qaHoleLabel: UILabel = UILabel()
    private let qaRecenterLabel: UILabel = UILabel()
    private let qaPlaysLikeHeader: UILabel = UILabel()
    private let qaPlaysLikeDistanceLabel: UILabel = UILabel()
    private let qaPlaysLikeDeltaHLabel: UILabel = UILabel()
    private let qaPlaysLikeWindLabel: UILabel = UILabel()
    private let qaPlaysLikeKsLabel: UILabel = UILabel()
    private let qaPlaysLikeAlphaHeadLabel: UILabel = UILabel()
    private let qaPlaysLikeAlphaTailLabel: UILabel = UILabel()
    private let qaPlaysLikeEffLabel: UILabel = UILabel()
    private let qaPlaysLikeQualityLabel: UILabel = UILabel()
    private let playsLikeContainer: UIStackView = UIStackView()
    private let playsLikeHeadline: UILabel = UILabel()
    private let playsLikeDeltaLabel: UILabel = UILabel()
    private let playsLikeChipStack: UIStackView = UIStackView()
    private let playsLikeSlopeChip: UILabel = UILabel()
    private let playsLikeWindChip: UILabel = UILabel()
    private let playsLikeQualityBadge: UILabel = UILabel()

    enum Mode {
        case geospatial
        case compass
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        configureViewHierarchy()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        configureViewHierarchy()
    }

    private func configureViewHierarchy() {
        backgroundColor = .clear

        calibrateButton.setTitle("Aim → Calibrate", for: .normal)
        calibrateButton.titleLabel?.font = UIFont.preferredFont(forTextStyle: .headline)

        recenterButton.setTitle("Re-center", for: .normal)
        recenterButton.titleLabel?.font = UIFont.preferredFont(forTextStyle: .subheadline)

        markButton.setTitle("Mark", for: .normal)
        markButton.titleLabel?.font = UIFont.preferredFont(forTextStyle: .caption1)

        fieldRunStartButton.setTitle("Start 9-hole", for: .normal)
        fieldRunStartButton.titleLabel?.font = UIFont.preferredFont(forTextStyle: .caption1)

        fieldRunNextButton.setTitle("Next hole", for: .normal)
        fieldRunNextButton.titleLabel?.font = UIFont.preferredFont(forTextStyle: .caption1)
        fieldRunNextButton.isEnabled = false

        fieldRunEndButton.setTitle("End run", for: .normal)
        fieldRunEndButton.titleLabel?.font = UIFont.preferredFont(forTextStyle: .caption1)
        fieldRunEndButton.isEnabled = false

        statusLabel.font = UIFont.preferredFont(forTextStyle: .footnote)
        statusLabel.textColor = .white
        statusLabel.numberOfLines = 2
        statusLabel.textAlignment = .center
        statusLabel.text = "Align device to pin and calibrate"

        modeBadge.font = UIFont.preferredFont(forTextStyle: .caption2)
        modeBadge.textColor = .black
        modeBadge.backgroundColor = UIColor.white.withAlphaComponent(0.85)
        modeBadge.layer.cornerRadius = 8
        modeBadge.layer.masksToBounds = true
        modeBadge.textAlignment = .center
        modeBadge.text = "Compass"
        modeBadge.setContentHuggingPriority(.required, for: .horizontal)
        modeBadge.setContentCompressionResistancePriority(.required, for: .horizontal)

        let distanceStack = UIStackView(arrangedSubviews: [frontLabel, centerLabel, backLabel])
        distanceStack.axis = .vertical
        distanceStack.spacing = 4

        [frontLabel, centerLabel, backLabel].forEach { label in
            label.font = UIFont.monospacedDigitSystemFont(ofSize: 16, weight: .medium)
            label.textColor = .white
            label.textAlignment = .right
            label.text = "--"
        }

        configurePlaysLikeSection(into: distanceStack)

        let controlsStack = UIStackView(arrangedSubviews: [calibrateButton, recenterButton])
        controlsStack.axis = .vertical
        controlsStack.spacing = 8

        let container = UIStackView(arrangedSubviews: [controlsStack, distanceStack])
        container.axis = .vertical
        container.spacing = 16
        container.alignment = .fill

        addSubview(container)
        addSubview(statusLabel)
        addSubview(modeBadge)
        configureFieldTestOverlay()

        container.translatesAutoresizingMaskIntoConstraints = false
        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        modeBadge.translatesAutoresizingMaskIntoConstraints = false

        NSLayoutConstraint.activate([
            container.leadingAnchor.constraint(equalTo: safeAreaLayoutGuide.leadingAnchor, constant: 16),
            container.trailingAnchor.constraint(equalTo: safeAreaLayoutGuide.trailingAnchor, constant: -16),
            container.bottomAnchor.constraint(equalTo: safeAreaLayoutGuide.bottomAnchor, constant: -24),

            statusLabel.leadingAnchor.constraint(equalTo: safeAreaLayoutGuide.leadingAnchor, constant: 16),
            statusLabel.trailingAnchor.constraint(equalTo: safeAreaLayoutGuide.trailingAnchor, constant: -16),
            statusLabel.bottomAnchor.constraint(equalTo: container.topAnchor, constant: -12),

            modeBadge.topAnchor.constraint(equalTo: safeAreaLayoutGuide.topAnchor, constant: 12),
            modeBadge.leadingAnchor.constraint(equalTo: safeAreaLayoutGuide.leadingAnchor, constant: 16),
            modeBadge.widthAnchor.constraint(greaterThanOrEqualToConstant: 88)
        ])
    }

    func updateStatus(_ text: String) {
        DispatchQueue.main.async {
            self.statusLabel.text = text
        }
    }

    func updateModeBadge(_ mode: Mode) {
        DispatchQueue.main.async {
            switch mode {
            case .geospatial:
                self.modeBadge.text = " Geospatial "
            case .compass:
                self.modeBadge.text = " Compass "
            }
        }
    }

    func updateDistances(front: String, center: String, back: String) {
        DispatchQueue.main.async {
            self.frontLabel.text = "F: \(front)"
            self.centerLabel.text = "C: \(center)"
            self.backLabel.text = "B: \(back)"
        }
    }

    func setPlaysLikeVisible(_ visible: Bool) {
        DispatchQueue.main.async {
            self.playsLikeContainer.isHidden = !visible
        }
    }

    func updatePlaysLike(effective: Double, slope: Double, wind: Double, quality: String) {
        DispatchQueue.main.async {
            let total = slope + wind
            self.playsLikeDeltaLabel.text = String(format: "Plays-like: %.1f m (Δ %+0.1f m)", effective, total)
            self.playsLikeSlopeChip.text = String(format: " slope %+0.1f m ", slope)
            self.playsLikeWindChip.text = String(format: " wind %+0.1f m ", wind)
            self.updateQualityBadge(quality: quality)
        }
    }

    func updatePlaysLikeQA(
        distance: Double,
        deltaH: Double,
        windParallel: Double,
        kS: Double,
        alphaHead: Double,
        alphaTail: Double,
        eff: Double,
        quality: String
    ) {
        DispatchQueue.main.async {
            self.qaPlaysLikeDistanceLabel.text = String(format: "D: %.1f m", distance)
            self.qaPlaysLikeDeltaHLabel.text = String(format: "Δh: %+0.1f m", deltaH)
            self.qaPlaysLikeWindLabel.text = String(format: "W∥: %+0.1f m/s", windParallel)
            self.qaPlaysLikeKsLabel.text = String(format: "kS: %.2f", kS)
            self.qaPlaysLikeAlphaHeadLabel.text = String(format: "α_head: %.3f /mph", alphaHead)
            self.qaPlaysLikeAlphaTailLabel.text = String(format: "α_tail: %.3f /mph", alphaTail)
            self.qaPlaysLikeEffLabel.text = String(format: "Eff: %.1f m", eff)
            self.qaPlaysLikeQualityLabel.text = "Quality: \(quality.uppercased())"
        }
    }

    private func configurePlaysLikeSection(into stack: UIStackView) {
        playsLikeContainer.axis = .vertical
        playsLikeContainer.spacing = 4
        playsLikeContainer.isHidden = true

        let header = UIStackView(arrangedSubviews: [playsLikeHeadline, playsLikeQualityBadge])
        header.axis = .horizontal
        header.spacing = 8
        header.alignment = .center

        playsLikeHeadline.text = "Plays-like"
        playsLikeHeadline.font = UIFont.preferredFont(forTextStyle: .subheadline)
        playsLikeHeadline.textColor = .white

        playsLikeQualityBadge.font = UIFont.preferredFont(forTextStyle: .caption2)
        playsLikeQualityBadge.textAlignment = .center
        playsLikeQualityBadge.text = "--"
        playsLikeQualityBadge.textColor = .black
        playsLikeQualityBadge.backgroundColor = UIColor.white.withAlphaComponent(0.85)
        playsLikeQualityBadge.layer.cornerRadius = 8
        playsLikeQualityBadge.layer.masksToBounds = true
        playsLikeQualityBadge.setContentHuggingPriority(.required, for: .horizontal)

        playsLikeDeltaLabel.text = "Plays-like: --"
        playsLikeDeltaLabel.font = UIFont.preferredFont(forTextStyle: .caption1)
        playsLikeDeltaLabel.textColor = UIColor(white: 0.8, alpha: 1)
        playsLikeDeltaLabel.textAlignment = .right

        playsLikeChipStack.axis = .horizontal
        playsLikeChipStack.spacing = 6

        [playsLikeSlopeChip, playsLikeWindChip].forEach { label in
            label.font = UIFont.preferredFont(forTextStyle: .caption2)
            label.textColor = .white
            label.textAlignment = .center
            label.text = " -- "
            label.backgroundColor = UIColor.white.withAlphaComponent(0.25)
            label.layer.cornerRadius = 10
            label.layer.masksToBounds = true
            label.setContentHuggingPriority(.required, for: .horizontal)
            label.setContentCompressionResistancePriority(.required, for: .horizontal)
            label.translatesAutoresizingMaskIntoConstraints = false
            label.heightAnchor.constraint(greaterThanOrEqualToConstant: 20).isActive = true
        }

        playsLikeChipStack.addArrangedSubview(playsLikeSlopeChip)
        playsLikeChipStack.addArrangedSubview(playsLikeWindChip)

        playsLikeContainer.addArrangedSubview(header)
        playsLikeContainer.addArrangedSubview(playsLikeDeltaLabel)
        playsLikeContainer.addArrangedSubview(playsLikeChipStack)

        stack.addArrangedSubview(playsLikeContainer)
    }

    private func updateQualityBadge(quality: String) {
        let normalized = quality.lowercased()
        switch normalized {
        case "good":
            playsLikeQualityBadge.text = "GOOD"
            playsLikeQualityBadge.backgroundColor = UIColor.systemGreen.withAlphaComponent(0.85)
        case "warn":
            playsLikeQualityBadge.text = "WARN"
            playsLikeQualityBadge.backgroundColor = UIColor.systemOrange.withAlphaComponent(0.85)
        default:
            playsLikeQualityBadge.text = "LOW"
            playsLikeQualityBadge.backgroundColor = UIColor.systemRed.withAlphaComponent(0.85)
        }
    }

    private func configureFieldTestOverlay() {
        qaContainer.translatesAutoresizingMaskIntoConstraints = false
        qaContainer.backgroundColor = UIColor.black.withAlphaComponent(0.7)
        qaContainer.layer.cornerRadius = 12
        qaContainer.layer.masksToBounds = true
        qaContainer.isHidden = true

        qaStack.axis = .vertical
        qaStack.spacing = 4
        qaStack.alignment = .leading
        qaStack.translatesAutoresizingMaskIntoConstraints = false

        let titleLabel = UILabel()
        titleLabel.text = "Field QA"
        titleLabel.font = UIFont.preferredFont(forTextStyle: .caption1)
        titleLabel.textColor = .white

        [qaFpsLabel, qaLatencyLabel, qaTrackingLabel, qaEtagLabel, qaHoleLabel, qaRecenterLabel].forEach { label in
            label.font = UIFont.preferredFont(forTextStyle: .caption2)
            label.textColor = .white
        }
        [
            qaPlaysLikeHeader,
            qaPlaysLikeDistanceLabel,
            qaPlaysLikeDeltaHLabel,
            qaPlaysLikeWindLabel,
            qaPlaysLikeKsLabel,
            qaPlaysLikeAlphaHeadLabel,
            qaPlaysLikeAlphaTailLabel,
            qaPlaysLikeEffLabel,
            qaPlaysLikeQualityLabel
        ].forEach { label in
            label.font = UIFont.preferredFont(forTextStyle: .caption2)
            label.textColor = .white
        }
        qaFpsLabel.text = "FPS: --"
        qaLatencyLabel.text = "Latency: --"
        qaTrackingLabel.text = "Tracking: --"
        qaEtagLabel.text = "ETag age: --"
        qaHoleLabel.text = "Hole: –"
        qaRecenterLabel.text = "Recenter marks: 0"
        qaPlaysLikeHeader.text = "Plays-like QA"
        qaPlaysLikeHeader.font = UIFont.preferredFont(forTextStyle: .caption1)
        qaPlaysLikeDistanceLabel.text = "D: --"
        qaPlaysLikeDeltaHLabel.text = "Δh: --"
        qaPlaysLikeWindLabel.text = "W∥: --"
        qaPlaysLikeKsLabel.text = "kS: --"
        qaPlaysLikeAlphaHeadLabel.text = "α_head: --"
        qaPlaysLikeAlphaTailLabel.text = "α_tail: --"
        qaPlaysLikeEffLabel.text = "Eff: --"
        qaPlaysLikeQualityLabel.text = "Quality: --"

        let markStack = UIStackView(arrangedSubviews: [markButton])
        markStack.axis = .vertical
        markStack.spacing = 4

        let runButtons = UIStackView(arrangedSubviews: [fieldRunStartButton, fieldRunNextButton, fieldRunEndButton])
        runButtons.axis = .vertical
        runButtons.spacing = 4

        qaStack.addArrangedSubview(titleLabel)
        qaStack.addArrangedSubview(qaFpsLabel)
        qaStack.addArrangedSubview(qaLatencyLabel)
        qaStack.addArrangedSubview(qaTrackingLabel)
        qaStack.addArrangedSubview(qaEtagLabel)
        qaStack.addArrangedSubview(qaHoleLabel)
        qaStack.addArrangedSubview(qaRecenterLabel)
        qaStack.addArrangedSubview(qaPlaysLikeHeader)
        qaStack.addArrangedSubview(qaPlaysLikeDistanceLabel)
        qaStack.addArrangedSubview(qaPlaysLikeDeltaHLabel)
        qaStack.addArrangedSubview(qaPlaysLikeWindLabel)
        qaStack.addArrangedSubview(qaPlaysLikeKsLabel)
        qaStack.addArrangedSubview(qaPlaysLikeAlphaHeadLabel)
        qaStack.addArrangedSubview(qaPlaysLikeAlphaTailLabel)
        qaStack.addArrangedSubview(qaPlaysLikeEffLabel)
        qaStack.addArrangedSubview(qaPlaysLikeQualityLabel)
        qaStack.addArrangedSubview(markStack)
        qaStack.addArrangedSubview(runButtons)

        qaContainer.addSubview(qaStack)
        addSubview(qaContainer)

        NSLayoutConstraint.activate([
            qaContainer.topAnchor.constraint(equalTo: safeAreaLayoutGuide.topAnchor, constant: 12),
            qaContainer.trailingAnchor.constraint(equalTo: safeAreaLayoutGuide.trailingAnchor, constant: -16),

            qaStack.leadingAnchor.constraint(equalTo: qaContainer.leadingAnchor, constant: 12),
            qaStack.trailingAnchor.constraint(equalTo: qaContainer.trailingAnchor, constant: -12),
            qaStack.topAnchor.constraint(equalTo: qaContainer.topAnchor, constant: 12),
            qaStack.bottomAnchor.constraint(equalTo: qaContainer.bottomAnchor, constant: -12)
        ])

        markButton.isEnabled = false
    }

    func setFieldTestVisible(_ visible: Bool) {
        DispatchQueue.main.async {
            self.qaContainer.isHidden = !visible
        }
    }

    func updateFieldTestFps(_ fps: String) {
        DispatchQueue.main.async {
            self.qaFpsLabel.text = "FPS: \(fps)"
        }
    }

    func updateFieldTestLatency(_ label: String) {
        DispatchQueue.main.async {
            self.qaLatencyLabel.text = "Latency: \(label)"
        }
    }

    func updateFieldTestTracking(_ label: String) {
        DispatchQueue.main.async {
            self.qaTrackingLabel.text = "Tracking: \(label)"
        }
    }

    func updateFieldTestEtagAge(_ days: Int?) {
        let text: String
        if let days {
            if days <= 0 {
                text = "<1d"
            } else {
                text = "\(days)d"
            }
        } else {
            text = "–"
        }
        DispatchQueue.main.async {
            self.qaEtagLabel.text = "ETag age: \(text)"
        }
    }

    func updateFieldRunState(active: Bool, currentHole: Int?, recenterCount: Int) {
        let holeText: String
        if active, let currentHole {
            holeText = "Hole: \(currentHole)/9"
        } else {
            holeText = "Hole: –"
        }
        DispatchQueue.main.async {
            self.qaHoleLabel.text = holeText
            self.qaRecenterLabel.text = "Recenter marks: \(recenterCount)"
            self.markButton.isEnabled = active
            self.fieldRunStartButton.isEnabled = !active
            self.fieldRunNextButton.isEnabled = active && (currentHole ?? 1) < 9
            self.fieldRunEndButton.isEnabled = active
        }
    }
}
