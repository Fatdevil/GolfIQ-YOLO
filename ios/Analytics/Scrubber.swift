import Foundation
import Sentry

enum Scrubber {
    private static let maxFrames = 20

    static func scrub(event: Event?) -> Event? {
        guard let event else { return nil }
        event.user = nil
        event.request = nil
        event.serverName = nil
        if var contexts = event.context, !contexts.isEmpty {
            contexts.removeValue(forKey: "device")
            contexts.removeValue(forKey: "trace")
            event.context = contexts
        }
        if var breadcrumbs = event.breadcrumbs, !breadcrumbs.isEmpty {
            breadcrumbs = breadcrumbs.filter { breadcrumb in
                guard let message = breadcrumb.message?.lowercased() else { return true }
                return !(message.contains("@") || message.contains("email") || message.contains("ssn"))
            }
            event.breadcrumbs = Array(breadcrumbs.prefix(30))
        }
        if let exceptions = event.exceptions {
            for exception in exceptions {
                if var frames = exception.stacktrace?.frames, frames.count > maxFrames {
                    frames = Array(frames.suffix(maxFrames))
                    exception.stacktrace?.frames = frames
                }
            }
        }
        event.extra = [:]
        return event
    }
}
