public import Foundation

public enum MacFilesystem {
    public static func applicationSupportDirectory(appName: String) -> URL {
        let fileManager = FileManager.default
        let baseDirectories = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask)
        var result = URL(fileURLWithPath: NSHomeDirectory())
        if let baseDirectory = baseDirectories.first {
            result = baseDirectory
        }
        result = result.appendingPathComponent(appName, isDirectory: true)
        return result
    }
}
