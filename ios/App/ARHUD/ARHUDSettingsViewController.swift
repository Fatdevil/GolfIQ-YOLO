import UIKit

final class ARHUDSettingsViewController: UITableViewController {
    private enum Row: Int, CaseIterable {
        case hudEnabled
        case hudTracer
        case refresh

        var title: String {
            switch self {
            case .hudEnabled:
                return "Enable AR HUD"
            case .hudTracer:
                return "Enable HUD tracer"
            case .refresh:
                return "Refresh bundle"
            }
        }

        var subtitle: String {
            switch self {
            case .hudEnabled:
                return "Show Aim → Calibrate flow and AR overlay"
            case .hudTracer:
                return "Render debug tracer lines for calibration"
            case .refresh:
                return "Force re-download of course data"
            }
        }
    }

    private let featureFlags: FeatureFlagsService

    init(featureFlags: FeatureFlagsService) {
        self.featureFlags = featureFlags
        super.init(style: .insetGrouped)
        title = "AR HUD"
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "cell")
    }

    override func numberOfSections(in tableView: UITableView) -> Int {
        1
    }

    override func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        Row.allCases.count
    }

    override func tableView(
        _ tableView: UITableView,
        cellForRowAt indexPath: IndexPath
    ) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "cell", for: indexPath)
        guard let row = Row(rawValue: indexPath.row) else {
            return cell
        }

        var configuration = cell.defaultContentConfiguration()
        configuration.text = row.title
        configuration.secondaryText = row.subtitle
        cell.contentConfiguration = configuration

        switch row {
        case .hudEnabled:
            let toggle = UISwitch()
            toggle.tag = row.rawValue
            toggle.isOn = featureFlags.current().hudEnabled
            toggle.addTarget(self, action: #selector(handleToggle(_:)), for: .valueChanged)
            cell.accessoryView = toggle
        case .hudTracer:
            let toggle = UISwitch()
            toggle.tag = row.rawValue
            toggle.isOn = featureFlags.current().hudTracerEnabled
            toggle.addTarget(self, action: #selector(handleToggle(_:)), for: .valueChanged)
            cell.accessoryView = toggle
        case .refresh:
            let button = UIButton(type: .system)
            button.setTitle("Refresh", for: .normal)
            button.addTarget(self, action: #selector(handleRefreshTapped), for: .touchUpInside)
            cell.accessoryView = button
        }

        return cell
    }

    @objc
    private func handleToggle(_ sender: UISwitch) {
        guard let row = Row(rawValue: sender.tag) else { return }
        switch row {
        case .hudEnabled:
            featureFlags.setHudEnabled(sender.isOn)
        case .hudTracer:
            featureFlags.setHudTracerEnabled(sender.isOn)
        case .refresh:
            break
        }
    }

    @objc
    private func handleRefreshTapped() {
        NotificationCenter.default.post(name: .arhudBundleRefreshRequested, object: nil)
    }
}
