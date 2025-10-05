import Foundation
import UIKit

final class ARHUDOverlayView: UIView {
    let calibrateButton: UIButton = UIButton(type: .system)
    let recenterButton: UIButton = UIButton(type: .system)
    private let statusLabel: UILabel = UILabel()
    private let frontLabel: UILabel = UILabel()
    private let centerLabel: UILabel = UILabel()
    private let backLabel: UILabel = UILabel()
    private let modeBadge: UILabel = UILabel()

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
}
