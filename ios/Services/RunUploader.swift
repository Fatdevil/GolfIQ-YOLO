import Foundation
#if canImport(BackgroundTasks)
import BackgroundTasks
#endif

final class RunUploader {
    private struct PendingUpload: Codable {
        let runId: String
        let archivePath: String
    }

    private struct UploadIntent: Decodable {
        let url: String?
        let formUrl: String?
        let key: String
        let headers: [String: String]?
    }

    private enum RunUploadError: Error {
        case invalidIntent
        case badStatus(Int)
    }

    private static let storageKey = "com.golfiq.run-upload.queue"
    private static let taskIdentifier = "com.golfiq.run-upload"
    private static let sessionIdentifier = "com.golfiq.run-upload.session"

    private let baseURL: URL
    private let telemetryURL: URL
    private let queue = DispatchQueue(label: "com.golfiq.run-upload")
    private lazy var session: URLSession = {
        let configuration = URLSessionConfiguration.background(withIdentifier: Self.sessionIdentifier)
        configuration.isDiscretionary = true
        configuration.sessionSendsLaunchEvents = true
        configuration.waitsForConnectivity = true
        return URLSession(configuration: configuration)
    }()

    init(baseURL: URL) {
        self.baseURL = baseURL
        self.telemetryURL = baseURL.appendingPathComponent("telemetry")
        registerBackgroundTask()
    }

    func enqueue(runId: String, archiveURL: URL) {
        queue.async {
            var pending = self.loadQueue()
            pending.removeAll { $0.runId == runId }
            pending.append(PendingUpload(runId: runId, archivePath: archiveURL.path))
            self.saveQueue(pending)
            self.scheduleProcessingTask()
            self.processQueue()
        }
    }

    private func registerBackgroundTask() {
        #if canImport(BackgroundTasks)
        if #available(iOS 13.0, *) {
            BGTaskScheduler.shared.register(forTaskWithIdentifier: Self.taskIdentifier, using: nil) { [weak self] task in
                guard let processingTask = task as? BGProcessingTask else {
                    task.setTaskCompleted(success: false)
                    return
                }
                self?.handleBackgroundTask(task: processingTask)
            }
        }
        #endif
    }

    #if canImport(BackgroundTasks)
    @available(iOS 13.0, *)
    private func handleBackgroundTask(task: BGProcessingTask) {
        scheduleProcessingTask()
        processQueue { success in
            task.setTaskCompleted(success: success)
        }
    }
    #endif

    private func scheduleProcessingTask() {
        guard !loadQueue().isEmpty else { return }
        #if canImport(BackgroundTasks)
        if #available(iOS 13.0, *) {
            let request = BGProcessingTaskRequest(identifier: Self.taskIdentifier)
            request.requiresNetworkConnectivity = true
            request.requiresExternalPower = false
            request.earliestBeginDate = Date(timeIntervalSinceNow: 60)
            do {
                try BGTaskScheduler.shared.submit(request)
            } catch {
                // Ignore duplicate scheduling errors.
            }
        }
        #endif
    }

    private func processQueue(completion: ((Bool) -> Void)? = nil) {
        queue.async {
            var pending = self.loadQueue()
            var success = true
            while let item = pending.first {
                do {
                    let archiveURL = URL(fileURLWithPath: item.archivePath)
                    let attributes = try FileManager.default.attributesOfItem(atPath: archiveURL.path)
                    let sizeBytes = (attributes[.size] as? NSNumber)?.int64Value ?? 0
                    let start = Date()
                    let intent = try self.requestUploadIntent(runId: item.runId)
                    try self.performUpload(intent: intent, archiveURL: archiveURL)
                    let duration = Date().timeIntervalSince(start)
                    self.postTelemetry(key: intent.key, size: sizeBytes, duration: duration)
                    pending.removeFirst()
                    self.saveQueue(pending)
                } catch {
                    success = false
                    break
                }
            }
            completion?(success)
            if !pending.isEmpty {
                self.scheduleProcessingTask()
            }
        }
    }

    private func loadQueue() -> [PendingUpload] {
        guard let data = UserDefaults.standard.data(forKey: Self.storageKey) else {
            return []
        }
        return (try? JSONDecoder().decode([PendingUpload].self, from: data)) ?? []
    }

    private func saveQueue(_ queue: [PendingUpload]) {
        if let data = try? JSONEncoder().encode(queue) {
            UserDefaults.standard.set(data, forKey: Self.storageKey)
        }
    }

    private func requestUploadIntent(runId: String) throws -> UploadIntent {
        var request = URLRequest(url: baseURL.appendingPathComponent("runs/upload-url"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["runId": runId])
        let (data, response) = try session.syncDataTask(with: request)
        guard let http = response as? HTTPURLResponse else {
            throw RunUploadError.invalidIntent
        }
        guard (200...299).contains(http.statusCode), let data else {
            throw RunUploadError.badStatus(http.statusCode)
        }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .useDefaultKeys
        return try decoder.decode(UploadIntent.self, from: data)
    }

    private func performUpload(intent: UploadIntent, archiveURL: URL) throws {
        if let urlString = intent.url, let target = URL(string: urlString) {
            var request = URLRequest(url: target)
            request.httpMethod = "PUT"
            request.timeoutInterval = 30
            intent.headers?.forEach { key, value in
                request.setValue(value, forHTTPHeaderField: key)
            }
            if request.value(forHTTPHeaderField: "Content-Type") == nil {
                request.setValue("application/zip", forHTTPHeaderField: "Content-Type")
            }
            try session.syncUpload(request: request, fileURL: archiveURL)
        } else if let formUrl = intent.formUrl, let target = URL(string: formUrl, relativeTo: baseURL) {
            let boundary = "Boundary-\(UUID().uuidString)"
            var request = URLRequest(url: target)
            request.httpMethod = "POST"
            request.timeoutInterval = 30
            request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
            let body = try multipartBody(boundary: boundary, key: intent.key, archiveURL: archiveURL)
            try session.syncUpload(request: request, body: body)
        } else {
            throw RunUploadError.invalidIntent
        }
    }

    private func multipartBody(boundary: String, key: String, archiveURL: URL) throws -> Data {
        var body = Data()
        if let keyData = "--\(boundary)\r\nContent-Disposition: form-data; name=\"key\"\r\n\r\n\(key)\r\n".data(using: .utf8) {
            body.append(keyData)
        }
        let header = "--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"\(archiveURL.lastPathComponent)\"\r\nContent-Type: application/zip\r\n\r\n"
        if let headerData = header.data(using: .utf8) {
            body.append(headerData)
        }
        let fileData = try Data(contentsOf: archiveURL)
        body.append(fileData)
        if let closing = "\r\n--\(boundary)--\r\n".data(using: .utf8) {
            body.append(closing)
        }
        return body
    }

    private func postTelemetry(key: String, size: Int64, duration: TimeInterval) {
        var request = URLRequest(url: telemetryURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let payload: [String: Any] = [
            "event": "upload_complete",
            "key": key,
            "size": size,
            "durationMs": Int(duration * 1000)
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: payload)
        _ = try? session.syncDataTask(with: request)
    }
}

private extension URLSession {
    func syncDataTask(with request: URLRequest) throws -> (Data?, URLResponse?) {
        var responseData: Data?
        var response: URLResponse?
        var responseError: Error?
        let semaphore = DispatchSemaphore(value: 0)
        let task = dataTask(with: request) { data, resp, error in
            responseData = data
            response = resp
            responseError = error
            semaphore.signal()
        }
        task.resume()
        semaphore.wait()
        if let error = responseError {
            throw error
        }
        return (responseData, response)
    }

    func syncUpload(request: URLRequest, fileURL: URL) throws {
        var responseError: Error?
        var statusCode: Int = 0
        let semaphore = DispatchSemaphore(value: 0)
        let task = uploadTask(with: request, fromFile: fileURL) { _, response, error in
            responseError = error
            statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            semaphore.signal()
        }
        task.resume()
        semaphore.wait()
        if let error = responseError {
            throw error
        }
        guard (200...299).contains(statusCode) else {
            throw RunUploader.RunUploadError.badStatus(statusCode)
        }
    }

    func syncUpload(request: URLRequest, body: Data) throws {
        var responseError: Error?
        var statusCode: Int = 0
        let semaphore = DispatchSemaphore(value: 0)
        let task = uploadTask(with: request, from: body) { _, response, error in
            responseError = error
            statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            semaphore.signal()
        }
        task.resume()
        semaphore.wait()
        if let error = responseError {
            throw error
        }
        guard (200...299).contains(statusCode) else {
            throw RunUploader.RunUploadError.badStatus(statusCode)
        }
    }
}
