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
        qaFpsLabel.text = "FPS: --"
        qaLatencyLabel.text = "Latency: --"
        qaTrackingLabel.text = "Tracking: --"
        qaEtagLabel.text = "ETag age: --"
        qaHoleLabel.text = "Hole: –"
        qaRecenterLabel.text = "Recenter marks: 0"

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
