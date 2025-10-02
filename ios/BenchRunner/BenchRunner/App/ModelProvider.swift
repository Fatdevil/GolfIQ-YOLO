import Foundation
import CoreML

enum ModelProviderError: Error {
    case modelNotFound
    case unableToWriteModel
}

final class ModelProvider {
    private let modelName = "GradientIdentity"
    private var cachedCompiledURL: URL?
    private lazy var workingDirectory: URL? = {
        let base = FileManager.default.temporaryDirectory.appendingPathComponent("BenchRunnerModel", isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
            return base
        } catch {
            print("[ModelProvider] Unable to create working directory: \(error)")
            return nil
        }
    }()

    func loadModel() throws -> MLModel {
        if let cached = cachedCompiledURL {
            return try MLModel(contentsOf: cached)
        }
        guard let directory = workingDirectory else {
            throw ModelProviderError.unableToWriteModel
        }
        let rawURL = directory.appendingPathComponent("\(modelName).mlmodel")
        if !FileManager.default.fileExists(atPath: rawURL.path) {
            guard let data = Data(base64Encoded: EmbeddedResources.gradientModelBase64) else {
                throw ModelProviderError.modelNotFound
            }
            do {
                try data.write(to: rawURL, options: .atomic)
            } catch {
                throw ModelProviderError.unableToWriteModel
            }
        }
        let compiled = try MLModel.compileModel(at: rawURL)
        cachedCompiledURL = compiled
        return try MLModel(contentsOf: compiled)
    }

    func modelFileSizeMB() -> Double {
        guard let data = Data(base64Encoded: EmbeddedResources.gradientModelBase64) else { return 0 }
        return Double(data.count) / (1024.0 * 1024.0)
    }

    func identifier() -> String {
        modelName
    }
}
